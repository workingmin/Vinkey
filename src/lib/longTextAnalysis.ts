import { prepareLongTextWorker, readAnalysisArtifact, streamChat, updateTaskJob, writeAnalysisArtifact } from './desktop'
import { estimateTokens } from './context'
import { buildDocumentIndexMessage, buildDocumentMetadataCards } from './documentMetadata'
import { parseEvidenceReferences, verifyEvidenceReferences } from './workspaceAnalysis'
import type { AnalysisJobManifest, ChatStreamEvent, ContextDocument, EvidenceReference, ModelProfile, TextChunk, WorkspaceDocumentRef } from '../types'
import type { TaskExecutionDispatch } from './taskRuntime'

export type AnalysisStage = 'chunking' | 'map' | 'reduce' | 'synthesis' | 'evidence' | 'lifecycle'

export interface AnalysisProgress {
  stage: AnalysisStage
  completed: number
  total: number
  message: string
}

export interface LongTextAnalysisResult {
  content: string
  jobId: string
  chunkCount: number
  summaryCount: number
  evidence: EvidenceReference[]
}

export interface SummaryRecord {
  sourceId: string
  chunkId: string
  heading: string | null | undefined
  text: string
  evidence?: EvidenceReference[]
}

const MIN_CHUNK_TOKENS = 128
const MAX_CHUNK_TOKENS = 6000
const cancelledAnalyses = new Set<string>()
const pausedAnalyses = new Set<string>()

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function charCount(value: string): number {
  return Array.from(value).length
}

function range(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0]
  let minimum = values[0]
  let maximum = values[0]
  for (const value of values.slice(1)) {
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  return [minimum, maximum]
}

function chunkingPreparationMessage(documents: ContextDocument[], maxTokens: number, overlapTokens: number): string {
  const totalChars = documents.reduce((sum, document) => sum + charCount(document.content), 0)
  const totalTokens = documents.reduce((sum, document) => sum + estimateTokens(document.content), 0)
  return `准备分块：${documents.length} 个文档，共 ${formatCount(totalChars)} 字，约 ${formatCount(totalTokens)} tokens。策略：优先按标题、段落和句子切分，超出预算时再硬切；单块上限 ${formatCount(maxTokens)} tokens，块间保留 ${formatCount(overlapTokens)} tokens 重叠。`
}

function chunkAnalysisMessage(chunks: TextChunk[]): string {
  const charRange = range(chunks.map((chunk) => charCount(chunk.text)))
  const tokenRange = range(chunks.map((chunk) => chunk.estimatedTokens))
  return `准备逐块分析：共 ${formatCount(chunks.length)} 块；每块实际约 ${formatCount(charRange[0])}-${formatCount(charRange[1])} 字、${formatCount(tokenRange[0])}-${formatCount(tokenRange[1])} tokens。`
}

export function cancelLongTextAnalysis(requestId: string): void {
  cancelledAnalyses.add(requestId)
  pausedAnalyses.delete(requestId)
}

export function pauseLongTextAnalysis(requestId: string): void {
  pausedAnalyses.add(requestId)
}

export function resumeLongTextAnalysis(requestId: string): void {
  pausedAnalyses.delete(requestId)
}

function assertNotCancelled(requestId: string): void {
  if (cancelledAnalyses.has(requestId)) throw new Error('请求已停止')
}

async function waitWhilePaused(requestId: string, jobId: string): Promise<void> {
  if (!pausedAnalyses.has(requestId)) return
  await updateTaskJob({ taskId: jobId, status: 'paused', eventType: 'task.paused' })
  while (pausedAnalyses.has(requestId)) {
    assertNotCancelled(requestId)
    await new Promise((resolve) => window.setTimeout(resolve, 150))
  }
  assertNotCancelled(requestId)
  await updateTaskJob({ taskId: jobId, status: 'running', eventType: 'task.resumed' })
}

export interface GuardedToolOutput { value: unknown }
type ToolCallGuard = (toolName: string, input: unknown, output?: GuardedToolOutput) => void

async function guardedCall<T>(toolName: string, input: unknown, operation: () => Promise<T>, guard?: ToolCallGuard): Promise<T> {
  guard?.(toolName, input)
  const output = await operation()
  guard?.(toolName, input, { value: output })
  return output
}

async function readJsonArtifact<T>(jobId: string, name: string, guard?: ToolCallGuard): Promise<T | null> {
  // Authorization failures must propagate; only a missing/corrupt artifact is recoverable.
  const input = { jobId, name }
  guard?.('read_analysis_artifact', input)
  let value: string | null
  try {
    value = await readAnalysisArtifact(jobId, name)
  } catch {
    return null
  }
  guard?.('read_analysis_artifact', input, { value })
  try { return value ? JSON.parse(value) as T : null } catch { return null }
}

function analysisInputBudget(contextWindow: number): number {
  const outputReserve = Math.min(4096, Math.max(1024, Math.floor(contextWindow * 0.2)))
  const safetyReserve = Math.max(512, Math.floor(contextWindow * 0.1))
  return Math.max(MIN_CHUNK_TOKENS, contextWindow - outputReserve - safetyReserve - 256)
}

function chunkBudget(contextWindow: number): number {
  return Math.min(MAX_CHUNK_TOKENS, Math.max(MIN_CHUNK_TOKENS, Math.floor(analysisInputBudget(contextWindow) * 0.55)))
}

function batchBudget(contextWindow: number): number {
  return Math.max(MIN_CHUNK_TOKENS, Math.floor(analysisInputBudget(contextWindow) * 0.7))
}

function clipToTokens(value: string, limit: number): string {
  if (estimateTokens(value) <= limit) return value
  const marker = '\n[该阶段摘要已按上下文预算截断]'
  let end = Math.min(value.length, Math.max(1, (limit - estimateTokens(marker)) * 2))
  let clipped = `${value.slice(0, end).trim()}${marker}`
  while (end > 1 && estimateTokens(clipped) > limit) {
    end = Math.floor(end * 0.8)
    clipped = `${value.slice(0, end).trim()}${marker}`
  }
  return clipped
}

function effectiveDocumentIndex(indexMessage: string | null | undefined, contextWindow: number): string | null {
  return indexMessage
    ? clipToTokens(indexMessage, Math.max(64, Math.floor(analysisInputBudget(contextWindow) / 4)))
    : null
}

function summaryClipLimit(contextWindow: number, indexMessage?: string | null): number {
  const indexTokens = estimateTokens(effectiveDocumentIndex(indexMessage, contextWindow) ?? '')
  return Math.max(64, Math.floor((batchBudget(contextWindow) - indexTokens - 64) / 2))
}

function isCreativeTask(instruction: string): boolean {
  return /(?:续写|改写|润色|校对|修改|创作|生成)/u.test(instruction)
}

function isRelationshipTask(instruction: string): boolean {
  return /(?:人物|角色)?(?:关系|关联|联系|冲突|合作|感情|亲属关系)|(?:是什么关系|有何关系|关系如何|如何联系|是否有关联)/u.test(instruction)
}

function isContinuityTask(instruction: string): boolean {
  return /(?:连续性|连贯性|前后矛盾|设定冲突|设定矛盾|时间线冲突|时间矛盾|人物状态冲突|人物状态矛盾|伏笔(?:检查|审校|回收)|吃书|穿帮)/u.test(instruction)
}

export function chunkTaskGuidance(instruction: string): string {
  if (isContinuityTask(instruction)) {
    return '这是连续性审校任务。请提取当前分块中可核验的事实断言：人物状态、时间、地点、物品、世界规则、已埋设或已回收的伏笔，并保留叙述视角和不确定性。当前阶段只收集证据，不要仅凭信息缺失判定冲突。'
  }
  return isCreativeTask(instruction)
    ? '这是创作或改写任务。请提取与任务相关的原文片段、人物状态、语气风格、连续性约束和可执行素材，暂不脱离证据完成最终创作。'
    : '请为后续汇总提取可核验的事实，不要臆测未出现的内容。'
}

export function finalTaskGuidance(instruction: string): string {
  if (isContinuityTask(instruction)) {
    return '请输出连续性审校报告。先给结论和覆盖范围，再按严重程度列出明确冲突、疑似冲突和待补证项。每个问题必须同时列出相互冲突或需要核对的事实、对应来源证据、影响范围和最小修改建议；证据不足时标记“待补证”，不得把未提及的信息当作矛盾。最后单列已检查但未发现冲突的关键设定与伏笔。'
  }
  if (isCreativeTask(instruction)) {
    return '请根据这些阶段摘要完成用户的创作或改写任务，遵循原文人物、语气和连续性约束；不要把摘要过程本身当作回答。'
  }
  if (isRelationshipTask(instruction)) {
    return '请先直接回答用户询问的人物关系，再说明关系性质、发展变化和关键事件；每个判断都保留来源分块标记或原文证据。若文档没有足够依据，明确标注未知，不要臆测。'
  }
  return '请直接完成用户任务，并按任务相关的章节、阶段或主题组织回答；不要机械补充无关的文档概览。关键结论必须保留来源分块标记或原文证据，证据不足时明确标注未知。'
}

export function batchSummaries(records: SummaryRecord[], contextWindow: number, indexMessage?: string | null): SummaryRecord[][] {
  const limit = Math.max(MIN_CHUNK_TOKENS, batchBudget(contextWindow) - estimateTokens(effectiveDocumentIndex(indexMessage, contextWindow) ?? ''))
  const batches: SummaryRecord[][] = []
  let current: SummaryRecord[] = []
  let used = 0
  for (const record of records) {
    const cost = estimateTokens(record.text) + 32
    if (current.length > 0 && used + cost > limit) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(record)
    used += cost
  }
  if (current.length > 0) batches.push(current)
  if (batches.length === records.length && records.length > 1) {
    return Array.from({ length: Math.ceil(records.length / 2) }, (_, index) => records.slice(index * 2, index * 2 + 2))
  }
  return batches
}

async function collectResponse(requestId: string, profileId: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, guard?: ToolCallGuard): Promise<string> {
  let content = ''
  let streamError: string | null = null
  const request = { requestId, profileId, sourcePolicy: 'local-chunks' as const, messages }
  await guardedCall('stream_chat', request, () => streamChat(request, (event: ChatStreamEvent) => {
    if (event.type === 'chunk') content += event.content
    if (event.type === 'error') streamError = event.message
  }), guard)
  if (streamError) throw new Error(streamError)
  return content.trim()
}

function chunkPrompt(instruction: string, chunk: TextChunk, indexMessage: string | null, contextWindow: number): string {
  const heading = chunk.heading ? `章节/标题：${chunk.heading}\n` : ''
  const index = effectiveDocumentIndex(indexMessage, contextWindow)
  return `你是长文本任务 Agent 的局部 Map Skill。只依据下面这个原文分块处理用户任务。\n\n${index ? `${index}\n\n` : ''}用户任务：${instruction}\n${heading}来源：${chunk.sourceId}，行 ${chunk.lineStart}-${chunk.lineEnd}\n\n<chunk id="${chunk.id}">\n${chunk.text}\n</chunk>\n\n${chunkTaskGuidance(instruction)}\n请输出简洁的结构化要点：内容概要、事件/冲突、人物及其目标或变化、线索/伏笔、可引用的原文证据，以及与用户任务直接相关的素材。每条证据必须附来源标记，格式为 [source: 相对路径 chunk=块ID lines=起始行-结束行 quote="原文短引"]。`
}

function summaryPrompt(instruction: string, records: SummaryRecord[], final: boolean, indexMessage: string | null, contextWindow: number): string {
  const material = records.map((record) => `[${record.sourceId} ${record.chunkId}${record.heading ? ` · ${record.heading}` : ''}]\n${record.text}`).join('\n\n')
  const finalGuidance = finalTaskGuidance(instruction)
  const index = effectiveDocumentIndex(indexMessage, contextWindow)
  return `${final ? '你是长文本任务 Agent 的最终 Synthesis Skill。' : '你是长文本任务 Agent 的阶段 Reduce Skill。'}\n${index ? `${index}\n` : ''}用户任务：${instruction}\n\n以下是已经由局部 Map Skill 生成的摘要。它们不是原文，请合并重复事实并标记不确定或相互矛盾之处，不要补写没有依据的情节。\n\n${material}\n\n${final ? finalGuidance : '请压缩为更高层级的摘要，保留故事阶段、人物变化、因果关系、伏笔、任务相关素材和来源标记。'}\n\n最终回答中的每个关键结论都必须附来源标记，格式为 [source: 相对路径 chunk=块ID lines=起始行-结束行 quote="原文短引"]；无法核验的结论标记为“未找到证据”。`
}

export async function analyzeLongText(
  documents: ContextDocument[],
  instruction: string,
  profile: Pick<ModelProfile, 'id' | 'kind' | 'contextWindow'>,
  requestId: string,
  onProgress?: (progress: AnalysisProgress) => void,
  workspaceId = 'selected-documents',
  excludedDocuments: WorkspaceDocumentRef[] = [],
  resumeJobId?: string,
  toolCallGuard?: ToolCallGuard,
  workerDispatch?: TaskExecutionDispatch,
): Promise<LongTextAnalysisResult> {
  if (documents.length === 0) throw new Error('没有可分析的文档')
  const jobId = resumeJobId ?? requestId
  // Some local runtimes ignore num_ctx and keep their 4K default. Keep the
  // first request below that observed hard limit until runtime probing exists.
  const effectiveContextWindow = profile.kind === 'ollama' ? Math.min(profile.contextWindow, 4096) : profile.contextWindow
  const maxTokens = chunkBudget(effectiveContextWindow)
  const indexMessage = buildDocumentIndexMessage(documents)
  const startedAt = Date.now()
  const cards = buildDocumentMetadataCards(documents)
  const sourceFingerprints: Record<string, string> = {}
  let jobStarted = false
  try {
    for (const document of documents) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document.content))
      sourceFingerprints[document.path] = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
    }
    if (resumeJobId) {
      const previous = await readJsonArtifact<AnalysisJobManifest>(jobId, 'job-failed.json', toolCallGuard)
        ?? await readJsonArtifact<AnalysisJobManifest>(jobId, 'job-start.json', toolCallGuard)
        ?? await readJsonArtifact<AnalysisJobManifest>(jobId, 'job.json', toolCallGuard)
      if (!previous) throw new Error('找不到可恢复的分析任务，请重新开始')
      if (previous.status === 'completed') throw new Error('该分析任务已经完成，无需恢复')
      if (previous.workspaceId !== workspaceId) throw new Error('分析任务属于其他工作区，无法恢复')
      if (previous.instruction !== instruction) throw new Error('分析指令已变化，请重新开始任务')
      const previousPaths = Object.keys(previous.sourceFingerprints)
      const currentPaths = Object.keys(sourceFingerprints)
      const fingerprintsMatch = previousPaths.length === currentPaths.length
        && previousPaths.every((path) => sourceFingerprints[path] === previous.sourceFingerprints[path])
      if (!fingerprintsMatch) {
        throw new Error('源文档已变化，无法安全恢复旧任务，请重新开始')
      }
    }
    const instructionDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(instruction))
    const instructionHash = [...new Uint8Array(instructionDigest)].map((value) => value.toString(16).padStart(2, '0')).join('')
    const overlapTokens = Math.min(128, Math.floor(maxTokens / 8))
    if (!workerDispatch?.jobId || workerDispatch.jobId !== jobId || workerDispatch.serviceId !== 'long-text-analysis') {
      throw new Error('长文本 Worker 缺少匹配的 Service Dispatch')
    }
    jobStarted = true
    const prepared = await prepareLongTextWorker({
      jobId,
      instruction,
      instructionHash,
      profileId: profile.id,
      contextWindow: effectiveContextWindow,
      sourcePolicy: 'local-chunks',
      maxTokens,
      overlapTokens,
      dispatch: {
        jobId: workerDispatch.jobId,
        workspaceId: workerDispatch.workspaceId ?? workspaceId,
        policyVersion: workerDispatch.policyVersion,
        dispatchVersion: workerDispatch.dispatchVersion,
        serviceId: workerDispatch.serviceId,
        executionOwner: workerDispatch.executionOwner,
      },
      documentIndex: indexMessage,
      documents: documents.map((document) => ({ path: document.path, sourceFingerprint: sourceFingerprints[document.path] })),
      excludedDocuments,
    }, (event) => onProgress?.({
      stage: event.stage,
      completed: event.completed,
      total: event.total,
      message: event.message,
    }), workerDispatch.authorizationTicket)
    if (prepared.pipelineCompleted) {
      return {
        content: prepared.content,
        jobId: prepared.jobId,
        chunkCount: prepared.chunkCount,
        summaryCount: prepared.summaryCount,
        evidence: prepared.evidence,
      }
    }
    if (!resumeJobId) {
      const indexContent = JSON.stringify({ cards, createdAt: startedAt, sourceFingerprints }, null, 2)
      await guardedCall('write_analysis_artifact', { jobId, name: 'index.json', content: indexContent }, () => writeAnalysisArtifact(jobId, 'index.json', indexContent), toolCallGuard)
    }
    const manifests = prepared.manifests
    onProgress?.({
      stage: 'chunking',
      completed: manifests.length,
      total: manifests.length,
      message: `${chunkingPreparationMessage(documents, maxTokens, overlapTokens)} Rust Worker 已完成 ${manifests.length} 份 manifest。`,
    })

    const chunks = manifests.flatMap((manifest) => manifest.chunks)
    const summaries: SummaryRecord[] = []
    await updateTaskJob({
      taskId: jobId, stepId: 'map', stepKind: 'map', stepStatus: 'running',
      eventType: 'step.started', eventFields: { chunkCount: chunks.length },
    })
    onProgress?.({ stage: 'map', completed: 0, total: chunks.length, message: chunkAnalysisMessage(chunks) })
    for (const [index, chunk] of chunks.entries()) {
      await waitWhilePaused(requestId, jobId)
      assertNotCancelled(requestId)
      onProgress?.({ stage: 'map', completed: index, total: chunks.length, message: `正在分析第 ${index + 1}/${chunks.length} 块（${chunk.sourceId}，约 ${formatCount(chunk.estimatedTokens)} tokens）…` })
      const cached = resumeJobId
        ? await guardedCall('read_analysis_artifact', { jobId, name: `summary-${String(index + 1).padStart(5, '0')}.md` }, () => readAnalysisArtifact(jobId, `summary-${String(index + 1).padStart(5, '0')}.md`), toolCallGuard)
        : null
      const text = cached ?? await collectResponse(requestId, profile.id, [{ role: 'user', content: chunkPrompt(instruction, chunk, indexMessage, effectiveContextWindow) }], toolCallGuard)
      if (text) summaries.push({ sourceId: chunk.sourceId, chunkId: chunk.id, heading: chunk.heading, text: clipToTokens(text, summaryClipLimit(effectiveContextWindow, indexMessage)), evidence: verifyEvidenceReferences(parseEvidenceReferences(text), documents) })
      if (cached === null) {
        const name = `summary-${String(index + 1).padStart(5, '0')}.md`
        await guardedCall('write_analysis_artifact', { jobId, name, content: text }, () => writeAnalysisArtifact(jobId, name, text), toolCallGuard)
      }
      onProgress?.({ stage: 'map', completed: index + 1, total: chunks.length, message: `${cached === null ? '已完成' : '复用已完成'}第 ${index + 1}/${chunks.length} 块（${chunk.sourceId}）` })
    }
    if (summaries.length === 0) throw new Error('模型没有返回可汇总的分块结果')
    await updateTaskJob({
      taskId: jobId, stepId: 'map', stepStatus: 'completed', checkpoint: `summaries:${summaries.length}`,
      eventType: 'step.completed', eventFields: { summaryCount: summaries.length },
    })

    let level = 0
    let current = summaries
    while (batchSummaries(current, effectiveContextWindow, indexMessage).length > 1) {
      const batches = batchSummaries(current, effectiveContextWindow, indexMessage)
      const next: SummaryRecord[] = []
      const reduceStepId = `reduce-${level + 1}`
      await updateTaskJob({
        taskId: jobId, stepId: reduceStepId, stepKind: 'reduce', stepStatus: 'running',
        eventType: 'step.started', eventFields: { batchCount: batches.length },
      })
      onProgress?.({ stage: 'reduce', completed: 0, total: batches.length, message: `正在汇总第 ${level + 1} 层摘要：${formatCount(current.length)} 条摘要分 ${formatCount(batches.length)} 批处理…` })
      for (const [index, batch] of batches.entries()) {
        await waitWhilePaused(requestId, jobId)
        assertNotCancelled(requestId)
        onProgress?.({ stage: 'reduce', completed: index, total: batches.length, message: `正在处理第 ${index + 1}/${batches.length} 批阶段汇总…` })
        const text = await collectResponse(requestId, profile.id, [{ role: 'user', content: summaryPrompt(instruction, batch, false, indexMessage, effectiveContextWindow) }], toolCallGuard)
        if (text) next.push({ sourceId: 'summary', chunkId: `level-${level}-${index}`, heading: null, text: clipToTokens(text, summaryClipLimit(effectiveContextWindow, indexMessage)), evidence: batch.flatMap((record) => record.evidence ?? []) })
        const name = `reduce-${level + 1}-${String(index + 1).padStart(4, '0')}.md`
        await guardedCall('write_analysis_artifact', { jobId, name, content: text }, () => writeAnalysisArtifact(jobId, name, text), toolCallGuard)
        onProgress?.({ stage: 'reduce', completed: index + 1, total: batches.length, message: `已完成第 ${index + 1}/${batches.length} 批阶段汇总` })
      }
      if (next.length === 0) throw new Error('模型没有返回可用的阶段汇总')
      await updateTaskJob({
        taskId: jobId, stepId: reduceStepId, stepStatus: 'completed', checkpoint: `summaries:${next.length}`,
        eventType: 'step.completed', eventFields: { summaryCount: next.length },
      })
      current = next
      level += 1
    }

    await waitWhilePaused(requestId, jobId)
    assertNotCancelled(requestId)
    await updateTaskJob({
      taskId: jobId, stepId: 'synthesis', stepKind: 'synthesis', stepStatus: 'running',
      eventType: 'step.started', eventFields: { summaryCount: current.length },
    })
    onProgress?.({ stage: 'synthesis', completed: 0, total: 1, message: `正在综合 ${formatCount(current.length)} 条阶段摘要，完成最终任务…` })
    const content = await collectResponse(requestId, profile.id, [{ role: 'user', content: summaryPrompt(instruction, current, true, indexMessage, effectiveContextWindow) }], toolCallGuard)
    const finalEvidence = verifyEvidenceReferences(parseEvidenceReferences(content), documents)
    const evidence = [...finalEvidence, ...current.flatMap((record) => record.evidence ?? [])]
      .filter((item, index, values) => values.findIndex((other) => other.sourceId === item.sourceId && other.lineStart === item.lineStart && other.lineEnd === item.lineEnd && other.quote === item.quote) === index)
    await guardedCall('write_analysis_artifact', { jobId, name: 'analysis.md', content }, () => writeAnalysisArtifact(jobId, 'analysis.md', content), toolCallGuard)
    const evidenceContent = JSON.stringify(evidence, null, 2)
    await guardedCall('write_analysis_artifact', { jobId, name: 'evidence.json', content: evidenceContent }, () => writeAnalysisArtifact(jobId, 'evidence.json', evidenceContent), toolCallGuard)
    const completedAt = Date.now()
    const manifest: AnalysisJobManifest = {
      jobId, workspaceId, instruction, status: 'completed', createdAt: startedAt, updatedAt: completedAt,
      documentCount: documents.length + excludedDocuments.length, supportedDocumentCount: documents.length, excludedDocuments,
      sourceFingerprints, chunkCount: chunks.length, summaryCount: summaries.length,
      evidenceCount: evidence.filter((item) => item.verified).length,
    }
    const manifestContent = JSON.stringify(manifest, null, 2)
    await guardedCall('write_analysis_artifact', { jobId, name: 'job.json', content: manifestContent }, () => writeAnalysisArtifact(jobId, 'job.json', manifestContent), toolCallGuard)
    await updateTaskJob({
      taskId: jobId, status: 'completed', stepId: 'synthesis', stepStatus: 'completed', checkpoint: 'analysis.md',
      eventType: 'task.completed', eventFields: { chunkCount: chunks.length, evidenceCount: evidence.length },
    })
    onProgress?.({ stage: 'synthesis', completed: 1, total: 1, message: '长文本任务完成' })
    return { content, jobId, chunkCount: chunks.length, summaryCount: summaries.length, evidence }
  } catch (error) {
    const message = String(error)
    const failed: AnalysisJobManifest = {
      jobId, workspaceId, instruction, status: message.includes('请求已停止') ? 'cancelled' : 'failed',
      createdAt: startedAt, updatedAt: Date.now(), documentCount: documents.length + excludedDocuments.length,
      supportedDocumentCount: documents.length, excludedDocuments, sourceFingerprints, error: message,
    }
    try {
      const failedContent = JSON.stringify(failed, null, 2)
      await guardedCall('write_analysis_artifact', { jobId, name: 'job-failed.json', content: failedContent }, () => writeAnalysisArtifact(jobId, 'job-failed.json', failedContent), toolCallGuard)
    } catch {
      // Failure reporting must not replace the original task error.
    }
    if (jobStarted) {
      await updateTaskJob({
        taskId: jobId, status: failed.status, error: message.slice(0, 2_000),
        eventType: failed.status === 'cancelled' ? 'task.cancelled' : 'task.failed',
      }).catch(() => undefined)
    }
    throw error
  } finally {
    cancelledAnalyses.delete(requestId)
    pausedAnalyses.delete(requestId)
  }
}
