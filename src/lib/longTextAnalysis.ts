import { chunkDocument, readAnalysisArtifact, streamChat, writeAnalysisArtifact } from './desktop'
import { estimateTokens } from './context'
import { buildDocumentIndexMessage, buildDocumentMetadataCards } from './documentMetadata'
import { parseEvidenceReferences, verifyEvidenceReferences } from './workspaceAnalysis'
import type { AnalysisJobManifest, ChatStreamEvent, ContextDocument, EvidenceReference, ModelProfile, TextChunk, WorkspaceDocumentRef } from '../types'

export type AnalysisStage = 'chunking' | 'map' | 'reduce' | 'synthesis'

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

function documentChunkMessage(document: ContextDocument, manifest: Awaited<ReturnType<typeof chunkDocument>>): string {
  const charRange = range(manifest.chunks.map((chunk) => charCount(chunk.text)))
  const tokenRange = range(manifest.chunks.map((chunk) => chunk.estimatedTokens))
  return `已分块 ${document.name}：${formatCount(charCount(document.content))} 字（约 ${formatCount(manifest.sourceTokens)} tokens）→ ${formatCount(manifest.chunks.length)} 块；实际每块约 ${formatCount(charRange[0])}-${formatCount(charRange[1])} 字、${formatCount(tokenRange[0])}-${formatCount(tokenRange[1])} tokens。`
}

function chunkAnalysisMessage(chunks: Awaited<ReturnType<typeof chunkDocument>>['chunks']): string {
  const charRange = range(chunks.map((chunk) => charCount(chunk.text)))
  const tokenRange = range(chunks.map((chunk) => chunk.estimatedTokens))
  return `准备逐块分析：共 ${formatCount(chunks.length)} 块；每块实际约 ${formatCount(charRange[0])}-${formatCount(charRange[1])} 字、${formatCount(tokenRange[0])}-${formatCount(tokenRange[1])} tokens。`
}

export function cancelLongTextAnalysis(requestId: string): void {
  cancelledAnalyses.add(requestId)
}

function assertNotCancelled(requestId: string): void {
  if (cancelledAnalyses.has(requestId)) throw new Error('请求已停止')
}

async function readJsonArtifact<T>(jobId: string, name: string): Promise<T | null> {
  try {
    const value = await readAnalysisArtifact(jobId, name)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
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
  let end = Math.min(value.length, Math.max(1, limit * 2))
  while (end > 1 && estimateTokens(value.slice(0, end)) > limit) end = Math.floor(end * 0.8)
  return `${value.slice(0, end).trim()}\n[该阶段摘要已按上下文预算截断]`
}

function isCreativeTask(instruction: string): boolean {
  return /(?:续写|改写|润色|校对|修改|创作|生成)/u.test(instruction)
}

function isRelationshipTask(instruction: string): boolean {
  return /(?:人物|角色)?(?:关系|关联|联系|冲突|合作|感情|亲属关系)|(?:是什么关系|有何关系|关系如何|如何联系|是否有关联)/u.test(instruction)
}

export function batchSummaries(records: SummaryRecord[], contextWindow: number, indexMessage?: string | null): SummaryRecord[][] {
  const limit = Math.max(MIN_CHUNK_TOKENS, batchBudget(contextWindow) - estimateTokens(indexMessage ?? ''))
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
  return batches
}

async function collectResponse(requestId: string, profileId: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
  let content = ''
  let streamError: string | null = null
  await streamChat({ requestId, profileId, sourcePolicy: 'local-chunks', messages }, (event: ChatStreamEvent) => {
    if (event.type === 'chunk') content += event.content
    if (event.type === 'error') streamError = event.message
  })
  if (streamError) throw new Error(streamError)
  return content.trim()
}

function chunkPrompt(instruction: string, chunk: TextChunk, indexMessage: string | null): string {
  const heading = chunk.heading ? `章节/标题：${chunk.heading}\n` : ''
  const creativeGuidance = isCreativeTask(instruction)
    ? '这是创作或改写任务。请提取与任务相关的原文片段、人物状态、语气风格、连续性约束和可执行素材，暂不脱离证据完成最终创作。'
    : '请为后续汇总提取可核验的事实，不要臆测未出现的内容。'
  return `你是长文本任务 Agent 的局部 Map Skill。只依据下面这个原文分块处理用户任务。\n\n${indexMessage ? `${indexMessage}\n\n` : ''}用户任务：${instruction}\n${heading}来源：${chunk.sourceId}，行 ${chunk.lineStart}-${chunk.lineEnd}\n\n<chunk id="${chunk.id}">\n${chunk.text}\n</chunk>\n\n${creativeGuidance}\n请输出简洁的结构化要点：内容概要、事件/冲突、人物及其目标或变化、线索/伏笔、可引用的原文证据，以及与用户任务直接相关的素材。每条证据必须附来源标记，格式为 [source: 相对路径 chunk=块ID lines=起始行-结束行 quote="原文短引"]。`
}

function summaryPrompt(instruction: string, records: SummaryRecord[], final: boolean, indexMessage: string | null): string {
  const material = records.map((record) => `[${record.sourceId} ${record.chunkId}${record.heading ? ` · ${record.heading}` : ''}]\n${record.text}`).join('\n\n')
  const finalGuidance = isCreativeTask(instruction)
    ? '请根据这些阶段摘要完成用户的创作或改写任务，遵循原文人物、语气和连续性约束；不要把摘要过程本身当作回答。'
    : isRelationshipTask(instruction)
      ? '请先直接回答用户询问的人物关系，再说明关系性质、发展变化和关键事件；每个判断都保留来源分块标记或原文证据。若文档没有足够依据，明确标注未知，不要臆测。'
    : '请给出完整回答，覆盖文档类型、概要、结构、故事主线和人物线；按章节或阶段组织，保留来源分块标记作为证据。'
  return `${final ? '你是长文本任务 Agent 的最终 Synthesis Skill。' : '你是长文本任务 Agent 的阶段 Reduce Skill。'}\n${indexMessage ? `${indexMessage}\n` : ''}用户任务：${instruction}\n\n以下是已经由局部 Map Skill 生成的摘要。它们不是原文，请合并重复事实并标记不确定或相互矛盾之处，不要补写没有依据的情节。\n\n${material}\n\n${final ? finalGuidance : '请压缩为更高层级的摘要，保留故事阶段、人物变化、因果关系、伏笔、任务相关素材和来源标记。'}\n\n最终回答中的每个关键结论都必须附来源标记，格式为 [source: 相对路径 chunk=块ID lines=起始行-结束行 quote="原文短引"]；无法核验的结论标记为“未找到证据”。`
}

export async function analyzeLongText(
  documents: ContextDocument[],
  instruction: string,
  profile: Pick<ModelProfile, 'id' | 'contextWindow'>,
  requestId: string,
  onProgress?: (progress: AnalysisProgress) => void,
  workspaceId = 'selected-documents',
  excludedDocuments: WorkspaceDocumentRef[] = [],
  resumeJobId?: string,
): Promise<LongTextAnalysisResult> {
  if (documents.length === 0) throw new Error('没有可分析的文档')
  const jobId = resumeJobId ?? crypto.randomUUID()
  const maxTokens = chunkBudget(profile.contextWindow)
  const indexMessage = buildDocumentIndexMessage(documents)
  const startedAt = Date.now()
  const cards = buildDocumentMetadataCards(documents)
  const sourceFingerprints: Record<string, string> = {}
  try {
    for (const document of documents) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document.content))
      sourceFingerprints[document.path] = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
    }
    if (resumeJobId) {
      const previous = await readJsonArtifact<AnalysisJobManifest>(jobId, 'job-failed.json')
        ?? await readJsonArtifact<AnalysisJobManifest>(jobId, 'job-start.json')
        ?? await readJsonArtifact<AnalysisJobManifest>(jobId, 'job.json')
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
    } else {
      await writeAnalysisArtifact(jobId, 'index.json', JSON.stringify({ cards, createdAt: startedAt, sourceFingerprints }, null, 2))
      await writeAnalysisArtifact(jobId, 'job-start.json', JSON.stringify({
        jobId, workspaceId, instruction, status: 'running', createdAt: startedAt, updatedAt: startedAt,
        documentCount: documents.length + excludedDocuments.length, supportedDocumentCount: documents.length,
        excludedDocuments, sourceFingerprints,
      } satisfies AnalysisJobManifest, null, 2))
    }
    const manifests = []
    onProgress?.({ stage: 'chunking', completed: 0, total: documents.length, message: chunkingPreparationMessage(documents, maxTokens, Math.min(128, Math.floor(maxTokens / 8))) })
    for (const [index, document] of documents.entries()) {
      assertNotCancelled(requestId)
      const cached = resumeJobId
        ? await readJsonArtifact<Awaited<ReturnType<typeof chunkDocument>>>(jobId, `manifest-${String(index + 1).padStart(3, '0')}.json`)
        : null
      if (cached && cached.sourceId === document.path && cached.sourceFingerprint === sourceFingerprints[document.path]) {
        manifests.push(cached)
        onProgress?.({ stage: 'chunking', completed: index + 1, total: documents.length, message: `复用已完成分块：${document.name}（${cached.chunks.length} 块）` })
        continue
      }
      const manifest = await chunkDocument(document.path, maxTokens, Math.min(128, Math.floor(maxTokens / 8)))
      manifests.push(manifest)
      await writeAnalysisArtifact(jobId, `manifest-${String(index + 1).padStart(3, '0')}.json`, JSON.stringify(manifest, null, 2))
      onProgress?.({ stage: 'chunking', completed: index + 1, total: documents.length, message: documentChunkMessage(document, manifest) })
    }

    const chunks = manifests.flatMap((manifest) => manifest.chunks)
    const summaries: SummaryRecord[] = []
    onProgress?.({ stage: 'map', completed: 0, total: chunks.length, message: chunkAnalysisMessage(chunks) })
    for (const [index, chunk] of chunks.entries()) {
      assertNotCancelled(requestId)
      onProgress?.({ stage: 'map', completed: index, total: chunks.length, message: `正在分析第 ${index + 1}/${chunks.length} 块（${chunk.sourceId}，约 ${formatCount(chunk.estimatedTokens)} tokens）…` })
      const cached = resumeJobId
        ? await readAnalysisArtifact(jobId, `summary-${String(index + 1).padStart(5, '0')}.md`)
        : null
      const text = cached ?? await collectResponse(requestId, profile.id, [{ role: 'user', content: chunkPrompt(instruction, chunk, indexMessage) }])
      if (text) summaries.push({ sourceId: chunk.sourceId, chunkId: chunk.id, heading: chunk.heading, text: clipToTokens(text, batchBudget(profile.contextWindow) - 64), evidence: verifyEvidenceReferences(parseEvidenceReferences(text), documents) })
      if (cached === null) await writeAnalysisArtifact(jobId, `summary-${String(index + 1).padStart(5, '0')}.md`, text)
      onProgress?.({ stage: 'map', completed: index + 1, total: chunks.length, message: `${cached === null ? '已完成' : '复用已完成'}第 ${index + 1}/${chunks.length} 块（${chunk.sourceId}）` })
    }
    if (summaries.length === 0) throw new Error('模型没有返回可汇总的分块结果')

    let level = 0
    let current = summaries
    while (batchSummaries(current, profile.contextWindow, indexMessage).length > 1) {
      const batches = batchSummaries(current, profile.contextWindow, indexMessage)
      const next: SummaryRecord[] = []
      onProgress?.({ stage: 'reduce', completed: 0, total: batches.length, message: `正在汇总第 ${level + 1} 层摘要：${formatCount(current.length)} 条摘要分 ${formatCount(batches.length)} 批处理…` })
      for (const [index, batch] of batches.entries()) {
        assertNotCancelled(requestId)
        onProgress?.({ stage: 'reduce', completed: index, total: batches.length, message: `正在处理第 ${index + 1}/${batches.length} 批阶段汇总…` })
        const text = await collectResponse(requestId, profile.id, [{ role: 'user', content: summaryPrompt(instruction, batch, false, indexMessage) }])
        if (text) next.push({ sourceId: 'summary', chunkId: `level-${level}-${index}`, heading: null, text: clipToTokens(text, batchBudget(profile.contextWindow) - 64), evidence: batch.flatMap((record) => record.evidence ?? []) })
        await writeAnalysisArtifact(jobId, `reduce-${level + 1}-${String(index + 1).padStart(4, '0')}.md`, text)
        onProgress?.({ stage: 'reduce', completed: index + 1, total: batches.length, message: `已完成第 ${index + 1}/${batches.length} 批阶段汇总` })
      }
      if (next.length === 0) throw new Error('模型没有返回可用的阶段汇总')
      current = next
      level += 1
    }

    assertNotCancelled(requestId)
    onProgress?.({ stage: 'synthesis', completed: 0, total: 1, message: `正在综合 ${formatCount(current.length)} 条阶段摘要，完成最终任务…` })
    const content = await collectResponse(requestId, profile.id, [{ role: 'user', content: summaryPrompt(instruction, current, true, indexMessage) }])
    const finalEvidence = verifyEvidenceReferences(parseEvidenceReferences(content), documents)
    const evidence = [...finalEvidence, ...current.flatMap((record) => record.evidence ?? [])]
      .filter((item, index, values) => values.findIndex((other) => other.sourceId === item.sourceId && other.lineStart === item.lineStart && other.lineEnd === item.lineEnd && other.quote === item.quote) === index)
    await writeAnalysisArtifact(jobId, 'analysis.md', content)
    await writeAnalysisArtifact(jobId, 'evidence.json', JSON.stringify(evidence, null, 2))
    const completedAt = Date.now()
    const manifest: AnalysisJobManifest = {
      jobId, workspaceId, instruction, status: 'completed', createdAt: startedAt, updatedAt: completedAt,
      documentCount: documents.length + excludedDocuments.length, supportedDocumentCount: documents.length, excludedDocuments,
      sourceFingerprints, chunkCount: chunks.length, summaryCount: summaries.length,
      evidenceCount: evidence.filter((item) => item.verified).length,
    }
    await writeAnalysisArtifact(jobId, 'job.json', JSON.stringify(manifest, null, 2))
    onProgress?.({ stage: 'synthesis', completed: 1, total: 1, message: '长文本任务完成' })
    return { content, jobId, chunkCount: chunks.length, summaryCount: summaries.length, evidence }
  } catch (error) {
    const message = String(error)
    const failed: AnalysisJobManifest = {
      jobId, workspaceId, instruction, status: message.includes('请求已停止') ? 'cancelled' : 'failed',
      createdAt: startedAt, updatedAt: Date.now(), documentCount: documents.length + excludedDocuments.length,
      supportedDocumentCount: documents.length, excludedDocuments, sourceFingerprints, error: message,
    }
    await writeAnalysisArtifact(jobId, 'job-failed.json', JSON.stringify(failed, null, 2)).catch(() => undefined)
    throw error
  } finally {
    cancelledAnalyses.delete(requestId)
  }
}
