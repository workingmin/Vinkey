import { AlertCircle, Check, ChevronDown, ChevronRight, Copy, Eye, MessageSquareText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLongTextWorkerOutput, listTaskJobs } from '../lib/desktop'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { LongTextWorkerOutput, TaskJob } from '../types'

const statusLabels: Record<TaskJob['status'], string> = {
  planned: '等待中', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消',
}

function stepLabel(stepId: string): string {
  if (stepId === 'chunking') return '文档分块'
  if (stepId === 'map') return '逐块分析'
  if (stepId === 'chapter') return '章节汇总'
  if (stepId === 'volume') return '卷级汇总'
  if (stepId === 'synthesis') return '最终综合'
  if (stepId === 'evidence') return '证据校验'
  if (stepId.startsWith('reduce-')) return `第 ${stepId.slice(7)} 层归并`
  return stepId
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    'task.started': '任务已启动', 'task.resumed': '任务已恢复', 'task.paused': '任务已暂停',
    'task.failed': '任务执行失败', 'task.cancelled': '任务已取消', 'task.completed': '任务已完成',
    'worker.paused': 'Worker 已暂停', 'worker.resumed': 'Worker 已恢复', 'step.completed': '步骤已完成',
    'step.started': '步骤已开始', 'step.failed': '步骤执行失败', 'step.retry_requested': '步骤已请求重试',
    'worker.step_retry_requested': '步骤已请求重试', 'worker.completed': 'Worker 已完成', 'worker.failed': 'Worker 执行失败',
    'worker.restore_failed': 'Worker 恢复失败', 'worker.cache_recovered': '已恢复缓存产物',
  }
  return labels[eventType] ?? eventType
}

export function diagnosticsText(job: TaskJob): string {
  const lines = [
    `任务：${job.displayTitle || job.taskType}`,
    `任务 ID：${job.taskId}`,
    `状态：${statusLabels[job.status]}`,
    `项目：${job.workspaceNameSnapshot || job.workspaceId}`,
    `会话：${job.conversationTitleSnapshot || '来源未知'}`,
    `执行模型：${[job.modelNameSnapshot, job.connectionNameSnapshot].filter(Boolean).join(' · ') || '来源未知'}`,
  ]
  if (job.failure) lines.push(`失败：${job.failure.code} · ${job.failure.message}`)
  lines.push('', '业务链路：', ...job.events.slice(-50).map((event) => `${new Date(event.timestamp).toLocaleString('zh-CN')} · ${eventLabel(event.eventType)}${event.stepId ? ` · ${stepLabel(event.stepId)}` : ''}`))
  return lines.join('\n')
}

export function TaskCenter({ onOpenSource }: { onOpenSource: (conversationId: string) => Promise<void> }) {
  const workspace = useAppStore((state) => state.workspace)
  const setError = useAppStore((state) => state.setError)
  const [jobs, setJobs] = useState<TaskJob[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
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

  const copyDiagnostics = async (job: TaskJob) => {
    try {
      await navigator.clipboard.writeText(diagnosticsText(job))
      setCopiedTaskId(job.taskId)
      window.setTimeout(() => setCopiedTaskId((current) => current === job.taskId ? null : current), 1_800)
    } catch { setError('复制任务诊断信息失败') }
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
      {jobs.length > 0 && <div className="task-list-header" role="row">
        <span>任务</span><span>状态</span><span>更新时间</span><span>查看</span>
      </div>}
      {jobs.length === 0 && <div className="task-center-empty"><Check /><strong>暂无后台任务</strong></div>}
      {jobs.map((job) => {
        const output = outputs[job.taskId]
        const shortId = job.taskId.slice(0, 6).toUpperCase()
        const title = job.displayTitle || (job.taskType === 'long-text-analysis' ? '长文本分析任务' : job.taskType)
        const conversation = job.conversationTitleSnapshot ? `${job.conversationTitleSnapshot} · #${shortId}` : `独立任务 · #${shortId}`
        return <article className="task-row" key={job.taskId}>
          <button className="task-row-toggle" onClick={() => setExpanded(expanded === job.taskId ? null : job.taskId)} aria-expanded={expanded === job.taskId}>
            {expanded === job.taskId ? <ChevronDown /> : <ChevronRight />}
            <span title={`${title} · ${conversation}`}><strong>{title}</strong><small>{conversation}</small></span>
          </button>
          <span className={`task-status status-${job.status}`}>{statusLabels[job.status]}</span>
          <time>{new Date(job.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
          <div className="task-row-actions">
            {job.status === 'completed' && <button title="查看结果" aria-label="查看结果" onClick={() => void inspectOutput(job.taskId)}><Eye /></button>}
            {job.conversationId && <button title="返回来源会话" aria-label="返回来源会话" onClick={() => void onOpenSource(job.conversationId!)}><MessageSquareText /></button>}
          </div>
          {expanded === job.taskId && <div className="task-detail">
            <div className="task-metadata"><span>项目：{job.workspaceNameSnapshot || '来源未知'}</span><span>会话：{job.conversationTitleSnapshot || '来源未知'}</span><span>执行模型：{job.modelNameSnapshot || '来源未知'}{job.connectionNameSnapshot ? ` · ${job.connectionNameSnapshot}` : ''}</span><span className="task-id">任务 ID：{job.taskId}</span></div>
            {job.failure && <div className="task-failure"><AlertCircle /><span><strong>{job.failure.code}</strong><small>{job.failure.message}</small></span><b>{job.failure.retryable ? '可重试' : '需重新发起'}</b></div>}
            <ol className="task-steps">{job.steps.map((step) => <li key={step.id} className={`status-${step.status}`}><i /><span><strong>{stepLabel(step.id)}</strong><small>第 {step.attempt} 次 · {step.checkpoint ?? '无检查点'}</small></span></li>)}</ol>
            <section className="task-events" aria-label="业务链路"><strong>业务链路</strong><ol>{job.events.length === 0 ? <li><span>暂无运行事件</span></li> : job.events.slice(-50).map((event) => <li key={event.sequence}><time>{new Date(event.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time><span>{eventLabel(event.eventType)}</span>{event.stepId && <code>{stepLabel(event.stepId)}</code>}</li>)}</ol></section>
            {output && <div className="task-output">
              <div><span>模型调用 {output.modelInvocationCount}</span><span>跨任务命中 {output.stageCacheHits}</span><span>任务内命中 {output.jobCheckpointHits}</span><span>耗时 {(output.durationMs / 1000).toFixed(1)} 秒</span></div>
              <small>中间产物：.vinkey/analysis/jobs/{job.taskId}/</small>
              <pre>{output.content}</pre>
            </div>}
            <div className="task-detail-actions">
              <button title={copiedTaskId === job.taskId ? '诊断摘要已复制' : '复制诊断摘要'} aria-label={copiedTaskId === job.taskId ? '诊断摘要已复制' : '复制诊断摘要'} onClick={() => void copyDiagnostics(job)}>
                {copiedTaskId === job.taskId ? <Check /> : <Copy />}
                {copiedTaskId === job.taskId ? '已复制' : '复制诊断摘要'}
              </button>
            </div>
          </div>}
        </article>
      })}
    </div>
  </section>
}
