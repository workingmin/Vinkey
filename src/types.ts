export type EntryKind = 'directory' | 'file'
export type DocumentKind = 'markdown' | 'text' | 'code' | 'image' | 'pdf' | 'audio' | 'video' | 'binary'
export type ViewMode = 'edit' | 'split' | 'preview'
export type ProviderKind = 'ollama' | 'openai-compatible'
export type ThemeMode = 'dark' | 'light'
export type AnalysisMode = 'overview' | 'focused' | 'deep'
export type AnalysisCoverage = 'index-only' | 'targeted' | 'exhaustive'
export type SourcePolicy = 'metadata-only' | 'local-excerpts' | 'local-chunks'

export interface WorkspaceEntry {
  name: string
  path: string
  kind: EntryKind
  children: WorkspaceEntry[]
  documentKind?: DocumentKind
}
export interface WorkspaceSnapshot {
  id: string
  name: string
  pathLabel: string
  entries: WorkspaceEntry[]
}

export interface WorkspaceDocumentRef {
  path: string
  name: string
  kind: DocumentKind
  reason?: 'supported' | 'sensitive' | 'unsupported' | 'not-targeted' | 'too-large' | 'read-error'
}

export interface DocumentSnapshot {
  path: string
  name: string
  content: string
  kind: DocumentKind
  modifiedMs: number
  lineEnding: 'lf' | 'crlf'
  hasBom: boolean
  mimeType?: string | null
  sizeBytes?: number
}

export interface DocumentTab extends DocumentSnapshot {
  savedContent: string
}

export interface TextChunk {
  id: string
  sourceId: string
  text: string
  startChar: number
  endChar: number
  lineStart: number
  lineEnd: number
  heading?: string | null
  estimatedTokens: number
  splitReason: string
  overlapFromPrevious: boolean
}

export interface ChunkManifest {
  sourceId: string
  sourceFingerprint: string
  algorithmVersion: string
  cacheKey: string
  sourceTokens: number
  maxTokens: number
  overlapTokens: number
  chunks: TextChunk[]
}

export interface ContextDocument {
  path: string
  name: string
  content: string
  size: number
  /** Original byte size when the source reader can provide it. */
  sizeBytes?: number
  kind?: DocumentKind
}

export interface EvidenceReference {
  sourceId: string
  chunkId?: string | null
  lineStart: number
  lineEnd: number
  startChar?: number | null
  endChar?: number | null
  quote?: string | null
  verified: boolean
  verificationError?: string | null
}

export type AnalysisJobStatus = 'planned' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AnalysisJobManifest {
  jobId: string
  workspaceId: string
  instruction: string
  status: AnalysisJobStatus
  createdAt: number
  updatedAt: number
  documentCount: number
  supportedDocumentCount: number
  excludedDocuments: WorkspaceDocumentRef[]
  sourceFingerprints: Record<string, string>
  chunkCount?: number
  summaryCount?: number
  evidenceCount?: number
  error?: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  completedAt?: number
  activityLog?: ChatActivity[]
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

export type ProjectMemoryKind = 'summary' | 'fact' | 'character' | 'timeline' | 'foreshadowing' | 'decision'
export type ProjectMemoryStatus = 'proposed' | 'confirmed' | 'rejected'

export interface ProjectMemoryItem {
  id: string
  kind: ProjectMemoryKind
  title: string
  content: string
  sourcePaths: string[]
  confidence: 'low' | 'medium' | 'high'
  status: ProjectMemoryStatus
  createdAt: number
  updatedAt: number
}

export interface ProjectMemoryCandidate {
  id: string
  kind: ProjectMemoryKind
  title: string
  content: string
  sourcePaths: string[]
  confidence?: 'low' | 'medium' | 'high'
}

export interface CharacterRecord {
  id: string
  workId: string
  canonicalName: string
  aliases: string[]
  description: string
  confidence: 'low' | 'medium' | 'high'
  status: ProjectMemoryStatus
  createdAt: number
  updatedAt: number
}

export interface CharacterInput {
  id: string
  workId: string
  canonicalName: string
  aliases?: string[]
  description?: string
  confidence?: CharacterRecord['confidence']
  status?: ProjectMemoryStatus
}

export interface CharacterMentionInput {
  id: string
  workId: string
  characterId: string
  sourceId: string
  chapterId?: string | null
  sceneId?: string | null
  startChar: number
  endChar: number
  lineStart: number
  lineEnd: number
  quote?: string | null
  sourceFingerprint?: string | null
}

export interface RelationshipInput {
  id: string
  workId: string
  sourceCharacterId: string
  targetCharacterId: string
  relationType: string
  directed: boolean
  confidence?: CharacterRecord['confidence']
  status?: ProjectMemoryStatus
  firstSeenAt?: number | null
  lastSeenAt?: number | null
}

export interface RelationshipEvidenceInput {
  id: string
  relationshipId: string
  sourceId: string
  chapterId?: string | null
  sceneId?: string | null
  startChar: number
  endChar: number
  lineStart: number
  lineEnd: number
  quote?: string | null
  sourceFingerprint?: string | null
}

export interface CharacterScore {
  characterId: string
  degree: number
}

export interface CharacterGraphStats {
  nodeCount: number
  edgeCount: number
  connectedComponents: number
  isolatedNodeCount: number
  averageDegree: number
  maxDegree: number
  topCharacters: CharacterScore[]
}

export interface CharacterGraphBenchmark {
  stats: CharacterGraphStats
  loadMicros: number
  statsP50Micros: number
  statsP95Micros: number
  pathP50Micros: number
  pathP95Micros: number
  pathFound: boolean
  iterations: number
}

export interface CharacterNeighbor {
  relationshipId: string
  characterId: string
  relationType: string
  directed: boolean
  confidence: CharacterRecord['confidence']
  status: ProjectMemoryStatus
}

export interface ChatRequest {
  requestId: string
  profileId: string
  sourcePolicy: SourcePolicy
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
}

export type ChatRunStatus = 'sending' | 'thinking' | 'fetching' | 'tool_calling' | 'streaming' | 'stopping'

export interface ChatActivity {
  status: ChatRunStatus
  message: string | null
  timestamp: number
  completedAt?: number
}

export type ChatStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
