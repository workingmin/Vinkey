// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type ChatRun } from './store'
import type { ChatMessage, Conversation } from './types'

const message = (id: string, role: ChatMessage['role'], content: string, createdAt: number): ChatMessage => ({
  id, role, content, createdAt,
})

const conversation = (id: string, messages: ChatMessage[] = []): Conversation => ({
  id, title: `会话 ${id}`, messages, updatedAt: 1,
})

const run = (conversationId: string): ChatRun => ({
  conversationId,
  conversationTitle: `会话 ${conversationId}`,
  requestId: `request-${conversationId}`,
  status: 'thinking',
  userMessage: message(`user-${conversationId}`, 'user', '问题', 2),
  assistantMessage: message(`assistant-${conversationId}`, 'assistant', '', 3),
})

describe('conversation chat runs', () => {
  beforeEach(() => {
    useAppStore.setState({
      conversationId: null,
      conversationTitle: '新会话',
      messages: [],
      chatRuns: {},
      error: null,
    })
  })

  it('continues updating the original conversation after switching away', () => {
    const store = useAppStore.getState()
    store.setConversation(conversation('a'))
    store.beginChatRun(run('a'))
    store.appendChatRunChunk('a', '第一段')

    store.setConversation(conversation('b', [message('user-b', 'user', '另一个会话', 1)]))
    store.appendChatRunChunk('a', '第二段')

    expect(useAppStore.getState().conversationId).toBe('b')
    expect(useAppStore.getState().messages).toHaveLength(1)
    expect(useAppStore.getState().chatRuns.a.assistantMessage.content).toBe('第一段第二段')
  })

  it('restores live output when returning to a running conversation', () => {
    const store = useAppStore.getState()
    const activeRun = run('a')
    store.setConversation(conversation('a'))
    store.beginChatRun(activeRun)
    store.appendChatRunChunk('a', '后台生成内容')
    store.setConversation(conversation('b'))

    store.setConversation(conversation('a', [activeRun.userMessage]))

    const state = useAppStore.getState()
    expect(state.messages.map((item) => item.id)).toEqual(['user-a', 'assistant-a'])
    expect(state.messages.at(-1)?.content).toBe('后台生成内容')
  })

  it('keeps completed output and removes an empty failed response', () => {
    const store = useAppStore.getState()
    store.setConversation(conversation('a'))
    store.beginChatRun(run('a'))
    store.appendChatRunChunk('a', '已完成')
    store.endChatRun('a', false)

    expect(useAppStore.getState().chatRuns.a).toBeUndefined()
    expect(useAppStore.getState().messages.at(-1)?.content).toBe('已完成')

    store.beginChatRun(run('a'))
    store.endChatRun('a', true)
    expect(useAppStore.getState().messages.some((item) => item.id === 'assistant-a')).toBe(false)
  })

  it('updates temporary status without changing the live response', () => {
    const store = useAppStore.getState()
    store.setConversation(conversation('a'))
    store.beginChatRun(run('a'))
    store.appendChatRunChunk('a', '已收到')
    store.setChatRunStatus('a', 'streaming')

    expect(useAppStore.getState().chatRuns.a.status).toBe('streaming')
    expect(useAppStore.getState().chatRuns.a.assistantMessage.content).toBe('已收到')
  })
})

describe('settings sidebar behavior', () => {
  beforeEach(() => {
    useAppStore.setState({
      settingsOpen: false,
      sidebarCollapsed: false,
      settingsSidebarBeforeOpen: null,
      settingsSidebarUserOverride: false,
    })
  })

  it('collapses an expanded sidebar and restores it when settings closes', () => {
    const store = useAppStore.getState()

    store.setSettingsOpen(true)
    expect(useAppStore.getState().sidebarCollapsed).toBe(true)

    store.setSettingsOpen(false)
    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
  })

  it('keeps a sidebar that was already collapsed before settings', () => {
    const store = useAppStore.getState()
    store.setSidebarCollapsed(true)

    store.setSettingsOpen(true)
    store.setSettingsOpen(false)

    expect(useAppStore.getState().sidebarCollapsed).toBe(true)
  })

  it('respects a manual sidebar change made while settings is open', () => {
    const store = useAppStore.getState()
    store.setSettingsOpen(true)
    store.setSidebarCollapsed(false)
    store.setSettingsOpen(false)

    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
  })
})
