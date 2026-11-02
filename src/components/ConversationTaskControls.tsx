import { AlertCircle, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { taskJobStatusLabels, taskStepLabel } from '../lib/chatActivity'
import { cancelChat, cancelTaskJob, isDesktop, listTaskJobs, pauseTaskWorker, resumeTaskWorker, retryTaskWorkerStep } from '../lib/desktop'
import { cancelLongTextAnalysis, pauseLongTextAnalysis, resumeLongTextAnalysis } from '../lib/longTextAnalysis'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { TaskJob } from '../types'

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
    if (action === 'cancel' && !window.confirm('停止此任务？已生成的内容和已保存的分析文件会保留。')) return
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
    if (!window.confirm(stepId ? `从「${taskStepLabel(stepId)}」重新执行？此步骤及依赖它的后续步骤将重新处理，已有过程记录会保留。` : '继续处理此失败任务？')) return
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
    {jobs.some((job) => job.status === 'failed') && <p className="conversation-task-snapshot">本会话存在失败任务：可直接选择步骤重试；失败的中间产物已保留，重试不会覆盖尚未保存的草稿。</p>}
    {jobs.map((job) => {
      const selectedStep = selectedSteps[job.taskId]
        ?? [...job.steps].reverse().find((step) => step.status === 'failed')?.id
        ?? job.steps.at(-1)?.id
        ?? ''
      return <div className={`conversation-task-control status-${job.status}`} key={job.taskId}>
        <div className="conversation-task-copy">
          {job.status === 'failed' ? <AlertCircle /> : job.status === 'paused' ? <Pause /> : <Play />}
          <span><strong>{job.displayTitle || '长文本分析任务'}</strong><small>{taskJobStatusLabels[job.status]} · #{job.taskId.slice(0, 6).toUpperCase()}</small></span>
        </div>
        <div className="conversation-task-actions">
          {job.status === 'running' && <><button title="暂停任务" aria-label="暂停任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'pause')}><Pause /></button><button title="停止任务" aria-label="停止任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'cancel')}><X /></button></>}
          {job.status === 'paused' && <><button title="继续处理" aria-label="继续处理" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'resume')}><Play /></button><button title="停止任务" aria-label="停止任务" disabled={busyJobId !== null} onClick={() => void changeStatus(job, 'cancel')}><X /></button></>}
          {job.status === 'failed' && <>{job.steps.length > 0 && <><label htmlFor={`conversation-retry-${job.taskId}`}>从此步骤重新执行</label><select id={`conversation-retry-${job.taskId}`} value={selectedStep} disabled={job.failure?.retryable === false || busyJobId !== null} onChange={(event) => setSelectedSteps((current) => ({ ...current, [job.taskId]: event.target.value }))}>{job.steps.map((step) => <option key={step.id} value={step.id}>{taskStepLabel(step.id)}</option>)}</select></>}<button className="task-command" title={!isDesktop() ? '步骤重试仅在桌面应用中可用' : job.failure?.retryable === false ? '需重新发起任务' : '重试任务'} disabled={!isDesktop() || job.failure?.retryable === false || busyJobId !== null} onClick={() => void retry(job)}><RotateCcw />重试</button></>}
        </div>
        {job.status === 'failed' && <p className="conversation-task-error">{job.failure?.message || job.error || '任务执行失败'}{job.failure?.retryable === false ? ' · 需重新发起任务' : ''}</p>}
        {job.status === 'failed' && <p className="conversation-task-snapshot">输入快照：{job.displayTitle ?? '长文本分析任务'} · 模型 {job.modelNameSnapshot ?? '未知'} · 工作区 {job.workspaceNameSnapshot ?? '未知'}</p>}
      </div>
    })}
  </section>
}
