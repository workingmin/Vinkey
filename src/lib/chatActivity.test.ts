import { describe, expect, it } from 'vitest'
import { mergeWorkerActivity, workerStageLabel } from './chatActivity'
import type { TaskWorkerEvent } from '../types'

function event(overrides: Partial<TaskWorkerEvent> = {}): TaskWorkerEvent {
  return {
    sequence: 1,
    timestamp: 1_000,
    jobId: 'job-1',
    stage: 'map',
    status: 'running',
    completed: 1,
    total: 3,
    message: '已保存局部分析',
    ...overrides,
  }
}

describe('Worker message activity', () => {
  it('keeps one row per stage and accumulates artifacts and cache hits', () => {
    const first = mergeWorkerActivity([], event({ artifact: 'summary-00001.md', cacheSource: 'shared' }))
    const next = mergeWorkerActivity(first, event({
      sequence: 2,
      timestamp: 2_000,
      completed: 2,
      artifact: 'summary-00002.md',
      cacheSource: 'checkpoint',
    }))

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      artifacts: ['summary-00001.md', 'summary-00002.md'],
      cacheHits: 2,
      modelRequests: 0,
      worker: { sequence: 2, completed: 2 },
    })
  })

  it('ignores stale events and completes the previous stage when advancing', () => {
    const map = mergeWorkerActivity([], event({ sequence: 3, timestamp: 3_000 }))
    expect(mergeWorkerActivity(map, event({ sequence: 2, timestamp: 2_000 }))).toBe(map)

    const chapter = mergeWorkerActivity(map, event({
      sequence: 4,
      timestamp: 4_000,
      stage: 'chapter',
      total: 1,
      message: '正在汇总章节',
      cacheSource: 'model',
    }))
    expect(chapter).toHaveLength(2)
    expect(chapter[0].completedAt).toBe(4_000)
    expect(chapter[1]).toMatchObject({ modelRequests: 1, worker: { stage: 'chapter' } })
  })

  it('labels hierarchical stages for the transcript', () => {
    expect(workerStageLabel('chapter')).toBe('章节汇总')
    expect(workerStageLabel('volume')).toBe('卷级汇总')
    expect(workerStageLabel('reduce-2')).toBe('全书阶段汇总')
  })
})
