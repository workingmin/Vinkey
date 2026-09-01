export type EntryKind = 'directory' | 'file'
export type DocumentKind = 'markdown' | 'text'
export type ViewMode = 'edit' | 'split' | 'preview'
export type ProviderKind = 'ollama' | 'openai-compatible'
export type ThemeMode = 'dark' | 'light'

export interface WorkspaceEntry {
  name: string
  path: string
  kind: EntryKind
  children: WorkspaceEntry[]
}
export interface WorkspaceSnapshot {
  id: string
  name: string
  pathLabel: string
  entries: WorkspaceEntry[]
}

export interface DocumentSnapshot {
  path: string
  name: string
  content: string
  kind: DocumentKind
  modifiedMs: number
  lineEnding: 'lf' | 'crlf'
  hasBom: boolean
}

export interface DocumentTab extends DocumentSnapshot {
  savedContent: string
}

export interface ContextDocument {
  path: string
  name: string
  content: string
  size: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: number
  messageCount: number
}

export interface ModelProfile {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  contextWindow: number
  hasApiKey: boolean
  updatedAt: number
}

export interface ModelProfileInput extends Omit<ModelProfile, 'hasApiKey' | 'updatedAt'> {
  apiKey?: string
  clearApiKey?: boolean
}

export interface ModelConnectionResult {
  ok: boolean
  message: string
  models: string[]
}

export interface SearchHit {
  path: string
  line: number
  snippet: string
}

export interface ChatRequest {
  requestId: string
  profileId: string
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
}

export type ChatStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
