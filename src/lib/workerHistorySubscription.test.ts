// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { loadConversation } from './desktop'
import { useAppStore } from '../store'
import { watchWorkerHistory } from './workerHistorySubscription'
import type { Conversation, WorkspaceSnapshot } from '../types'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('./desktop', () => ({ isDesktop: () => true, loadConversation: vi.fn() }))
let receive: (event: { payload: { jobId: string } }) => void
const stop = vi.fn()
const original: Conversation = { id: 'conversation', title: '分析', updatedAt: 1, messages: [{
  id: 'assistant', role: 'assistant', content: '', createdAt: 1,
  activityLog: [{ id: 'initial', jobId: 'job', status: 'thinking', message: null, timestamp: 1 }],
}] }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useAppStore.setState({ workspace: { id: 'project' } as WorkspaceSnapshot, conversationId: 'conversation', messages: original.messages,
    chatRuns: {}, pendingChatRequests: 0, projectTransition: false })
  vi.mocked(listen).mockImplementation(async (_name, callback) => { receive = callback as unknown as typeof receive; return stop })
  vi.mocked(loadConversation).mockResolvedValue(structuredClone(original))
})
afterEach(() => { vi.useRealTimers() })

describe('restored Worker observation', () => {
  it('refreshes persisted history on new events without a local ChatRun', async () => {
    const dispose = watchWorkerHistory('project', 'conversation')
    await vi.advanceTimersByTimeAsync(250)
    const updated = structuredClone(original)
    updated.messages[0].content = '后台已完成的分析'
    vi.mocked(loadConversation).mockResolvedValue(updated)
    receive({ payload: { jobId: 'other-job' } })
    await vi.advanceTimersByTimeAsync(250)
    expect(loadConversation).toHaveBeenCalledTimes(1)
    receive({ payload: { jobId: 'job' } })
    await vi.advanceTimersByTimeAsync(250)
    expect(useAppStore.getState().messages[0].content).toBe('后台已完成的分析')
    dispose()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite a conversation after switching away during a read', async () => {
    let resolve!: (conversation: Conversation) => void
    vi.mocked(loadConversation).mockImplementation(() => new Promise((done) => { resolve = done }))
    const dispose = watchWorkerHistory('project', 'conversation')
    await vi.advanceTimersByTimeAsync(250)
    useAppStore.setState({ conversationId: 'other', messages: [] })
    resolve(structuredClone(original))
    await vi.advanceTimersByTimeAsync(0)
    expect(useAppStore.getState().messages).toEqual([])
    dispose()
  })

  it('does not race a request that has reserved the conversation', async () => {
    useAppStore.setState({ pendingChatRequests: 1 })
    const dispose = watchWorkerHistory('project', 'conversation')
    await vi.advanceTimersByTimeAsync(250)
    receive({ payload: { jobId: 'job' } })
    await vi.advanceTimersByTimeAsync(250)
    expect(loadConversation).not.toHaveBeenCalled()
    dispose()
  })
})
