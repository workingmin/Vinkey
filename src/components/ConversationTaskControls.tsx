import { AlertCircle, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelChat, cancelTaskJob, isDesktop, listTaskJobs, pauseTaskWorker, resumeTaskWorker, retryTaskWorkerStep } from '../lib/desktop'
import { cancelLongTextAnalysis, pauseLongTextAnalysis, resumeLongTextAnalysis } from '../lib/longTextAnalysis'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { TaskJob } from '../types'

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

export function ConversationTaskControls({ conversationId }: { conversationId: string | null }) {
  const workspace = useAppStore((state) => state.workspace)
  const setError = useAppStore((state) => state.setError)
  const [jobs, setJobs] = useState<TaskJob[]>([])
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [selectedSteps, setSelectedSteps] = useState<Record<string, string>>({})
  const [error, setLocalError] = useState<string | null>(null)
  const scope = useRef('')
  const actionLock = useRef(false)
  scope.current = `${workspace?.id}/${conversationId}`

  const refresh = useCallback(async () => {
    if (!workspace || !conversationId) { setJobs([]); return }
    const queryScope = scope.current
    try {
      const values = await listTaskJobs(conversationId)
      if (scope.current !== queryScope) return
      setJobs(values.filter((job) => job.workspaceId === workspace.id && job.taskType === 'long-text-analysis' && ['running', 'paused', 'failed'].includes(job.status)))
      setLocalError(null)
    } catch (error) { if (scope.current === queryScope) setLocalError(formatServiceError(error)) }
  }, [conversationId, workspace])

  useEffect(() => {
    setJobs([])
    setLocalError(null)
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2_500)
    return () => window.clearInterval(timer)
  }, [refresh])

  const changeStatus = async (job: TaskJob, action: 'pause' | 'resume' | 'cancel') => {
    if (actionLock.current || job.conversationId !== conversationId || job.workspaceId !== workspace?.id) return
    if (action === 'cancel' && !window.confirm('取消此任务？已完成的中间产物会保留。')) return
    actionLock.current = true
    setBusyJobId(job.taskId)
    try {
      if (action === 'pause') await pauseTaskWorker(job.taskId)
      else if (action === 'resume') await resumeTaskWorker(job.taskId)
      else await cancelTaskJob(job.taskId)
      const run = conversationId ? useAppStore.getState().chatRuns[conversationId] : undefined
      if (run?.taskJobId === job.taskId) {
        if (action === 'pause') pauseLongTextAnalysis(run.requestId)
        else if (action === 'resume') resumeLongTextAnalysis(run.requestId)
        else { cancelLongTextAnalysis(run.requestId); await cancelChat(run.requestId) }
      }
      await refresh()
    } catch (error) { setError(formatServiceError(error)) } finally { actionLock.current = false; setBusyJobId(null) }
  }

  const retry = async (job: TaskJob) => {
    if (actionLock.current || job.failure?.retryable === false || job.conversationId !== conversationId || job.workspaceId !== workspace?.id) return
    const fallback = [...job.steps].reverse().find((step) => step.status === 'failed')?.id ?? job.steps.at(-1)?.id
    const stepId = selectedSteps[job.taskId] ?? fallback
    if (!window.confirm(stepId ? `从“${stepLabel(stepId)}”重新执行任务？` : '恢复此失败任务？')) return
    actionLock.current = true
    setBusyJobId(job.taskId)
    try {
      if (stepId) await retryTaskWorkerStep(job.taskId, stepId)
      else await resumeTaskWorker(job.taskId)
      await refresh()
    } catch (error) { setError(formatServiceError(error)) } finally { actionLock.current = false; setBusyJobId(null) }
  }

  if (jobs.length === 0 && !error) return null

  return <section className="conversation-task-controls" aria-label="当前会话任务控制">
    {error && <p role="alert">{error}</p>}
    {jobs.map((job) => {
      const selectedStep = selectedSteps[job.taskId]
        ?? [...job.steps].reverse().find((step) => step.status === 'failed')?.id
        ?? job.steps.at(-1)?.id
        ?? ''
      return <div className={`conversation-task-control status-${job.status}`} key={job.taskId}>
        <div className="conversation-task-copy">
          {job.status === 'failed' ? <AlertCircle /> : job.status === 'paused' ? <Pause /> : <Play />}
          <span><strong>{job.displayTitle || '长文本分析任务'}</strong><small>{statusLabels[job.status]} · #{job.taskId.slice(0, 6).toUpperCase()}</small></span>
        </div>
        <div className="conversation-task-actions">
          {job.status === 'running' && <><button title="暂停任务" aria-label="暂停任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'pause')}><Pause /></button><button title="取消任务" aria-label="取消任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'cancel')}><X /></button></>}
          {job.status === 'paused' && <><button title="继续任务" aria-label="继续任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'resume')}><Play /></button><button title="取消任务" aria-label="取消任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'cancel')}><X /></button></>}
          {job.status === 'failed' && <>{job.steps.length > 0 && <><label htmlFor={`conversation-retry-${job.taskId}`}>从此步骤重新执行</label><select id={`conversation-retry-${job.taskId}`} value={selectedStep} disabled={job.failure?.retryable === false || busyJobId !== null} onChange={(event) => setSelectedSteps((current) => ({ ...current, [job.taskId]: event.target.value }))}>{job.steps.map((step) => <option key={step.id} value={step.id}>{stepLabel(step.id)}</option>)}</select></>}<button className="task-command" title={!isDesktop() ? '步骤重试仅在桌面应用中可用' : job.failure?.retryable === false ? '需重新发起任务' : '重试任务'} disabled={!isDesktop() || job.failure?.retryable === false || busyJobId !== null} onClick={() => void retry(job)}><RotateCcw />重试</button></>}
        </div>
        {job.status === 'failed' && <p className="conversation-task-error">{job.failure?.message || job.error || '任务执行失败'}{job.failure?.retryable === false ? ' · 需重新发起任务' : ''}</p>}
      </div>
    })}
  </section>
}
