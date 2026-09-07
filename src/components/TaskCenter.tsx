import { AlertCircle, Check, ChevronDown, ChevronRight, Eye, RefreshCw, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLongTextWorkerOutput, listTaskJobs, retryTaskWorkerStep } from '../lib/desktop'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { LongTextWorkerOutput, TaskJob } from '../types'

const statusLabels: Record<TaskJob['status'], string> = {
  planned: '等待中', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消',
}

function stepLabel(stepId: string): string {
  if (stepId === 'chunking') return '文档分块'
  if (stepId === 'map') return '逐块分析'
  if (stepId === 'synthesis') return '最终综合'
  if (stepId === 'evidence') return '证据校验'
  if (stepId.startsWith('reduce-')) return `第 ${stepId.slice(7)} 层归并`
  return stepId
}

export function TaskCenter() {
  const workspace = useAppStore((state) => state.workspace)
  const setError = useAppStore((state) => state.setError)
  const [jobs, setJobs] = useState<TaskJob[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedSteps, setSelectedSteps] = useState<Record<string, string>>({})
  const [retrying, setRetrying] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, LongTextWorkerOutput>>({})

  const refresh = useCallback(async () => {
    if (!workspace) { setJobs([]); return }
    setLoading(true)
    try { setJobs(await listTaskJobs()) } catch (error) { setError(formatServiceError(error)) } finally { setLoading(false) }
  }, [setError, workspace])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2_500)
    return () => window.clearInterval(timer)
  }, [refresh])

  const counts = useMemo(() => ({
    running: jobs.filter((job) => job.status === 'running' || job.status === 'paused').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
  }), [jobs])

  const retry = async (job: TaskJob) => {
    const fallback = [...job.steps].reverse().find((step) => step.status === 'failed')?.id ?? job.steps.at(-1)?.id
    const stepId = selectedSteps[job.taskId] ?? fallback
    if (!stepId || !window.confirm(`从“${stepLabel(stepId)}”重新执行任务？`)) return
    setRetrying(job.taskId)
    try {
      await retryTaskWorkerStep(job.taskId, stepId)
      setOutputs((current) => { const next = { ...current }; delete next[job.taskId]; return next })
      await refresh()
    } catch (error) { setError(formatServiceError(error)) } finally { setRetrying(null) }
  }

  const inspectOutput = async (jobId: string) => {
    if (outputs[jobId]) { setExpanded(expanded === jobId ? null : jobId); return }
    try {
      const output = await getLongTextWorkerOutput(jobId)
      if (!output) throw new Error('任务结果尚未完成或已经失效')
      setOutputs((current) => ({ ...current, [jobId]: output }))
      setExpanded(jobId)
    } catch (error) { setError(formatServiceError(error)) }
  }

  if (!workspace) return <div className="task-center-empty"><AlertCircle /><strong>未打开项目</strong></div>

  return <section className="task-center" aria-label="任务中心">
    <header className="task-center-toolbar">
      <div className="task-center-counts"><span>运行 {counts.running}</span><span>完成 {counts.completed}</span><span className={counts.failed ? 'danger' : ''}>失败 {counts.failed}</span></div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} />刷新</button>
    </header>
    <div className="task-list">
      {jobs.length === 0 && <div className="task-center-empty"><Check /><strong>暂无后台任务</strong></div>}
      {jobs.map((job) => {
        const selectedStep = selectedSteps[job.taskId]
          ?? [...job.steps].reverse().find((step) => step.status === 'failed')?.id
          ?? job.steps.at(-1)?.id
          ?? ''
        const output = outputs[job.taskId]
        return <article className="task-row" key={job.taskId}>
          <button className="task-row-toggle" onClick={() => setExpanded(expanded === job.taskId ? null : job.taskId)} aria-expanded={expanded === job.taskId}>
            {expanded === job.taskId ? <ChevronDown /> : <ChevronRight />}
            <span><strong>{job.taskType === 'long-text-analysis' ? '长文本分析' : job.taskType}</strong><small>{job.taskId}</small></span>
          </button>
          <span className={`task-status status-${job.status}`}>{statusLabels[job.status]}</span>
          <time>{new Date(job.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
          <div className="task-row-actions">
            {job.status === 'completed' && <button title="查看结果" aria-label="查看结果" onClick={() => void inspectOutput(job.taskId)}><Eye /></button>}
            {job.status === 'failed' && job.steps.length > 0 && <>
              <select aria-label="选择重跑步骤" value={selectedStep} disabled={job.failure?.retryable === false} onChange={(event) => setSelectedSteps((current) => ({ ...current, [job.taskId]: event.target.value }))}>
                {job.steps.map((step) => <option key={step.id} value={step.id}>{stepLabel(step.id)}</option>)}
              </select>
              <button title={job.failure?.retryable === false ? '该失败需重新发起任务' : '重跑所选步骤'} aria-label="重跑所选步骤" disabled={retrying === job.taskId || job.failure?.retryable === false} onClick={() => void retry(job)}><RotateCcw /></button>
            </>}
          </div>
          {expanded === job.taskId && <div className="task-detail">
            {job.failure && <div className="task-failure"><AlertCircle /><span><strong>{job.failure.code}</strong><small>{job.failure.message}</small></span><b>{job.failure.retryable ? '可重试' : '需重新发起'}</b></div>}
            <ol className="task-steps">{job.steps.map((step) => <li key={step.id} className={`status-${step.status}`}><i /><span><strong>{stepLabel(step.id)}</strong><small>第 {step.attempt} 次 · {step.checkpoint ?? '无检查点'}</small></span></li>)}</ol>
            {output && <div className="task-output">
              <div><span>模型调用 {output.modelInvocationCount}</span><span>跨任务命中 {output.mapCacheHits}</span><span>任务内命中 {output.jobCheckpointHits}</span><span>耗时 {(output.durationMs / 1000).toFixed(1)} 秒</span></div>
              <pre>{output.content}</pre>
            </div>}
          </div>}
        </article>
      })}
    </div>
  </section>
}
