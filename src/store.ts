import { create } from 'zustand'
import type {
  ChatMessage, ContextDocument, Conversation, ConversationSummary, DocumentTab,
  ModelProfile, ThemeMode, ViewMode, WorkspaceSnapshot,
  ChatActivity, ChatRunStatus,
  DiffProposal, EditorRevisionRequest, EditorSelection,
} from './types'
import { applyDiffProposal as applyProposalToContent } from './lib/diffProposal'

const MAX_CHAT_ACTIVITY_LOG = 80

interface AppState {
  workspace: WorkspaceSnapshot | null
  tabs: DocumentTab[]
  activePath: string | null
  contextDocuments: ContextDocument[]
  pendingNewFiles: string[]
  messages: ChatMessage[]
  conversationId: string | null
  conversationTitle: string
  conversations: ConversationSummary[]
  chatRuns: Record<string, ChatRun>
  completedChatMessages: Record<string, ChatMessage>
  modelProfiles: ModelProfile[]
  activeModelId: string | null
  autoStopOllamaModels: boolean
  settingsOpen: boolean
  sidebarCollapsed: boolean
  settingsSidebarBeforeOpen: boolean | null
  settingsSidebarUserOverride: boolean
  theme: ThemeMode
  viewMode: ViewMode
  error: string | null
  editorSelection: EditorSelection | null
  pendingEditorRevision: EditorRevisionRequest | null
  diffProposal: DiffProposal | null
  setWorkspace: (workspace: WorkspaceSnapshot) => void
  openTab: (tab: DocumentTab) => void
  closeTab: (path: string) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string, content: string, modifiedMs: number) => void
  setViewMode: (mode: ViewMode) => void
  toggleContext: (document: ContextDocument) => void
  setPendingNewFiles: (paths: string[]) => void
  clearPendingNewFiles: () => void
  beginChatRun: (run: ChatRun) => void
  setChatRunStatus: (conversationId: string, status: ChatRunStatus, message?: string | null) => void
  appendChatRunChunk: (conversationId: string, chunk: string) => void
  resetChatRunResponse: (conversationId: string) => void
  endChatRun: (conversationId: string, discardAssistant: boolean) => void
  setConversation: (conversation: Conversation) => void
  newConversation: () => void
  setConversations: (conversations: ConversationSummary[]) => void
  removeConversation: (id: string) => void
  setModelProfiles: (profiles: ModelProfile[]) => void
  setActiveModelId: (id: string | null) => void
  setAutoStopOllamaModels: (enabled: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setTheme: (theme: ThemeMode) => void
  setError: (error: string | null) => void
  setEditorSelection: (selection: EditorSelection | null) => void
  prepareEditorRevision: (request: EditorRevisionRequest) => void
  clearPendingEditorRevision: () => void
  setDiffProposal: (proposal: DiffProposal | null) => void
  applyDiffProposal: () => void
  rejectDiffProposal: () => void
}

export interface ChatRun {
  conversationId: string
  conversationTitle: string
  requestId: string
  status: ChatRunStatus
  statusMessage: string | null
  activityLog: ChatActivity[]
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome', role: 'assistant', createdAt: Date.now(),
    content: '晚上好。你可以从文件页选取文档作为上下文，然后让我续写、改稿，或者一起梳理人物和情节。',
  },
]

function mergeRunMessages(messages: ChatMessage[], run: ChatRun | undefined): ChatMessage[] {
  if (!run) return messages
  const runMessages = [run.userMessage, run.assistantMessage]
  const replacements = new Map(runMessages.map((message) => [message.id, message]))
  const merged = messages.map((message) => replacements.get(message.id) ?? message)
  for (const message of runMessages) {
    if (!messages.some((item) => item.id === message.id)) merged.push(message)
  }
  return merged
}

export const useAppStore = create<AppState>((set, get) => ({
  workspace: null,
  tabs: [],
  activePath: null,
  contextDocuments: [],
  pendingNewFiles: [],
  messages: initialMessages,
  conversationId: null,
  conversationTitle: '新会话',
  conversations: [],
  chatRuns: {},
  completedChatMessages: {},
  modelProfiles: [],
  activeModelId: localStorage.getItem('vinkey.activeModelId'),
  autoStopOllamaModels: localStorage.getItem('vinkey.autoStopOllamaModels') !== 'false',
  settingsOpen: false,
  sidebarCollapsed: localStorage.getItem('vinkey.sidebarCollapsed') === 'true',
  settingsSidebarBeforeOpen: null,
  settingsSidebarUserOverride: false,
  theme: localStorage.getItem('vinkey.theme') === 'light' ? 'light' : 'dark',
  viewMode: 'edit',
  error: null,
  editorSelection: null,
  pendingEditorRevision: null,
  diffProposal: null,
  setWorkspace: (workspace) => set((state) => state.workspace?.id && state.workspace.id !== workspace.id
    ? { workspace, editorSelection: null, pendingEditorRevision: null, diffProposal: null }
    : { workspace }),
  openTab: (tab) => set((state) => ({
    tabs: state.tabs.some((item) => item.path === tab.path) ? state.tabs : [...state.tabs, tab],
    activePath: tab.path,
    viewMode: tab.kind !== 'markdown' && state.viewMode !== 'edit' ? 'edit' : state.viewMode,
  })),
  closeTab: (path) => set((state) => {
    const tabs = state.tabs.filter((tab) => tab.path !== path)
    const activePath = state.activePath === path ? tabs.at(-1)?.path ?? null : state.activePath
    return { tabs, activePath }
  }),
  updateContent: (path, content) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path ? { ...tab, content } : tab),
  })),
  markSaved: (path, content, modifiedMs) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path ? { ...tab, content, savedContent: content, modifiedMs } : tab),
  })),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleContext: (document) => set((state) => ({
    contextDocuments: state.contextDocuments.some((item) => item.path === document.path)
      ? state.contextDocuments.filter((item) => item.path !== document.path)
      : [...state.contextDocuments, document],
  })),
  setPendingNewFiles: (paths) => set({ pendingNewFiles: [...new Set(paths)].slice(0, 8) }),
  clearPendingNewFiles: () => set({ pendingNewFiles: [] }),
  beginChatRun: (run) => set((state) => {
    const activityLog = run.activityLog.length > 0
      ? run.activityLog
      : [{ status: run.status, message: run.statusMessage, timestamp: Date.now() }]
    const nextRun = {
      ...run,
      activityLog,
      assistantMessage: { ...run.assistantMessage, activityLog },
    }
    return {
      chatRuns: { ...state.chatRuns, [run.conversationId]: nextRun },
      messages: state.conversationId === run.conversationId
        ? mergeRunMessages(state.messages, nextRun)
        : state.messages,
    }
  }),
  setChatRunStatus: (conversationId, status, statusMessage = null) => set((state) => {
    const run = state.chatRuns[conversationId]
    if (!run || (run.status === status && run.statusMessage === statusMessage)) return state
    const completedAt = Date.now()
    const previous = run.activityLog.at(-1)
    const closedLog = previous && !previous.completedAt
      ? [...run.activityLog.slice(0, -1), { ...previous, completedAt }]
      : run.activityLog
    const activity: ChatActivity = { status, message: statusMessage, timestamp: completedAt }
    const activityLog = [...closedLog, activity].slice(-MAX_CHAT_ACTIVITY_LOG)
    const nextRun = {
      ...run,
      status,
      statusMessage,
      activityLog,
      assistantMessage: { ...run.assistantMessage, activityLog },
    }
    return {
      chatRuns: { ...state.chatRuns, [conversationId]: nextRun },
      messages: state.conversationId === conversationId
        ? mergeRunMessages(state.messages, nextRun)
        : state.messages,
    }
  }),
  appendChatRunChunk: (conversationId, chunk) => set((state) => {
    const run = state.chatRuns[conversationId]
    if (!run) return state
    const nextRun = {
      ...run,
      assistantMessage: { ...run.assistantMessage, content: run.assistantMessage.content + chunk },
    }
    return {
      chatRuns: { ...state.chatRuns, [conversationId]: nextRun },
      messages: state.conversationId === conversationId
        ? mergeRunMessages(state.messages, nextRun)
        : state.messages,
    }
  }),
  resetChatRunResponse: (conversationId) => set((state) => {
    const run = state.chatRuns[conversationId]
    if (!run || !run.assistantMessage.content) return state
    const nextRun = {
      ...run,
      assistantMessage: { ...run.assistantMessage, content: '' },
    }
    return {
      chatRuns: { ...state.chatRuns, [conversationId]: nextRun },
      messages: state.conversationId === conversationId
        ? mergeRunMessages(state.messages, nextRun)
        : state.messages,
    }
  }),
  endChatRun: (conversationId, discardAssistant) => set((state) => {
    const run = state.chatRuns[conversationId]
    if (!run) return state
    const chatRuns = { ...state.chatRuns }
    delete chatRuns[conversationId]
    const completedAt = Date.now()
    const previous = run.activityLog.at(-1)
    const activityLog = previous && !previous.completedAt
      ? [...run.activityLog.slice(0, -1), { ...previous, completedAt }]
      : run.activityLog
    const completedAssistant = { ...run.assistantMessage, completedAt, activityLog }
    const completedChatMessages = { ...state.completedChatMessages }
    if (discardAssistant || !completedAssistant.content.trim()) delete completedChatMessages[conversationId]
    else completedChatMessages[conversationId] = completedAssistant
    const nextRun = { ...run, assistantMessage: completedAssistant }
    return {
      chatRuns,
      completedChatMessages,
      messages: state.conversationId === conversationId
        ? (discardAssistant
          ? state.messages.filter((message) => message.id !== run.assistantMessage.id)
          : mergeRunMessages(state.messages, nextRun))
        : state.messages,
    }
  }),
  setConversation: (conversation) => set((state) => ({
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    messages: mergeRunMessages(
      conversation.messages.map((message) => state.completedChatMessages[conversation.id]?.id === message.id
        ? state.completedChatMessages[conversation.id]
        : message),
      state.chatRuns[conversation.id],
    ),
    settingsOpen: false,
    sidebarCollapsed: state.settingsOpen && !state.settingsSidebarUserOverride
      ? state.settingsSidebarBeforeOpen ?? state.sidebarCollapsed
      : state.sidebarCollapsed,
    settingsSidebarBeforeOpen: null,
    settingsSidebarUserOverride: false,
  })),
  newConversation: () => set({ conversationId: null, conversationTitle: '新会话', messages: initialMessages, contextDocuments: [], editorSelection: null, pendingEditorRevision: null }),
  setConversations: (conversations) => set({ conversations }),
  removeConversation: (id) => set((state) => {
    const completedChatMessages = { ...state.completedChatMessages }
    delete completedChatMessages[id]
    const conversations = state.conversations.filter((conversation) => conversation.id !== id)
    if (state.conversationId !== id) return { conversations, completedChatMessages }
    return {
      conversations,
      completedChatMessages,
      conversationId: null,
      conversationTitle: '新会话',
      messages: initialMessages,
      contextDocuments: [],
    }
  }),
  setModelProfiles: (modelProfiles) => set((state) => ({
    modelProfiles,
    activeModelId: modelProfiles.some((profile) => profile.id === state.activeModelId) ? state.activeModelId : modelProfiles[0]?.id ?? null,
  })),
  setActiveModelId: (activeModelId) => { if (activeModelId) localStorage.setItem('vinkey.activeModelId', activeModelId); set({ activeModelId }) },
  setAutoStopOllamaModels: (autoStopOllamaModels) => {
    localStorage.setItem('vinkey.autoStopOllamaModels', String(autoStopOllamaModels))
    set({ autoStopOllamaModels })
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    localStorage.setItem('vinkey.sidebarCollapsed', String(sidebarCollapsed))
    set((state) => ({
      sidebarCollapsed,
      settingsSidebarUserOverride: state.settingsOpen ? true : state.settingsSidebarUserOverride,
    }))
  },
  setSettingsOpen: (settingsOpen) => set((state) => {
    if (settingsOpen === state.settingsOpen) return state
    if (settingsOpen) {
      return {
        settingsOpen: true,
        settingsSidebarBeforeOpen: state.sidebarCollapsed,
        settingsSidebarUserOverride: false,
        sidebarCollapsed: true,
      }
    }
    return {
      settingsOpen: false,
      sidebarCollapsed: state.settingsSidebarUserOverride
        ? state.sidebarCollapsed
        : state.settingsSidebarBeforeOpen ?? state.sidebarCollapsed,
      settingsSidebarBeforeOpen: null,
      settingsSidebarUserOverride: false,
    }
  }),
  setTheme: (theme) => { localStorage.setItem('vinkey.theme', theme); set({ theme }) },
  setError: (error) => set({ error }),
  setEditorSelection: (editorSelection) => set({ editorSelection }),
  prepareEditorRevision: (pendingEditorRevision) => set({ pendingEditorRevision }),
  clearPendingEditorRevision: () => set({ pendingEditorRevision: null }),
  setDiffProposal: (diffProposal) => set({ diffProposal }),
  applyDiffProposal: () => {
    const state = get()
    const proposal = state.diffProposal
    if (!proposal) return
    const tab = state.tabs.find((item) => item.path === proposal.path)
    if (!tab) throw new Error('DiffProposal 的目标文档未打开。')
    const content = applyProposalToContent(tab.content, proposal)
    set({
      tabs: state.tabs.map((item) => item.path === proposal.path ? { ...item, content } : item),
      diffProposal: { ...proposal, status: 'applied' }, editorSelection: null,
    })
  },
  rejectDiffProposal: () => set((state) => ({
    diffProposal: state.diffProposal ? { ...state.diffProposal, status: 'rejected' } : null,
  })),
}))
