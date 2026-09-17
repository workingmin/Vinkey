// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Conversation, TaskJob } from '../types'
import { buildConversationLogEntries, logDiagnosticsText } from './LogCenter'

const failedJob: TaskJob = {
  taskId: 'task-123456', workspaceId: 'workspace-1', taskType: 'long-text-analysis', instructionHash: 'hash',
  status: 'failed', cancelRequested: false, sourceFingerprints: { 'secret.md': 'private-fingerprint' },
  displayTitle: '分析人物关系', workspaceNameSnapshot: '长篇项目', conversationId: 'conversation-1',
  sourceMessageId: 'user-job', conversationTitleSnapshot: '人物线',
  modelNameSnapshot: 'qwen3:8b', connectionNameSnapshot: '本地模型',
  steps: [], createdAt: 1, updatedAt: 2,
  failure: { code: 'model.output_invalid', category: 'model', message: '模型输出无效', retryable: true },
  events: [{ sequence: 1, eventType: 'task.failed', timestamp: 2, fields: { prompt: '不得复制的正文', apiKey: 'secret-key' } }],
}

describe('conversation log center', () => {
  it('includes public chain context without copying event fields or source fingerprints', () => {
    const [entry] = buildConversationLogEntries([], [failedJob])
    const text = logDiagnosticsText(entry)

    expect(text).toContain('task-123456')
    expect(text).toContain('任务执行失败')
    expect(text).toContain('model.output_invalid')
    expect(text).not.toContain('不得复制的正文')
    expect(text).not.toContain('secret-key')
    expect(text).not.toContain('private-fingerprint')
  })

  it('builds a structured failed conversation record with its source message', () => {
    const conversation: Conversation = {
      id: 'conversation-2', title: '章节讨论', updatedAt: 4,
      messages: [
        { id: 'user-1', role: 'user', content: '检查第三章的设定冲突', createdAt: 1, taskRef: { taskId: 'request-1', intent: 'continuity-review', scope: 'current-document', targets: [], sideEffect: 'read' } },
        { id: 'assistant-1', role: 'assistant', content: '> 任务未完成：模型输出无效', createdAt: 2, completedAt: 4,
          activityLog: [{ status: 'thinking', message: null, timestamp: 2, completedAt: 3 }],
          runResult: { status: 'failed', error: { code: 'model.output_invalid', category: 'model', message: '模型输出无效', retryable: true } } },
      ],
    }

    const [entry] = buildConversationLogEntries([conversation], [])
    expect(entry).toMatchObject({
      kind: 'conversation', status: 'failed', conversationId: 'conversation-2', sourceMessageId: 'user-1',
      title: '检查第三章的设定冲突',
    })
    expect(entry.failure?.code).toBe('model.output_invalid')
  })

  it('uses the background job as the single record for a long-running conversation request', () => {
    const conversation: Conversation = {
      id: 'conversation-1', title: '人物线', updatedAt: 3,
      messages: [
        { id: 'user-job', role: 'user', content: '分析人物关系', createdAt: 1 },
        { id: 'assistant-job', role: 'assistant', content: '任务未完成', createdAt: 2, completedAt: 3,
          activityLog: [{ status: 'tool_calling', message: '执行分析', timestamp: 2, completedAt: 3 }] },
      ],
    }

    const entries = buildConversationLogEntries([conversation], [failedJob])
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('background')
  })
})
