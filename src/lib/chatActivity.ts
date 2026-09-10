import type { ChatActivity, TaskWorkerEvent } from '../types'

export function workerStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    chunking: '文档分块', map: '局部分析', chapter: '章节汇总', volume: '卷级汇总',
    reduce: '阶段汇总', synthesis: '全书综合', evidence: '来源校验', lifecycle: '任务',
  }
  return labels[stage] ?? (stage.startsWith('reduce-') ? '全书阶段汇总' : '分析')
}

export function mergeWorkerActivity(log: ChatActivity[], event: TaskWorkerEvent): ChatActivity[] {
  const index = log.findIndex((item) => item.worker?.jobId === event.jobId && item.worker.stage === event.stage)
  const previous = index < 0 ? undefined : log[index]
  if (previous?.worker && previous.worker.sequence >= event.sequence) return log
  const terminal = ['failed', 'cancelled', 'completed'].includes(event.status)
  const artifacts = [...new Set([...(previous?.artifacts ?? []), ...(event.artifact ? [event.artifact] : [])])].slice(-12)
  const activity: ChatActivity = {
    status: event.stage === 'chunking' ? 'fetching' : 'tool_calling',
    message: event.message, timestamp: previous?.timestamp ?? event.timestamp,
    completedAt: terminal ? event.timestamp : undefined,
    worker: event, artifacts,
    cacheHits: (previous?.cacheHits ?? 0) + (event.cacheSource === 'shared' || event.cacheSource === 'checkpoint' ? 1 : 0),
    modelRequests: (previous?.modelRequests ?? 0) + (event.cacheSource === 'model' ? 1 : 0),
  }
  const next = log.map((item) => !item.completedAt && item.worker?.stage !== event.stage
    ? { ...item, completedAt: event.timestamp } : item)
  if (index < 0) next.push(activity)
  else next[index] = activity
  // Each stage occupies one row, irrespective of the number of chunks.
  return next.slice(-80)
}
