import type { ChatActivity, TaskJob, TaskWorkerEvent } from '../types'

// Shared copy mapping for the task process area (design §5/§6). One source is
// consumed by the message area, the composer and the control row; components
// must not define their own parallel tables.
export const taskStatusLabels = {
  stopping: '正在停止…',
  paused: '已暂停',
  cancelled: '已停止',
  completed: '已完成',
  failed: '处理失败',
  running: '处理中',
} as const

// Past-tense wording for historical activity rows (当时状态), kept separate
// from the live task status: a finished activity interval is not a finished
// segment or task.
export const historicalWorkerStatusLabels = {
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已停止',
} as const

export const taskJobStatusLabels: Record<TaskJob['status'], string> = {
  planned: '等待开始',
  running: taskStatusLabels.running,
  paused: taskStatusLabels.paused,
  completed: taskStatusLabels.completed,
  failed: taskStatusLabels.failed,
  cancelled: taskStatusLabels.cancelled,
}

export function workerStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    chunking: '阅读与分段', map: '分析文本片段', chapter: '汇总章节分析', volume: '汇总分卷分析',
    reduce: '汇总分析结果', synthesis: '综合分析', evidence: '核对引用', lifecycle: '任务',
  }
  return labels[stage] ?? (stage.startsWith('reduce-') ? '汇总分析结果' : '分析')
}

export function taskStepLabel(stepId: string): string {
  if (stepId === 'reduce' || stepId.startsWith('reduce-')) return '汇总分析结果'
  return workerStageLabel(stepId)
}

export function appendWorkerActivity(log: ChatActivity[], event: TaskWorkerEvent): ChatActivity[] {
  // Replayed delivery of the same event is not a new execution. Never use the
  // stage or message text as identity: retries and progress share both.
  if (log.some((item) => item.worker?.jobId === event.jobId && item.worker.sequence === event.sequence)) return log
  const terminal = ['failed', 'cancelled', 'completed'].includes(event.status)
  const activity: ChatActivity = {
    id: `worker:${event.jobId}:${event.sequence}`,
    segment: event.segment,
    status: event.stage === 'chunking' ? 'fetching' : 'tool_calling',
    message: event.message, timestamp: event.timestamp,
    completedAt: terminal ? event.timestamp : undefined,
    worker: event, artifacts: event.artifact ? [event.artifact] : [],
    cacheHits: event.cacheSource === 'shared' || event.cacheSource === 'checkpoint' ? 1 : 0,
    modelRequests: event.cacheSource === 'model' ? 1 : 0,
  }
  // Live notifications can arrive before replay. Insert missing earlier events
  // without replacing later ones or treating earlier running states as success.
  const index = log.findIndex((item) => item.worker?.jobId === event.jobId
    ? item.worker.sequence > event.sequence : item.timestamp > event.timestamp)
  if (index >= 0) return [...log.slice(0, index), activity, ...log.slice(index)]
  const previous = log.at(-1)
  const closed = previous && !previous.worker && previous.completedAt === undefined
    ? [...log.slice(0, -1), { ...previous, completedAt: event.timestamp }] : log
  return [...closed, activity]
}

export interface ProcessSection {
  id: string
  label: string
  hasBoundary: boolean
  startedAt?: number
  entries: Array<{ item: ChatActivity; index: number; key: string }>
}

/** Contiguous display sections only: never infer a boundary from stage or text. */
export function processSections(items: ChatActivity[]): ProcessSection[] {
  const sections: ProcessSection[] = []
  const seenSegments = new Set<string>()
  let previousIdentity: string | undefined
  items.forEach((item, index) => {
    const segment = item.segment ?? item.worker?.segment
    const identity = segment ? JSON.stringify([item.worker?.jobId ?? '', segment.id]) : 'unsegmented'
    const key = item.id ?? `legacy:${index}:${item.timestamp}`
    const previous = sections.at(-1)
    // Results remain at their original position, outside both disclosures.
    if (!previous || identity !== previousIdentity || previous.entries.at(-1)?.item.response) {
      const id = segment
        ? seenSegments.has(identity) ? `${identity}:after:${previous?.entries.at(-1)?.key}` : identity
        : `unsegmented:after:${previous?.id ?? 'start'}`
      sections.push({ id, label: segment?.label ?? '过程记录', hasBoundary: Boolean(segment), startedAt: segment?.startedAt, entries: [] })
      if (segment) seenSegments.add(identity)
    }
    sections.at(-1)!.entries.push({ item, index, key })
    previousIdentity = identity
  })
  return sections
}
