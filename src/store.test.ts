// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type ChatRun } from './store'
import type { ChatMessage, Conversation, DiffProposal, DocumentTab } from './types'
import { fingerprintDocument } from './lib/diffProposal'

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
  statusMessage: null,
  activityLog: [],
  userMessage: message(`user-${conversationId}`, 'user', '问题', 2),
  assistantMessage: message(`assistant-${conversationId}`, 'assistant', '', 3),
})

describe('local model preferences', () => {
  it('persists whether model switching should stop the previous Ollama model', () => {
    useAppStore.getState().setAutoStopOllamaModels(false)
    expect(useAppStore.getState().autoStopOllamaModels).toBe(false)
    expect(localStorage.getItem('vinkey.autoStopOllamaModels')).toBe('false')

    useAppStore.getState().setAutoStopOllamaModels(true)
    expect(useAppStore.getState().autoStopOllamaModels).toBe(true)
    expect(localStorage.getItem('vinkey.autoStopOllamaModels')).toBe('true')
  })
})

describe('conversation chat runs', () => {
  beforeEach(() => {
    useAppStore.setState({
      conversationId: null,
      conversationTitle: '新会话',
      messages: [],
      chatRuns: {},
      completedChatMessages: {},
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
    store.setChatRunStatus('a', 'streaming', '已收到模型响应')

    expect(useAppStore.getState().chatRuns.a.status).toBe('streaming')
    expect(useAppStore.getState().chatRuns.a.statusMessage).toBe('已收到模型响应')
    expect(useAppStore.getState().chatRuns.a.assistantMessage.content).toBe('已收到')
    expect(useAppStore.getState().chatRuns.a.activityLog.map((item) => item.status)).toEqual(['thinking', 'streaming'])
    expect(useAppStore.getState().messages.at(-1)?.activityLog).toHaveLength(2)
  })

  it('closes each activity and stamps the completed assistant message', () => {
    const store = useAppStore.getState()
    store.setConversation(conversation('a'))
    store.beginChatRun(run('a'))
    store.setChatRunStatus('a', 'fetching', '读取文档')
    store.appendChatRunChunk('a', '完成')
    store.endChatRun('a', false)

    const assistant = useAppStore.getState().completedChatMessages.a
    expect(assistant?.completedAt).toBeTypeOf('number')
    expect(assistant?.activityLog?.every((item) => typeof item.completedAt === 'number')).toBe(true)
    expect(assistant?.activityLog?.[0].completedAt).toBeLessThanOrEqual(assistant.completedAt ?? 0)
  })

  it('keeps a bounded activity trail on the completed assistant message', () => {
    const store = useAppStore.getState()
    store.setConversation(conversation('a'))
    store.beginChatRun(run('a'))
    for (let index = 0; index < 100; index += 1) {
      store.setChatRunStatus('a', 'fetching', `步骤 ${index}`)
    }
    store.appendChatRunChunk('a', '完成')
    store.endChatRun('a', false)

    const assistant = useAppStore.getState().messages.at(-1)
    expect(assistant?.content).toBe('完成')
    expect(assistant?.activityLog).toHaveLength(80)
  })

  it('restores a completed activity trail after switching conversations', () => {
    const store = useAppStore.getState()
    store.setConversation(conversation('a'))
    store.beginChatRun(run('a'))
    store.appendChatRunChunk('a', '已完成')
    store.setChatRunStatus('a', 'streaming', '已收到模型响应')
    store.setConversation(conversation('b'))
    store.endChatRun('a', false)

    store.setConversation(conversation('a', [message('user-a', 'user', '问题', 2), message('assistant-a', 'assistant', '已完成', 3)]))
    const assistant = useAppStore.getState().messages.at(-1)
    expect(assistant?.content).toBe('已完成')
    expect(assistant?.activityLog).toHaveLength(2)
  })

  it('removes a stored conversation and resets the active conversation', () => {
    const store = useAppStore.getState()
    store.setConversations([
      { id: 'a', title: '会话 a', updatedAt: 2, messageCount: 2 },
      { id: 'b', title: '会话 b', updatedAt: 1, messageCount: 1 },
    ])
    store.setConversation(conversation('a', [message('user-a', 'user', '问题', 2)]))
    useAppStore.setState({ completedChatMessages: { a: message('assistant-a', 'assistant', '回答', 3) } })

    store.removeConversation('a')

    const state = useAppStore.getState()
    expect(state.conversations.map((item) => item.id)).toEqual(['b'])
    expect(state.conversationId).toBeNull()
    expect(state.conversationTitle).toBe('新会话')
    expect(state.contextDocuments).toEqual([])
    expect(state.completedChatMessages.a).toBeUndefined()
  })
})

describe('DiffProposal review', () => {
  const tab: DocumentTab = {
    path: 'chapter.md', name: 'chapter.md', content: '前-旧句-后', savedContent: '前-旧句-后', kind: 'markdown',
    modifiedMs: 1, lineEnding: 'lf', hasBom: false,
  }
  const proposal: DiffProposal = {
    id: 'proposal-1', path: 'chapter.md', from: 2, to: 4, text: '旧句', replacementText: '新句',
    instruction: '润色', sourceModifiedMs: 1, sourceFingerprint: fingerprintDocument('前-旧句-后'), status: 'proposed', createdAt: 1,
  }

  it('applies a reviewed proposal without saving the document', () => {
    useAppStore.setState({ tabs: [tab], activePath: tab.path, diffProposals: [], diffProposalBaselines: {} })
    useAppStore.getState().setDiffProposals([proposal])
    useAppStore.getState().applyDiffProposal(proposal.id)
    expect(useAppStore.getState().tabs[0].content).toBe('前-新句-后')
    expect(useAppStore.getState().tabs[0].savedContent).toBe('前-旧句-后')
    expect(useAppStore.getState().diffProposals[0]?.status).toBe('applied')
  })

  it('rejects stale source ranges', () => {
    useAppStore.setState({ tabs: [tab], activePath: tab.path, diffProposals: [], diffProposalBaselines: {} })
    useAppStore.getState().setDiffProposals([proposal])
    useAppStore.setState({ tabs: [{ ...tab, content: '前-变化-后' }] })
    expect(() => useAppStore.getState().applyDiffProposal(proposal.id)).toThrow('源文档已变化')
  })

  it('rebuilds multiple accepted chunks from one immutable baseline', () => {
    const baseline = '甲段|乙段|丙段'
    const sourceFingerprint = fingerprintDocument(baseline)
    const proposals: DiffProposal[] = [
      { ...proposal, id: 'chunk-1', proposalSetId: 'set-1', path: 'chapter.md', from: 0, to: 2, text: '甲段', replacementText: '甲新', sourceFingerprint },
      { ...proposal, id: 'chunk-2', proposalSetId: 'set-1', path: 'chapter.md', from: 6, to: 8, text: '丙段', replacementText: '丙新', sourceFingerprint },
    ]
    useAppStore.setState({ tabs: [{ ...tab, content: baseline, savedContent: baseline }], activePath: tab.path, diffProposals: [], diffProposalBaselines: {} })
    useAppStore.getState().setDiffProposals(proposals)
    useAppStore.getState().applyDiffProposal('chunk-1')
    useAppStore.getState().applyDiffProposal('chunk-2')
    expect(useAppStore.getState().tabs[0].content).toBe('甲新|乙段|丙新')
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
