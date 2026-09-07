// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { pauseTaskWorker, prepareLongTextWorker, resumeTaskWorker } from './desktop'
import type { TaskWorkerEvent } from '../types'

describe('long text worker protocol', () => {
  it('prepares manifests and reports a completed worker event', async () => {
    const events: TaskWorkerEvent[] = []
    const output = await prepareLongTextWorker({
      jobId: 'worker-test-1',
      instruction: '分析第一章',
      instructionHash: 'a'.repeat(64),
      profileId: 'demo-model',
      contextWindow: 32_768,
      sourcePolicy: 'local-chunks',
      maxTokens: 2_048,
      overlapTokens: 128,
      dispatch: {
        jobId: 'worker-test-1',
        workspaceId: 'demo-workspace',
        policyVersion: 'task-policy-1',
        dispatchVersion: 'service-dispatch-1',
        serviceId: 'long-text-analysis',
        executionOwner: 'webview',
      },
      documentIndex: '<document-index />',
      documents: [{ path: '章节/第一章.md', sourceFingerprint: 'b'.repeat(64) }],
      excludedDocuments: [],
    }, (event) => events.push(event))

    expect(output.workerVersion).toBe('long-text-worker-5')
    expect(output.outputSchemaVersion).toBe('long-text-output-2')
    expect(output.mapCacheHits).toBe(0)
    expect(output.pipelineCompleted).toBe(false)
    expect(output.manifests).toHaveLength(1)
    expect(output.manifests[0].sourceId).toBe('章节/第一章.md')
    expect(events.at(-1)?.status).toBe('completed')
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3])
  })

  it('shares pause and resume state with the worker Job', async () => {
    const paused = await pauseTaskWorker('worker-test-1')
    expect(paused.status).toBe('paused')
    const resumed = await resumeTaskWorker('worker-test-1')
    expect(resumed.status).toBe('running')
  })
})
