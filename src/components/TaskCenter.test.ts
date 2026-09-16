// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { TaskJob } from '../types'
import { diagnosticsText } from './TaskCenter'

describe('task center diagnostics', () => {
  it('includes public chain context without copying event fields or source fingerprints', () => {
    const job: TaskJob = {
      taskId: 'task-123456', workspaceId: 'workspace-1', taskType: 'long-text-analysis', instructionHash: 'hash',
      status: 'failed', cancelRequested: false, sourceFingerprints: { 'secret.md': 'private-fingerprint' },
      displayTitle: '分析人物关系', workspaceNameSnapshot: '长篇项目', conversationTitleSnapshot: '人物线',
      modelNameSnapshot: 'qwen3:8b', connectionNameSnapshot: '本地模型',
      steps: [], createdAt: 1, updatedAt: 2,
      failure: { code: 'model.output_invalid', category: 'model', message: '模型输出无效', retryable: true },
      events: [{ sequence: 1, eventType: 'task.failed', timestamp: 2, fields: { prompt: '不得复制的正文', apiKey: 'secret-key' } }],
    }

    const text = diagnosticsText(job)
    expect(text).toContain('task-123456')
    expect(text).toContain('任务执行失败')
    expect(text).toContain('model.output_invalid')
    expect(text).not.toContain('不得复制的正文')
    expect(text).not.toContain('secret-key')
    expect(text).not.toContain('private-fingerprint')
  })
})
