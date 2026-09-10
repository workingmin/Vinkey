import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import type {
  ChatMessage, ChatRequest, ChatStreamEvent, ContextDocument, Conversation, ConversationSummary,
  ChunkManifest, DocumentSnapshot, ModelConnection, ModelConnectionInput, ModelConnectionResult, ModelProfile, ModelProfileInput, OllamaStopResult, SearchHit,
  AnalysisJobManifest, CharacterGraphBenchmark, CharacterGraphStats, CharacterInput, CharacterMentionInput, CharacterNeighbor, CharacterRecord,
  LongTextWorkerOutput, StartLongTextWorkerInput, StartTaskJobInput, TaskJob, TaskJobStep, TaskWorkerEvent, UpdateTaskJobInput,
  ProjectMemoryCandidate, ProjectMemoryItem, ProjectMemoryStatus, RelationshipEvidenceInput, RelationshipInput,
  ThemeMode, WorkspaceSnapshot, ProjectSummary,
} from '../types'
import { getDocumentKind } from './fileTypes'
import { buildStructureOutputs } from './structureSegmentation'
import type { StructureProposal } from './structureSegmentation'
import { createTaskExecutionDispatch, validateTaskExecutionInput } from './taskRuntime'
import type { TaskExecutionDispatch, TaskExecutionInput } from './taskRuntime'
import type { LocalHardware } from './hardwareProfile'

export async function getLocalHardware(): Promise<LocalHardware> {
  if (!isDesktop()) return { platform: 'demo', architecture: 'demo', totalMemoryBytes: null, gpuMemoryBytes: null, unifiedMemory: false }
  return invoke<LocalHardware>('get_local_hardware')
}

export async function probeModelContext(profileId: string, requestedContext: number): Promise<number> {
  if (!isDesktop()) return requestedContext
  return invoke<number>('probe_model_context', { profileId, requestedContext })
}

const PROFILE_KEY = 'vinkey.demo.modelProfiles'
const CONNECTION_KEY = 'vinkey.demo.modelConnections'
const CONVERSATION_KEY = 'vinkey.demo.conversations'
const PROJECTS_KEY = 'vinkey.demo.projects'
const MEMORY_KEY = 'vinkey.demo.projectMemory'
const demoCancellations = new Set<string>()
const demoTaskJobs = new Map<string, TaskJob>()
const demoProjectDocuments = new Map<string, Map<string, DocumentSnapshot>>()

export interface RuntimeDiagnostics {
  path: string
  platform: string
  version: string
  lines: string[]
}

const demoDocuments = new Map<string, DocumentSnapshot>([
  ['00-创作说明.md', {
    path: '00-创作说明.md',
    name: '00-创作说明.md',
    content: '# 雾港来信\n\n一部长篇悬疑小说。故事发生在终年多雾的临海小城，主角林晚回乡整理父亲遗物，却发现一叠从未寄出的信。\n\n## 当前目标\n\n补全第一章结尾，让读者意识到来信的日期存在问题。',
    kind: 'markdown',
    modifiedMs: 1724515200000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['章节/第一章.md', {
    path: '章节/第一章.md',
    name: '第一章.md',
    content: '# 第一章 归港\n\n傍晚六点，渡轮终于靠岸。\n\n林晚站在甲板最末端，隔着一层潮湿的玻璃看见雾中的旧钟楼。指针停在五点四十分，和她离开这里的那天一模一样。\n\n她下意识摸了摸行李箱夹层。父亲留下的第七封信就在那里。',
    kind: 'markdown',
    modifiedMs: 1724601600000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['设定/人物.md', {
    path: '设定/人物.md',
    name: '人物.md',
    content: '# 人物\n\n## 林晚\n\n29 岁，纪录片剪辑师。观察敏锐，习惯用事实回避情绪。\n\n## 林崇山\n\n林晚的父亲，港口旧钟楼的维护员，三个月前去世。',
    kind: 'markdown',
    modifiedMs: 1724688000000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['设定/时间线.txt', {
    path: '设定/时间线.txt',
    name: '时间线.txt',
    content: '2008-09-17 林晚离开雾港\n2024-04-03 林崇山去世\n2024-05-12 林晚收到没有邮戳的信\n2024-05-18 林晚回到雾港',
    kind: 'text',
    modifiedMs: 1724774400000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['代码/线索.ts', {
    path: '代码/线索.ts',
    name: '线索.ts',
    content: "export const clues = ['停在五点四十分的钟楼', '没有邮戳的信']\n",
    kind: 'code',
    modifiedMs: 1724860800000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['素材/雾港标记.svg', {
    path: '素材/雾港标记.svg',
    name: '雾港标记.svg',
    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#182326"/><path d="M20 60L48 20l18 24 12-14 22 30z" fill="#36b8c4"/></svg>',
    kind: 'image',
    mimeType: 'image/svg+xml',
    modifiedMs: 1724947200000,
    lineEnding: 'lf',
    hasBom: false,
  }],
])

function demoWorkspace(): WorkspaceSnapshot {
  return {
    id: 'demo-workspace',
    name: '雾港来信',
    pathLabel: '浏览器演示工作区',
    entries: [
      { name: '00-创作说明.md', path: '00-创作说明.md', kind: 'file', children: [] },
      {
        name: '章节', path: '章节', kind: 'directory', children: [
          { name: '第一章.md', path: '章节/第一章.md', kind: 'file', children: [] },
        ],
      },
      {
        name: '设定', path: '设定', kind: 'directory', children: [
          { name: '人物.md', path: '设定/人物.md', kind: 'file', children: [] },
          { name: '时间线.txt', path: '设定/时间线.txt', kind: 'file', children: [] },
        ],
      },
      {
        name: '代码', path: '代码', kind: 'directory', children: [
          { name: '线索.ts', path: '代码/线索.ts', kind: 'file', children: [], documentKind: 'code' },
        ],
      },
      {
        name: '素材', path: '素材', kind: 'directory', children: [
          { name: '雾港标记.svg', path: '素材/雾港标记.svg', kind: 'file', children: [], documentKind: 'image' },
        ],
      },
    ],
  }
}

export const isDesktop = () => '__TAURI_INTERNALS__' in window

export async function syncNativeWindowTheme(theme: ThemeMode): Promise<string | null> {
  if (!isDesktop()) return null
  return invoke<string>('sync_native_window_theme', { theme })
}

export async function syncNativeWindowControls(sidebarWidth: number): Promise<void> {
  if (!isDesktop()) return
  await invoke('sync_native_window_controls', { sidebarWidth })
}

export async function getWindowDiagnostics(): Promise<string> {
  if (!isDesktop()) return '窗口诊断仅在桌面应用中可用。'
  return invoke<string>('get_window_diagnostics')
}

export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  if (!isDesktop()) return { path: '浏览器演示模式', platform: 'web', version: '0.1.0', lines: [] }
  return invoke<RuntimeDiagnostics>('get_runtime_diagnostics')
}

export async function recordRuntimeEvent(event: string, message?: string): Promise<void> {
  if (!isDesktop()) return
  await invoke('record_runtime_event', { event, message })
}

export async function chooseWorkspace(): Promise<WorkspaceSnapshot | null> {
  if (!isDesktop()) {
    const name = window.prompt('项目名称（浏览器演示）', '新项目')?.trim()
    if (!name) return null
    const catalog = readDemoProjects()
    let project = catalog.projects.find((item) => item.name === name)
    if (!project) {
      project = { id: crypto.randomUUID(), name, pathLabel: `浏览器演示/${name}` }
      catalog.projects.push(project)
    }
    catalog.activeId = project.id
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(catalog))
    return { ...demoWorkspace(), ...project }
  }
  const selected = await open({ directory: true, multiple: false, title: '选择 Vinkey 工作目录' })
  if (!selected) return null
  return invoke<WorkspaceSnapshot>('authorize_workspace', { root: selected })
}

export async function refreshWorkspace(): Promise<WorkspaceSnapshot> {
  if (!isDesktop()) {
    const catalog = readDemoProjects()
    const project = catalog.projects.find((item) => item.id === catalog.activeId)
    if (!project) throw new Error('请先选择工作目录')
    return { ...demoWorkspace(), ...project }
  }
  return invoke<WorkspaceSnapshot>('get_workspace')
}

function readDemoProjects(): { projects: ProjectSummary[]; activeId: string | null } {
  const saved = localStorage.getItem(PROJECTS_KEY)
  if (saved) return JSON.parse(saved)
  const { entries: _entries, ...project } = demoWorkspace()
  const catalog = { projects: [project], activeId: project.id }
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(catalog))
  return catalog
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!isDesktop()) return readDemoProjects().projects
  return invoke<ProjectSummary[]>('list_projects')
}

export async function activateProject(id: string): Promise<WorkspaceSnapshot> {
  if (!isDesktop()) {
    const catalog = readDemoProjects()
    const project = catalog.projects.find((item) => item.id === id)
    if (!project) throw new Error('项目记录不存在')
    catalog.activeId = id
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(catalog))
    return { ...demoWorkspace(), ...project }
  }
  return invoke<WorkspaceSnapshot>('activate_project', { id })
}

export async function deleteProject(id: string, confirmation: string): Promise<void> {
  if (!isDesktop()) {
    const catalog = readDemoProjects()
    const project = catalog.projects.find((item) => item.id === id)
    if (!project || confirmation !== project.name) throw new Error('项目名称不匹配')
    const conversationKey = demoConversationKey(id)
    catalog.projects = catalog.projects.filter((item) => item.id !== id)
    if (catalog.activeId === id) catalog.activeId = null
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(catalog))
    localStorage.removeItem(conversationKey)
    return
  }
  await invoke('delete_project', { id, confirmation })
}

export async function readDocument(path: string): Promise<DocumentSnapshot> {
  if (!isDesktop()) {
    const document = currentDemoDocuments().get(path)
    if (!document) throw new Error(`找不到文档：${path}`)
    return { ...document }
  }
  return invoke<DocumentSnapshot>('read_document', { path })
}

export async function chunkDocument(
  path: string,
  maxTokens = 2048,
  overlapTokens = 128,
): Promise<ChunkManifest> {
  if (!isDesktop()) {
    const document = await readDocument(path)
    return {
      sourceId: path,
      sourceFingerprint: 'demo',
      algorithmVersion: 'demo',
      cacheKey: 'demo',
      sourceTokens: document.content.length,
      maxTokens,
      overlapTokens,
      chunks: [{
        id: `${path}:chunk-0`, sourceId: path, text: document.content,
        startChar: 0, endChar: document.content.length, lineStart: 1,
        lineEnd: document.content.split('\n').length, heading: null,
        estimatedTokens: document.content.length, splitReason: 'demo',
        overlapFromPrevious: false,
      }],
    }
  }
  return invoke<ChunkManifest>('chunk_document', { path, maxTokens, overlapTokens })
}

export async function writeAnalysisArtifact(jobId: string, name: string, content: string): Promise<string | null> {
  if (!isDesktop()) return null
  return invoke<string>('write_analysis_artifact', { jobId, name, content })
}

export async function readAnalysisArtifact(jobId: string, name: string): Promise<string | null> {
  if (!isDesktop()) return null
  return invoke<string>('read_analysis_artifact', { jobId, name })
}

export async function listAnalysisJobs(): Promise<AnalysisJobManifest[]> {
  if (!isDesktop()) return []
  return invoke<AnalysisJobManifest[]>('list_analysis_jobs')
}

export async function startTaskJob(input: StartTaskJobInput): Promise<TaskJob> {
  if (!isDesktop()) {
    const existing = demoTaskJobs.get(input.taskId)
    const now = Date.now()
    const job: TaskJob = existing
      ? { ...existing, status: 'running', cancelRequested: false, error: null, updatedAt: now }
      : {
          ...input, workspaceId: currentDemoProjectId(), status: 'running', cancelRequested: false,
          steps: [], events: [], createdAt: now, updatedAt: now,
        }
    demoTaskJobs.set(input.taskId, job)
    return structuredClone(job)
  }
  return invoke<TaskJob>('start_task_job', { input })
}

export async function updateTaskJob(input: UpdateTaskJobInput): Promise<TaskJob> {
  if (!isDesktop()) {
    const job = demoTaskJobs.get(input.taskId)
    if (!job) throw new Error('找不到任务')
    const now = Date.now()
    const steps = [...job.steps]
    if (input.stepId) {
      const index = steps.findIndex((step) => step.id === input.stepId)
      const step = {
        id: input.stepId, kind: input.stepKind ?? steps[index]?.kind ?? input.stepId,
        status: input.stepStatus ?? 'running', attempt: steps[index]?.attempt ?? 1,
        checkpoint: input.checkpoint ?? steps[index]?.checkpoint ?? null, updatedAt: now,
      } satisfies TaskJobStep
      if (index >= 0) steps[index] = step
      else steps.push(step)
    }
    const next: TaskJob = { ...job, status: input.status ?? job.status, error: input.error ?? (input.status === 'failed' ? job.error : null), steps, updatedAt: now }
    demoTaskJobs.set(input.taskId, next)
    return structuredClone(next)
  }
  return invoke<TaskJob>('update_task_job', { input: { ...input, eventFields: input.eventFields ?? {} } })
}

export async function getTaskJob(taskId: string): Promise<TaskJob> {
  if (!isDesktop()) {
    const job = demoTaskJobs.get(taskId)
    if (!job) throw new Error('找不到任务')
    return structuredClone(job)
  }
  return invoke<TaskJob>('get_task_job', { taskId })
}

export async function listTaskJobs(): Promise<TaskJob[]> {
  if (!isDesktop()) return [...demoTaskJobs.values()].filter((job) => job.workspaceId === currentDemoProjectId()).sort((left, right) => right.updatedAt - left.updatedAt).map((job) => structuredClone(job))
  return invoke<TaskJob[]>('list_task_jobs')
}

export async function cancelTaskJob(taskId: string): Promise<TaskJob> {
  if (!isDesktop()) {
    const job = demoTaskJobs.get(taskId)
    if (!job) throw new Error('找不到任务')
    const cancelled = { ...job, status: 'cancelled' as const, cancelRequested: true, updatedAt: Date.now() }
    demoTaskJobs.set(taskId, cancelled)
    return structuredClone(cancelled)
  }
  return invoke<TaskJob>('cancel_task_job', { taskId })
}

export async function prepareLongTextWorker(
  input: StartLongTextWorkerInput,
  onEvent?: (event: TaskWorkerEvent) => void,
  authorizationTicket?: string | null,
): Promise<LongTextWorkerOutput> {
  if (!isDesktop()) {
    let sequence = 1
    await startTaskJob({
      taskId: input.jobId,
      taskType: 'long-text-analysis',
      instructionHash: input.instructionHash,
      sourceFingerprints: Object.fromEntries(input.documents.map((document) => [document.path, document.sourceFingerprint])),
    })
    const manifests: ChunkManifest[] = []
    onEvent?.({ sequence: sequence++, timestamp: Date.now(), jobId: input.jobId, stage: 'chunking', status: 'running', completed: 0, total: input.documents.length, message: '浏览器演示正在准备分块' })
    for (const [index, document] of input.documents.entries()) {
      manifests.push(await chunkDocument(document.path, input.maxTokens, input.overlapTokens))
      onEvent?.({ sequence: sequence++, timestamp: Date.now(), jobId: input.jobId, stage: 'chunking', status: 'running', completed: index + 1, total: input.documents.length, message: `已完成分块：${document.path}` })
    }
    await updateTaskJob({
      taskId: input.jobId,
      stepId: 'chunking',
      stepKind: 'chunking',
      stepStatus: 'completed',
      checkpoint: 'worker-output.json',
      eventType: 'worker.completed',
    })
    const output: LongTextWorkerOutput = {
      workerVersion: 'long-text-worker-6',
      promptVersion: 'long-text-prompts-2',
      outputSchemaVersion: 'long-text-output-3',
      compatibilityKey: 'browser-demo',
      pipelineCompleted: false,
      jobId: input.jobId,
      workspaceId: currentDemoProjectId(),
      sourceFingerprints: Object.fromEntries(input.documents.map((document) => [document.path, document.sourceFingerprint])),
      manifests,
      content: '',
      evidence: [],
      chunkCount: manifests.reduce((sum, manifest) => sum + manifest.chunks.length, 0),
      summaryCount: 0,
      modelInvocationCount: 0,
      mapCacheHits: 0,
      stageCacheHits: 0,
      jobCheckpointHits: 0,
      durationMs: 0,
      completedAt: Date.now(),
    }
    onEvent?.({ sequence, timestamp: Date.now(), jobId: input.jobId, stage: 'chunking', status: 'completed', completed: manifests.length, total: manifests.length, message: '浏览器演示分块完成' })
    return output
  }

  if (!authorizationTicket) throw new Error('Rust Worker 缺少有效的 Dispatch 授权票据')

  const seenSequences = new Set<number>()
  const dispatchEvent = (event: TaskWorkerEvent) => {
    if (event.jobId !== input.jobId || seenSequences.has(event.sequence)) return
    seenSequences.add(event.sequence)
    onEvent?.(event)
  }
  const unlisten = await listen<TaskWorkerEvent>('task-worker-event', ({ payload }) => {
    dispatchEvent(payload)
  })
  try {
    const replay = await invoke<TaskWorkerEvent[]>('list_task_worker_events', {
      jobId: input.jobId,
      afterSequence: null,
    })
    replay.forEach(dispatchEvent)
    await invoke<TaskJob>('start_long_text_worker', { input, authorizationTicket })
    for (;;) {
      const output = await invoke<LongTextWorkerOutput | null>('get_long_text_worker_output', { jobId: input.jobId })
      if (output) return output
      const job = await getTaskJob(input.jobId)
      if (job.status === 'failed') throw job.failure ?? new Error(job.error ?? 'Rust Worker 执行失败')
      if (job.status === 'cancelled') throw new Error('请求已停止')
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    }
  } finally {
    unlisten()
  }
}

export async function pauseTaskWorker(jobId: string): Promise<TaskJob> {
  if (!isDesktop()) return updateTaskJob({ taskId: jobId, status: 'paused', eventType: 'worker.paused' })
  return invoke<TaskJob>('pause_task_worker', { jobId })
}

export async function resumeTaskWorker(jobId: string): Promise<TaskJob> {
  if (!isDesktop()) return updateTaskJob({ taskId: jobId, status: 'running', eventType: 'worker.resumed' })
  return invoke<TaskJob>('resume_task_worker', { jobId })
}

export async function retryTaskWorkerStep(jobId: string, stepId: string): Promise<TaskJob> {
  if (!isDesktop()) throw new Error('指定 Worker 步骤重跑仅在桌面应用中可用')
  return invoke<TaskJob>('retry_task_worker_step', { jobId, stepId })
}

export async function getLongTextWorkerOutput(jobId: string): Promise<LongTextWorkerOutput | null> {
  if (!isDesktop()) return null
  return invoke<LongTextWorkerOutput | null>('get_long_text_worker_output', { jobId })
}

export async function executeTask(input: TaskExecutionInput): Promise<TaskExecutionDispatch> {
  validateTaskExecutionInput(input)
  if (!isDesktop()) return createTaskExecutionDispatch(input, currentDemoProjectId())
  return invoke<TaskExecutionDispatch>('execute_task', { input })
}

export async function saveDocument(document: DocumentSnapshot): Promise<DocumentSnapshot> {
  if (!isDesktop()) {
    const saved = { ...document, modifiedMs: Date.now() }
    currentDemoDocuments().set(document.path, saved)
    return saved
  }
  return invoke<DocumentSnapshot>('save_document', {
    path: document.path,
    content: document.content,
    expectedModifiedMs: document.modifiedMs,
    lineEnding: document.lineEnding,
    hasBom: document.hasBom,
  })
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  if (!isDesktop()) {
    const document = currentDemoDocuments().get(path)
    if (!document) throw new Error(`找不到文件：${path}`)
    return new TextEncoder().encode(document.content)
  }
  const bytes = await invoke<number[]>('read_file_bytes', { path })
  return Uint8Array.from(bytes)
}

export async function createDocument(path: string): Promise<DocumentSnapshot> {
  if (!isDesktop()) {
    if (currentDemoDocuments().has(path)) throw new Error('同名文件已存在')
    const name = path.split('/').at(-1) ?? path
    const document: DocumentSnapshot = {
      path, name, content: '', kind: getDocumentKind(path),
      modifiedMs: Date.now(), lineEnding: 'lf', hasBom: false,
    }
    currentDemoDocuments().set(path, document)
    return document
  }
  return invoke<DocumentSnapshot>('create_document', { path })
}

export async function writeStructureOutputs(
  documents: ContextDocument[],
  proposals: StructureProposal[],
): Promise<string[]> {
  const outputs = documents.flatMap((document, index) => buildStructureOutputs(document, proposals[index]))
  const written: string[] = []
  for (const output of outputs) {
    const created = await createDocument(output.path)
    await saveDocument({ ...created, content: output.content })
    written.push(output.path)
  }
  return written
}

export async function createDirectory(path: string): Promise<null> {
  if (!isDesktop()) return null
  await invoke('create_directory', { path })
  return null
}

export async function searchWorkspace(query: string): Promise<SearchHit[]> {
  if (!isDesktop()) {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    return [...currentDemoDocuments().values()].flatMap((document) => document.content.split('\n').flatMap((line, index) =>
      line.toLocaleLowerCase().includes(normalized) ? [{ path: document.path, line: index + 1, snippet: line.slice(0, 180) }] : []))
  }
  return invoke<SearchHit[]>('search_workspace', { query, maxResults: 100 })
}

function currentDemoProjectId(): string {
  const id = readDemoProjects().activeId
  if (!id) throw new Error('请先选择工作目录')
  return id
}

function currentDemoDocuments(): Map<string, DocumentSnapshot> {
  const id = currentDemoProjectId()
  let documents = demoProjectDocuments.get(id)
  if (!documents) {
    documents = new Map([...demoDocuments].map(([path, document]) => [path, { ...document }]))
    demoProjectDocuments.set(id, documents)
  }
  return documents
}

function demoMemoryKey(): string {
  const id = currentDemoProjectId()
  return id === 'demo-workspace' ? MEMORY_KEY : `${MEMORY_KEY}.${id}`
}

function readDemoMemory(): ProjectMemoryItem[] {
  try { return JSON.parse(localStorage.getItem(demoMemoryKey()) ?? '[]') as ProjectMemoryItem[] } catch { return [] }
}

export async function listProjectMemory(status: ProjectMemoryStatus | 'all' = 'confirmed'): Promise<ProjectMemoryItem[]> {
  if (!isDesktop()) return readDemoMemory().filter((item) => status === 'all' || item.status === status).sort((left, right) => right.updatedAt - left.updatedAt)
  return invoke<ProjectMemoryItem[]>('list_project_memory', { status })
}

export async function searchProjectMemory(query: string, maxResults = 12): Promise<ProjectMemoryItem[]> {
  if (!isDesktop()) {
    const normalized = query.trim().toLocaleLowerCase()
    const values = readDemoMemory().filter((item) => item.status === 'confirmed')
    const hits = values.filter((item) => !normalized || `${item.title}\n${item.content}`.toLocaleLowerCase().includes(normalized))
    return (hits.length > 0 || !normalized ? hits : values).slice(0, maxResults)
  }
  const hits = await invoke<ProjectMemoryItem[]>('search_project_memory', { query, maxResults })
  return hits.length > 0 || !query.trim() ? hits : invoke<ProjectMemoryItem[]>('list_project_memory', { status: 'confirmed' })
}

export async function proposeProjectMemory(candidates: ProjectMemoryCandidate[]): Promise<ProjectMemoryItem[]> {
  if (!isDesktop()) {
    const now = Date.now()
    const values = readDemoMemory()
    const proposed = candidates.map((candidate) => ({ ...candidate, confidence: candidate.confidence ?? 'medium', status: 'proposed' as const, createdAt: now, updatedAt: now }))
    const next = [...proposed, ...values.filter((item) => !candidates.some((candidate) => candidate.id === item.id))]
    localStorage.setItem(demoMemoryKey(), JSON.stringify(next))
    return proposed
  }
  return invoke<ProjectMemoryItem[]>('propose_project_memory', { candidates })
}

export async function confirmProjectMemory(ids: string[]): Promise<ProjectMemoryItem[]> {
  if (!isDesktop()) {
    const now = Date.now()
    const values = readDemoMemory().map((item) => ids.includes(item.id) && item.status === 'proposed' ? { ...item, status: 'confirmed' as const, updatedAt: now } : item)
    localStorage.setItem(demoMemoryKey(), JSON.stringify(values))
    return values.filter((item) => ids.includes(item.id) && item.status === 'confirmed')
  }
  return invoke<ProjectMemoryItem[]>('confirm_project_memory', { ids })
}

export async function rejectProjectMemory(ids: string[]): Promise<ProjectMemoryItem[]> {
  if (!isDesktop()) {
    const now = Date.now()
    const values = readDemoMemory().map((item) => ids.includes(item.id) && item.status === 'proposed' ? { ...item, status: 'rejected' as const, updatedAt: now } : item)
    localStorage.setItem(demoMemoryKey(), JSON.stringify(values))
    return values.filter((item) => ids.includes(item.id) && item.status === 'rejected')
  }
  return invoke<ProjectMemoryItem[]>('reject_project_memory', { ids })
}

export async function upsertCharacters(characters: CharacterInput[]): Promise<CharacterRecord[]> {
  if (!isDesktop()) {
    const now = Date.now()
    return characters.map((character) => ({
      ...character,
      aliases: character.aliases ?? [],
      description: character.description ?? '',
      confidence: character.confidence ?? 'medium',
      status: character.status ?? 'proposed',
      createdAt: now,
      updatedAt: now,
    }))
  }
  return invoke<CharacterRecord[]>('upsert_characters', { characters })
}

export async function searchCharacters(workId: string, query: string, maxResults = 50): Promise<CharacterRecord[]> {
  if (!isDesktop()) return []
  return invoke<CharacterRecord[]>('search_characters', { workId, query, maxResults })
}

export async function upsertCharacterMentions(mentions: CharacterMentionInput[]): Promise<number> {
  if (!isDesktop()) return mentions.length
  return invoke<number>('upsert_character_mentions', { mentions })
}

export async function invalidateCharacterSource(sourceId: string, sourceFingerprint: string): Promise<number> {
  if (!isDesktop()) return 0
  return invoke<number>('invalidate_character_source', { sourceId, sourceFingerprint })
}

export async function upsertCharacterRelationships(
  relationships: RelationshipInput[],
  evidence: RelationshipEvidenceInput[] = [],
): Promise<number> {
  if (!isDesktop()) return relationships.length
  return invoke<number>('upsert_character_relationships', { relationships, evidence })
}

export async function getCharacterGraphStats(workId: string): Promise<CharacterGraphStats> {
  if (!isDesktop()) {
    return { nodeCount: 0, edgeCount: 0, connectedComponents: 0, isolatedNodeCount: 0, averageDegree: 0, maxDegree: 0, topCharacters: [] }
  }
  return invoke<CharacterGraphStats>('character_graph_stats', { workId })
}

export async function listCharacterNeighbors(workId: string, characterId: string): Promise<CharacterNeighbor[]> {
  if (!isDesktop()) return []
  return invoke<CharacterNeighbor[]>('list_character_neighbors', { workId, characterId })
}

export async function benchmarkCharacterGraph(workId: string, iterations = 10): Promise<CharacterGraphBenchmark> {
  if (!isDesktop()) {
    return {
      stats: { nodeCount: 0, edgeCount: 0, connectedComponents: 0, isolatedNodeCount: 0, averageDegree: 0, maxDegree: 0, topCharacters: [] },
      loadMicros: 0,
      statsP50Micros: 0,
      statsP95Micros: 0,
      pathP50Micros: 0,
      pathP95Micros: 0,
      pathFound: false,
      iterations: 0,
    }
  }
  return invoke<CharacterGraphBenchmark>('character_graph_benchmark', { workId, iterations })
}

export async function findCharacterPath(workId: string, sourceCharacterId: string, targetCharacterId: string, maxHops = 4): Promise<string[] | null> {
  if (!isDesktop()) return null
  return invoke<string[] | null>('character_graph_path', { workId, sourceCharacterId, targetCharacterId, maxHops })
}

function defaultDemoProfile(): ModelProfile {
  return {
    id: 'demo-ollama', name: 'Ollama · 浏览器演示', kind: 'ollama', baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b', contextWindow: 16384, hasApiKey: false, updatedAt: Date.now(),
  }
}

function readDemoProfiles(): ModelProfile[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '[]') as Array<ModelProfile & {
      apiKey?: string
      clearApiKey?: boolean
    }>
    const value = stored.map(({ apiKey: _apiKey, clearApiKey: _clearApiKey, ...profile }) => profile)
    if (stored.some((profile) => 'apiKey' in profile || 'clearApiKey' in profile)) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(value))
    }
    return localStorage.getItem(PROFILE_KEY) === null ? [defaultDemoProfile()] : value
  } catch { return [defaultDemoProfile()] }
}

export async function listModelProfiles(): Promise<ModelProfile[]> {
  if (!isDesktop()) {
    const connections = readDemoConnections()
    return readDemoProfiles().map((profile) => {
      const connection = connections.find((item) => item.id === profile.connectionId)
      return connection ? { ...profile, kind: connection.kind, baseUrl: connection.baseUrl, hasApiKey: connection.hasApiKey } : profile
    })
  }
  return invoke<ModelProfile[]>('list_model_profiles')
}

function readDemoConnections(): ModelConnection[] {
  const stored = localStorage.getItem(CONNECTION_KEY)
  if (stored !== null) return JSON.parse(stored) as ModelConnection[]
  const profiles = readDemoProfiles()
  const connections = profiles.map(({ id, name, kind, baseUrl, hasApiKey, updatedAt }) => ({ id, name, kind, baseUrl, hasApiKey, updatedAt }))
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(connections))
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles.map((profile) => ({ ...profile, connectionId: profile.id }))))
  return connections
}

export async function listModelConnections(): Promise<ModelConnection[]> {
  return isDesktop() ? invoke<ModelConnection[]>('list_model_connections') : readDemoConnections()
}

export async function saveModelConnection(input: ModelConnectionInput): Promise<ModelConnection> {
  if (isDesktop()) return invoke<ModelConnection>('save_model_connection', { input })
  const connections = readDemoConnections()
  const existing = connections.find((item) => item.id === input.id)
  const connection: ModelConnection = {
    id: input.id, name: input.name.trim(), kind: input.kind, baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    hasApiKey: input.clearApiKey ? false : Boolean(input.apiKey?.trim()) || Boolean(existing?.hasApiKey), updatedAt: Date.now(),
  }
  localStorage.setItem(CONNECTION_KEY, JSON.stringify([connection, ...connections.filter((item) => item.id !== input.id)]))
  return connection
}

export async function deleteModelConnection(id: string): Promise<void> {
  if (isDesktop()) return invoke('delete_model_connection', { id })
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(readDemoConnections().filter((item) => item.id !== id)))
  localStorage.setItem(PROFILE_KEY, JSON.stringify(readDemoProfiles().filter((item) => item.connectionId !== id)))
}

export async function discoverConnectionModels(input: ModelConnectionInput): Promise<ModelConnectionResult> {
  return testModelConnection({ ...input, model: '', contextWindow: 32768 })
}

export async function saveModelProfile(input: ModelProfileInput): Promise<ModelProfile> {
  if (!isDesktop()) {
    const existing = readDemoProfiles().find((item) => item.id === input.id)
    const profile: ModelProfile = {
      id: input.id,
      connectionId: input.connectionId,
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      model: input.model,
      contextWindow: input.contextWindow,
      hasApiKey: input.clearApiKey ? false : Boolean(input.apiKey) || Boolean(existing?.hasApiKey),
      updatedAt: Date.now(),
    }
    const profiles = readDemoProfiles().filter((item) => item.id !== input.id)
    localStorage.setItem(PROFILE_KEY, JSON.stringify([profile, ...profiles]))
    return profile
  }
  return invoke<ModelProfile>('save_model_profile', { input })
}

export async function deleteModelProfile(id: string): Promise<void> {
  if (!isDesktop()) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(readDemoProfiles().filter((item) => item.id !== id)))
    return
  }
  await invoke('delete_model_profile', { id })
}

export async function testModelConnection(input: ModelProfileInput): Promise<ModelConnectionResult> {
  if (!isDesktop()) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    return { ok: true, message: '浏览器演示数据', models: input.kind === 'ollama' ? ['openbmb/minicpm4.1:latest', 'qwen3:8b', 'llama3.2:latest'] : ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'] }
  }
  return invoke<ModelConnectionResult>('test_model_connection', { input })
}

export async function stopOllamaModel(profileId: string): Promise<OllamaStopResult> {
  if (!isDesktop()) return { stopped: true, message: '浏览器演示已释放模型' }
  return invoke<OllamaStopResult>('stop_ollama_model', { profileId })
}

export async function streamChat(request: ChatRequest, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  if (!isDesktop()) {
    demoCancellations.delete(request.requestId)
    const profileCount = request.messages.filter((message) => /<(?:workspace-profile|document-profiles|focused-project-evidence)>/u.test(message.content)).length
    const selection = request.messages.map((message) => message.content.match(/<source-selection>\n([\s\S]*?)\n<\/source-selection>/u)?.[1]).find(Boolean)
    const response = selection !== undefined
      ? JSON.stringify({ replacementText: `${selection.trim()}（演示修改）` })
      : `${profileCount > 0 ? '我已收到不含正文的本地画像。\n\n' : ''}这是浏览器演示流。桌面应用会通过 Rust 连接已配置的 Ollama 或 OpenAI 兼容服务；消息会分段到达，并保存在本机数据库中。`
    for (const content of response.match(/.{1,8}/gu) ?? []) {
      if (demoCancellations.has(request.requestId)) throw new Error('请求已停止')
      await new Promise((resolve) => window.setTimeout(resolve, 45))
      onEvent({ type: 'chunk', content })
    }
    onEvent({ type: 'done' })
    return
  }
  const channel = new Channel<ChatStreamEvent>()
  channel.onmessage = onEvent
  await invoke('stream_chat', { request, onEvent: channel })
}

export async function cancelChat(requestId: string): Promise<void> {
  if (!isDesktop()) { demoCancellations.add(requestId); return }
  await invoke('cancel_chat', { requestId })
}

function demoConversationKey(workspaceId?: string): string {
  const id = workspaceId ?? readDemoProjects().activeId
  if (!id || !readDemoProjects().projects.some((project) => project.id === id)) throw new Error('项目记录不存在')
  return id === 'demo-workspace' ? CONVERSATION_KEY : `${CONVERSATION_KEY}.${id}`
}

function readDemoConversations(workspaceId?: string): Conversation[] {
  return JSON.parse(localStorage.getItem(demoConversationKey(workspaceId)) ?? '[]') as Conversation[]
}

export async function listConversations(workspaceId?: string): Promise<ConversationSummary[]> {
  if (!isDesktop()) return readDemoConversations(workspaceId).map((conversation) => ({
    id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt, messageCount: conversation.messages.length,
  })).sort((left, right) => right.updatedAt - left.updatedAt)
  return invoke<ConversationSummary[]>('list_conversations', { workspaceId })
}

export async function loadConversation(id: string, workspaceId?: string): Promise<Conversation> {
  if (!isDesktop()) {
    const conversation = readDemoConversations(workspaceId).find((item) => item.id === id)
    if (!conversation) throw new Error('找不到该会话')
    return conversation
  }
  return invoke<Conversation>('load_conversation', { id, workspaceId })
}

export async function saveConversationMessage(conversationId: string, title: string, message: ChatMessage, workspaceId?: string): Promise<void> {
  if (!isDesktop()) {
    const values = readDemoConversations(workspaceId)
    const existing = values.find((item) => item.id === conversationId)
    if (existing) {
      existing.title = title
      existing.updatedAt = message.completedAt ?? message.createdAt
      existing.messages = [...existing.messages.filter((item) => item.id !== message.id), message]
    } else values.push({ id: conversationId, title, updatedAt: message.completedAt ?? message.createdAt, messages: [message] })
    localStorage.setItem(demoConversationKey(workspaceId), JSON.stringify(values))
    return
  }
  await invoke('save_conversation_message', { conversationId, title, message, workspaceId })
}

export async function deleteConversation(id: string, workspaceId?: string): Promise<void> {
  if (!isDesktop()) {
    localStorage.setItem(demoConversationKey(workspaceId), JSON.stringify(readDemoConversations(workspaceId).filter((item) => item.id !== id)))
    return
  }
  await invoke('delete_conversation', { id, workspaceId })
}
