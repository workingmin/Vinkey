// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore, type ChatRun } from '../store'
import * as desktop from './desktop'
import { persistChatRun } from './chatRunPersistence'

const run: ChatRun = {
  conversationId: 'conversation', conversationTitle: '分析', requestId: 'request',
  status: 'thinking', statusMessage: null, activityLog: [],
  userMessage: { id: 'user', role: 'user', content: '分析', createdAt: 1 },
  assistantMessage: { id: 'assistant', role: 'assistant', content: '', createdAt: 2 },
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ chatRuns: {}, messages: [], completedChatMessages: {}, conversationId: 'conversation' })
  useAppStore.getState().beginChatRun(run)
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('live conversation persistence', () => {
  it('restores in-progress history and partial responses after clearing memory', async () => {
    const finish = persistChatRun('conversation', '分析', 'demo-workspace')
    for (let i = 0; i < 100; i++) useAppStore.getState().setChatRunStatus('conversation', 'fetching', `读取 ${i}`)
    useAppStore.getState().appendChatRunChunk('conversation', '已经生成的内容')
    await vi.advanceTimersByTimeAsync(1_000)
    await finish()
    useAppStore.setState({ chatRuns: {}, messages: [] })
    const restored = await desktop.loadConversation('conversation', 'demo-workspace')
    expect(restored.messages[0].content).toBe('已经生成的内容')
    expect(restored.messages[0].activityLog).toHaveLength(101)
    expect(restored.messages[0].runResult).toBeUndefined()
    expect(restored.messages[0].completedAt).toBeUndefined()
  })

  it('serializes snapshots and drains them before the terminal write', async () => {
    let release!: () => void
    const save = vi.spyOn(desktop, 'saveConversationMessage')
      .mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
      .mockResolvedValue(undefined)
    const finish = persistChatRun('conversation', '分析', 'project-original')
    await Promise.resolve()
    useAppStore.getState().appendChatRunChunk('conversation', '最后一段')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(save).toHaveBeenCalledTimes(1)
    const drained = finish()
    release()
    await drained
    useAppStore.getState().endChatRun('conversation', false, { status: 'cancelled' })
    await desktop.saveConversationMessage('conversation', '分析', useAppStore.getState().completedChatMessages.conversation, 'project-original')
    expect(save).toHaveBeenCalledTimes(3)
    expect(save.mock.calls.map((call) => call[2].content)).toEqual(['', '最后一段', '最后一段'])
    expect(save.mock.calls.at(-1)?.[2].runResult?.status).toBe('cancelled')
    expect(save.mock.calls.every((call) => call[3] === 'project-original')).toBe(true)
  })

  it('reports a failed snapshot and still persists later progress', async () => {
    const save = vi.spyOn(desktop, 'saveConversationMessage').mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const error = vi.fn()
    const finish = persistChatRun('conversation', '分析', 'project-original', error)
    await vi.advanceTimersByTimeAsync(0)
    useAppStore.getState().appendChatRunChunk('conversation', '后续内容')
    await finish()
    expect(error).toHaveBeenCalledTimes(1)
    expect(save.mock.calls.at(-1)?.[2].content).toBe('后续内容')
  })
})
