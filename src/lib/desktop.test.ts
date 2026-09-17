// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearConversationRunHistory, loadConversation, saveConversationMessage,
} from './desktop'

describe('conversation run history', () => {
  beforeEach(() => localStorage.clear())

  it('clears finished run metadata without deleting conversation messages', async () => {
    const user = { id: 'user-1', role: 'user' as const, content: '分析第三章', createdAt: 1 }
    const assistant = {
      id: 'assistant-1', role: 'assistant' as const, content: '分析结果', createdAt: 2, completedAt: 3,
      activityLog: [{ status: 'thinking' as const, message: null, timestamp: 2, completedAt: 3 }],
      runResult: { status: 'completed' as const },
    }
    const runningAssistant = {
      id: 'assistant-2', role: 'assistant' as const, content: '正在分析', createdAt: 4,
      activityLog: [{ status: 'thinking' as const, message: null, timestamp: 4 }],
    }
    await saveConversationMessage('conversation-1', '章节分析', user, 'demo-workspace')
    await saveConversationMessage('conversation-1', '章节分析', assistant, 'demo-workspace')
    await saveConversationMessage('conversation-1', '章节分析', runningAssistant, 'demo-workspace')

    expect(await clearConversationRunHistory('demo-workspace')).toBe(1)

    const conversation = await loadConversation('conversation-1', 'demo-workspace')
    expect(conversation.messages.map((message) => message.content)).toEqual(['分析第三章', '分析结果', '正在分析'])
    expect(conversation.messages[1].activityLog).toBeUndefined()
    expect(conversation.messages[1].runResult).toBeUndefined()
    expect(conversation.messages[2].activityLog).toHaveLength(1)
  })
})
