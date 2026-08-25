export type EntryKind = 'directory' | 'file'
export type DocumentKind = 'markdown' | 'text'
export type ViewMode = 'edit' | 'split' | 'preview'
export type LeftPanelMode = 'files' | 'search' | 'conversations'

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
