import { describe, expect, it } from 'vitest'
import { appendWorkerActivity, processSections, workerStageLabel } from './chatActivity'
import type { TaskWorkerEvent } from '../types'

function event(overrides: Partial<TaskWorkerEvent> = {}): TaskWorkerEvent {
  return { sequence: 1, timestamp: 1_000, jobId: 'job-1', stage: 'map', status: 'running', completed: 1, total: 3, message: '继续处理任务过程', ...overrides }
}

describe('Worker message activity', () => {
  it('preserves every execution event even when stage and text repeat', () => {
    const first = appendWorkerActivity([], event({ artifact: 'summary-00001.md', cacheSource: 'shared' }))
    const next = appendWorkerActivity(first, event({ sequence: 2, timestamp: 2_000, completed: 2, artifact: 'summary-00002.md', cacheSource: 'checkpoint' }))
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(first[0])
    expect(next.map((item) => item.artifacts)).toEqual([['summary-00001.md'], ['summary-00002.md']])
    expect(next.map((item) => item.cacheHits)).toEqual([1, 1])
    expect(new Set(next.map((item) => item.id)).size).toBe(2)
  })

  it('keeps earlier replayed events in execution order and ignores only duplicate delivery', () => {
    const latest = appendWorkerActivity([], event({ sequence: 3, timestamp: 3_000 }))
    const earlier = appendWorkerActivity(latest, event({ sequence: 1 }))
    const complete = appendWorkerActivity(earlier, event({ sequence: 2, timestamp: 2_000 }))
    expect(complete.map((item) => item.worker?.sequence)).toEqual([1, 2, 3])
    expect(appendWorkerActivity(complete, event({ sequence: 2, timestamp: 2_000 }))).toBe(complete)
    expect(complete[0].completedAt).toBeUndefined()
  })

  it('retains failures, pauses, resumes and retries without replacing their stages', () => {
    let log = appendWorkerActivity([], event({ status: 'failed' }))
    log = appendWorkerActivity(log, event({ sequence: 2, timestamp: 2_000, status: 'running' }))
    log = appendWorkerActivity(log, event({ sequence: 3, timestamp: 3_000, status: 'paused' }))
    log = appendWorkerActivity(log, event({ sequence: 4, timestamp: 4_000, status: 'completed' }))
    expect(log.map((item) => item.worker?.status)).toEqual(['failed', 'running', 'paused', 'completed'])
    expect(log[1].completedAt).toBeUndefined()
    expect(log[0].completedAt).toBe(1_000)
  })

  it('retains early events beyond the previous history limit', () => {
    let log = appendWorkerActivity([], event())
    for (let sequence = 2; sequence <= 150; sequence++) log = appendWorkerActivity(log, event({ sequence, timestamp: sequence * 1_000 }))
    expect(log).toHaveLength(150)
    expect(log[0].worker?.sequence).toBe(1)
    expect(log.at(-1)?.worker?.sequence).toBe(150)
    expect(appendWorkerActivity(log, event({ jobId: 'job-2', timestamp: 200_000 }))).toHaveLength(151)
  })

  it('inserts recovered events before later non-worker responses', () => {
    const log = appendWorkerActivity([{ id: 'response', status: 'streaming', message: '结果', timestamp: 5_000 }], event())
    expect(log.map((item) => item.id)).toEqual(['worker:job-1:1', 'response'])
  })

  it('labels hierarchical stages for the transcript', () => {
    expect(workerStageLabel('chapter')).toBe('章节汇总')
    expect(workerStageLabel('volume')).toBe('卷级汇总')
    expect(workerStageLabel('reduce-2')).toBe('全书阶段汇总')
  })
})


describe('explicit process sections', () => {
  it('uses runtime identities rather than stage or text, without removing any events', () => {
    const first = appendWorkerActivity([], event({ segment: { id: 'a', label: '分析' } }))
    const second = appendWorkerActivity(first, event({ sequence: 2, timestamp: 2_000, stage: 'chapter', segment: { id: 'a', label: '分析' } }))
    const third = appendWorkerActivity(second, event({ sequence: 3, timestamp: 3_000, segment: { id: 'b', label: '分析' } }))
    const sections = processSections(third)
    expect(sections).toHaveLength(2)
    expect(sections.map((section) => section.entries.length)).toEqual([2, 1])
    expect(sections.flatMap((section) => section.entries.map(({ item }) => item))).toEqual(third)
    expect(sections[0].entries[0].item).toBe(first[0])
  })

  it('does not infer legacy boundaries from a change of stage', () => {
    const history = appendWorkerActivity(appendWorkerActivity([], event()), event({ sequence: 2, timestamp: 2_000, stage: 'chapter' }))
    const sections = processSections(history)
    expect(sections).toHaveLength(1)
    expect(sections[0].hasBoundary).toBe(false)
  })

  it('preserves chronological sections around intervening records and public responses', () => {
    const first = appendWorkerActivity([], event({ segment: { id: 'a', label: '分析' } }))[0]
    const second = { ...first, id: 'second', response: '已交付的响应' }
    const sections = processSections([first, second, { ...first, id: 'third' }])
    expect(sections.map((section) => section.entries.map(({ key }) => key))).toEqual([[first.id, 'second'], ['third']])
    const legacy = { ...first, id: 'legacy', segment: undefined, worker: undefined }
    expect(processSections([first, legacy, { ...first, id: 'fourth' }])).toHaveLength(3)
  })
})
