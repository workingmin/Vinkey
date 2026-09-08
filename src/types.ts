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
export interface ProjectSummary {
  id: string
  name: string
  pathLabel: string
}

export interface WorkspaceSnapshot extends ProjectSummary {
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

export type TaskJobStatus = AnalysisJobStatus | 'paused'
export type TaskJobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TaskJobStep {
  id: string
  kind: string
  status: TaskJobStepStatus
  attempt: number
  checkpoint?: string | null
  updatedAt: number
}

export interface TaskJobEvent {
  sequence: number
  stepId?: string | null
  eventType: string
  timestamp: number
  fields: Record<string, unknown>
}

export type ServiceErrorCategory = 'model' | 'compatibility' | 'authorization' | 'validation' | 'capacity' | 'io' | 'internal'

export interface ServiceError {
  code: string
  category: ServiceErrorCategory
  message: string
  retryable: boolean
  stepId?: string | null
}

export interface TaskJob {
  taskId: string
  workspaceId: string
  taskType: string
  instructionHash: string
  status: TaskJobStatus
  cancelRequested: boolean
  sourceFingerprints: Record<string, string>
  steps: TaskJobStep[]
  events: TaskJobEvent[]
  error?: string | null
  failure?: ServiceError | null
  createdAt: number
  updatedAt: number
}

export interface StartTaskJobInput {
  taskId: string
  taskType: string
  instructionHash: string
  sourceFingerprints: Record<string, string>
}

export interface UpdateTaskJobInput {
  taskId: string
  status?: TaskJobStatus
  stepId?: string
  stepKind?: string
  stepStatus?: TaskJobStepStatus
  checkpoint?: string
  error?: string
  eventType?: string
  eventFields?: Record<string, unknown>
}

export interface StartLongTextWorkerInput {
  jobId: string
  instruction: string
  instructionHash: string
  profileId: string
  contextWindow: number
  sourcePolicy: 'local-chunks'
  maxTokens: number
  overlapTokens: number
  dispatch: {
    jobId: string
    workspaceId: string
    policyVersion: string
    dispatchVersion: string
    serviceId: string
    executionOwner: string
  }
  documentIndex?: string | null
  documents: Array<{ path: string; sourceFingerprint: string }>
  excludedDocuments: WorkspaceDocumentRef[]
}

export interface LongTextWorkerOutput {
  workerVersion: string
  promptVersion: string
  outputSchemaVersion: string
  compatibilityKey: string
  pipelineCompleted: boolean
  jobId: string
  workspaceId: string
  sourceFingerprints: Record<string, string>
  manifests: ChunkManifest[]
  content: string
  evidence: EvidenceReference[]
  chunkCount: number
  summaryCount: number
  modelInvocationCount: number
  mapCacheHits: number
  jobCheckpointHits: number
  durationMs: number
  completedAt: number
}

export interface TaskWorkerEvent {
  sequence: number
  timestamp: number
  jobId: string
  stage: 'chunking' | 'map' | 'reduce' | 'synthesis' | 'evidence' | 'lifecycle'
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  completed: number
  total: number
  message: string
}

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
  taskRef?: TaskMessageRef | null
}

export interface TaskMessageRef {
  taskId: string
  intent: string
  scope: string
  actionId?: string | null
  targets: Array<{ id: string; kind: 'document' | 'selection' | 'chapter' | 'work' }>
  sideEffect: 'read' | 'draft' | 'proposal'
}

export interface EditorSelection {
  path: string
  from: number
  to: number
  text: string
}

export interface EditorRevisionRequest extends EditorSelection {
  documentName: string
  instruction: string
  sourceModifiedMs: number
  sourceFingerprint: string
}

export interface DiffProposal extends EditorSelection {
  id: string
  proposalSetId?: string
  targetId?: string
  chunkIndex?: number
  chunkCount?: number
  replacementText: string
  instruction: string
  sourceModifiedMs: number
  sourceFingerprint: string
  status: 'proposed' | 'applied' | 'rejected'
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
  connectionId?: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  contextWindow: number
  hasApiKey: boolean
  updatedAt: number
}

export interface ModelConnection {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  hasApiKey: boolean
  updatedAt: number
}

export interface ModelConnectionInput extends Omit<ModelConnection, 'hasApiKey' | 'updatedAt'> {
  apiKey?: string
  clearApiKey?: boolean
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

export interface OllamaStopResult {
  stopped: boolean
  message: string
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
