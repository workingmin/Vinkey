import type { ChatActivity, TaskWorkerEvent } from '../types'

export function workerStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    chunking: '文档分块', map: '局部分析', chapter: '章节汇总', volume: '卷级汇总',
    reduce: '阶段汇总', synthesis: '全书综合', evidence: '来源校验', lifecycle: '任务',
  }
  return labels[stage] ?? (stage.startsWith('reduce-') ? '全书阶段汇总' : '分析')
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
      sections.push({ id, label: segment?.label ?? '过程记录（未提供推进边界）', hasBoundary: Boolean(segment), startedAt: segment?.startedAt, entries: [] })
      if (segment) seenSegments.add(identity)
    }
    sections.at(-1)!.entries.push({ item, index, key })
    previousIdentity = identity
  })
  return sections
}
