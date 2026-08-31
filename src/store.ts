import { create } from 'zustand'
import type {
  ChatMessage, ContextDocument, Conversation, ConversationSummary, DocumentTab, LeftPanelMode,
  ModelProfile, ThemeMode, ViewMode, WorkspaceSnapshot,
} from './types'

interface AppState {
  workspace: WorkspaceSnapshot | null
  tabs: DocumentTab[]
  activePath: string | null
  contextDocuments: ContextDocument[]
  messages: ChatMessage[]
  conversationId: string | null
  conversationTitle: string
  conversations: ConversationSummary[]
  modelProfiles: ModelProfile[]
  activeModelId: string | null
  settingsOpen: boolean
  theme: ThemeMode
  leftMode: LeftPanelMode
  viewMode: ViewMode
  editorVisible: boolean
  busy: boolean
  error: string | null
  setWorkspace: (workspace: WorkspaceSnapshot) => void
  setLeftMode: (mode: LeftPanelMode) => void
  openTab: (tab: DocumentTab) => void
  closeTab: (path: string) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string, content: string, modifiedMs: number) => void
  setViewMode: (mode: ViewMode) => void
  setEditorVisible: (visible: boolean) => void
  toggleContext: (document: ContextDocument) => void
  addMessage: (message: ChatMessage) => void
  removeMessage: (id: string) => void
  appendAssistantChunk: (id: string, chunk: string) => void
  setConversation: (conversation: Conversation) => void
  newConversation: () => void
  setConversations: (conversations: ConversationSummary[]) => void
  setModelProfiles: (profiles: ModelProfile[]) => void
  setActiveModelId: (id: string | null) => void
  setSettingsOpen: (open: boolean) => void
  setTheme: (theme: ThemeMode) => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
}

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome', role: 'assistant', createdAt: Date.now(),
    content: '晚上好。你可以选取左侧文档作为上下文，然后让我续写、改稿，或者一起梳理人物和情节。',
  },
]

export const useAppStore = create<AppState>((set) => ({
  workspace: null,
  tabs: [],
  activePath: null,
  contextDocuments: [],
  messages: initialMessages,
  conversationId: null,
  conversationTitle: '新会话',
  conversations: [],
  modelProfiles: [],
  activeModelId: localStorage.getItem('vinkey.activeModelId'),
  settingsOpen: false,
  theme: localStorage.getItem('vinkey.theme') === 'light' ? 'light' : 'dark',
  leftMode: 'files',
  viewMode: 'edit',
  editorVisible: false,
  busy: false,
  error: null,
  setWorkspace: (workspace) => set({ workspace }),
  setLeftMode: (leftMode) => set({ leftMode }),
  openTab: (tab) => set((state) => ({
    tabs: state.tabs.some((item) => item.path === tab.path) ? state.tabs : [...state.tabs, tab],
    activePath: tab.path,
    editorVisible: true,
    viewMode: tab.kind === 'text' && state.viewMode === 'preview' ? 'edit' : state.viewMode,
  })),
  closeTab: (path) => set((state) => {
    const tabs = state.tabs.filter((tab) => tab.path !== path)
    const activePath = state.activePath === path ? tabs.at(-1)?.path ?? null : state.activePath
    return { tabs, activePath, editorVisible: tabs.length > 0 }
  }),
  updateContent: (path, content) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path ? { ...tab, content } : tab),
  })),
  markSaved: (path, content, modifiedMs) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path ? { ...tab, content, savedContent: content, modifiedMs } : tab),
  })),
  setViewMode: (viewMode) => set({ viewMode }),
  setEditorVisible: (editorVisible) => set({ editorVisible }),
  toggleContext: (document) => set((state) => ({
    contextDocuments: state.contextDocuments.some((item) => item.path === document.path)
      ? state.contextDocuments.filter((item) => item.path !== document.path)
      : [...state.contextDocuments, document],
  })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  removeMessage: (id) => set((state) => ({ messages: state.messages.filter((message) => message.id !== id) })),
  appendAssistantChunk: (id, chunk) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, content: message.content + chunk } : message),
  })),
  setConversation: (conversation) => set({
    conversationId: conversation.id, conversationTitle: conversation.title, messages: conversation.messages,
    settingsOpen: false,
  }),
  newConversation: () => set({ conversationId: null, conversationTitle: '新会话', messages: initialMessages, contextDocuments: [] }),
  setConversations: (conversations) => set({ conversations }),
  setModelProfiles: (modelProfiles) => set((state) => ({
    modelProfiles,
    activeModelId: modelProfiles.some((profile) => profile.id === state.activeModelId) ? state.activeModelId : modelProfiles[0]?.id ?? null,
  })),
  setActiveModelId: (activeModelId) => { if (activeModelId) localStorage.setItem('vinkey.activeModelId', activeModelId); set({ activeModelId }) },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setTheme: (theme) => { localStorage.setItem('vinkey.theme', theme); set({ theme }) },
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}))
