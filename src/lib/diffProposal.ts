import type { ContextDocument, DiffProposal, EditorRevisionRequest } from '../types'

export interface MultiFileRevisionTarget extends EditorRevisionRequest {
  proposalSetId: string
  targetId: string
  chunkIndex: number
  chunkCount: number
}

export function fingerprintDocument(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${value.length}`
}

export function buildSelectionRevisionContract(request: EditorRevisionRequest): string {
  return `这是编辑器选区修改任务。选区位置由本地应用锁定为 ${request.path}:${request.from}-${request.to}，模型不得更改文件路径或范围。\n\n<source-selection>\n${request.text}\n</source-selection>\n\n请只返回 JSON 对象，不要使用 Markdown 代码围栏或附加说明：{"replacementText":"修改后的完整选区文本"}。replacementText 必须能直接替换选区，不要返回 diff 标记。`
}

function unwrapCodeFence(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)
  return match?.[1]?.trim() ?? trimmed
}

export function createDiffProposal(response: string, request: EditorRevisionRequest, id: string = crypto.randomUUID()): DiffProposal {
  let parsed: unknown
  try {
    parsed = JSON.parse(unwrapCodeFence(response))
  } catch {
    throw new Error('模型没有返回有效的 DiffProposal JSON，请重试选区修改。')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('模型返回的 DiffProposal 结构无效。')
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'replacementText') throw new Error('DiffProposal 只能包含 replacementText。')
  const replacementText = (parsed as { replacementText?: unknown }).replacementText
  if (typeof replacementText !== 'string' || replacementText.length > 200_000) throw new Error('DiffProposal replacementText 无效或超过限制。')
  return {
    id, path: request.path, from: request.from, to: request.to, text: request.text,
    replacementText, instruction: request.instruction, sourceModifiedMs: request.sourceModifiedMs, sourceFingerprint: request.sourceFingerprint,
    proposalSetId: id, targetId: 'selection-1', chunkIndex: 0, chunkCount: 1,
    status: 'proposed', createdAt: Date.now(),
  }
}

function revisionRanges(content: string, maxChunkChars: number): Array<{ from: number; to: number }> {
  if (!content) return []
  const ranges: Array<{ from: number; to: number }> = []
  let from = 0
  while (from < content.length) {
    let to = Math.min(content.length, from + maxChunkChars)
    if (to < content.length) {
      const paragraph = content.lastIndexOf('\n\n', to)
      const line = content.lastIndexOf('\n', to)
      const boundary = paragraph >= from + Math.floor(maxChunkChars / 2) ? paragraph + 2 : line >= from + Math.floor(maxChunkChars / 2) ? line + 1 : to
      to = Math.max(from + 1, boundary)
    }
    ranges.push({ from, to })
    from = to
  }
  return ranges
}

export function buildMultiFileRevisionTargets(
  documents: ContextDocument[],
  instruction: string,
  proposalSetId: string = crypto.randomUUID(),
  maxChunkChars = 6_000,
): MultiFileRevisionTarget[] {
  if (documents.length === 0 || documents.length > 8) throw new Error('多文件 DiffProposal 需要 1 到 8 个目标文档。')
  if (maxChunkChars < 500 || maxChunkChars > 20_000) throw new Error('DiffProposal 分块大小无效。')
  return documents.flatMap((document, documentIndex) => {
    const ranges = revisionRanges(document.content, maxChunkChars)
    const sourceFingerprint = fingerprintDocument(document.content)
    return ranges.map(({ from, to }, chunkIndex) => ({
      path: document.path,
      documentName: document.name,
      from,
      to,
      text: document.content.slice(from, to),
      instruction,
      sourceModifiedMs: 0,
      sourceFingerprint,
      proposalSetId,
      targetId: `document-${documentIndex + 1}-chunk-${chunkIndex + 1}`,
      chunkIndex,
      chunkCount: ranges.length,
    }))
  })
}

export function buildMultiFileRevisionContract(targets: MultiFileRevisionTarget[]): string {
  const body = targets.map((target) => `<revision-target id="${target.targetId}" file="${target.path}" part="${target.chunkIndex + 1}/${target.chunkCount}">\n${target.text}\n</revision-target>`).join('\n\n')
  return `这是多文件逐块修改任务。文件路径、分块范围和原文由本地应用锁定，模型只能为需要修改的目标返回替换文本。\n\n${body}\n\n请只返回 JSON 对象，不要使用 Markdown 代码围栏或附加说明：{"replacements":[{"targetId":"document-1-chunk-1","replacementText":"修改后的完整分块文本"}]}。targetId 必须来自上述目标且不得重复；不需要修改的目标可以省略；不得返回文件路径、范围或 diff 标记。`
}

export function createMultiFileDiffProposals(
  response: string,
  targets: MultiFileRevisionTarget[],
  idFactory: () => string = () => crypto.randomUUID(),
): DiffProposal[] {
  let parsed: unknown
  try { parsed = JSON.parse(unwrapCodeFence(response)) } catch { throw new Error('模型没有返回有效的多文件 DiffProposal JSON。') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 1 || !('replacements' in parsed)) {
    throw new Error('多文件 DiffProposal 只能包含 replacements。')
  }
  const replacements = (parsed as { replacements?: unknown }).replacements
  if (!Array.isArray(replacements) || replacements.length === 0 || replacements.length > targets.length) {
    throw new Error('多文件 DiffProposal replacements 数量无效。')
  }
  const targetMap = new Map(targets.map((target) => [target.targetId, target]))
  const seen = new Set<string>()
  return replacements.map((replacement) => {
    if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)
      || Object.keys(replacement).sort().join(',') !== 'replacementText,targetId') {
      throw new Error('多文件 DiffProposal 替换项结构无效。')
    }
    const { targetId, replacementText } = replacement as { targetId?: unknown; replacementText?: unknown }
    if (typeof targetId !== 'string' || seen.has(targetId) || !targetMap.has(targetId)) throw new Error('多文件 DiffProposal 包含未知或重复目标。')
    if (typeof replacementText !== 'string' || replacementText.length > 200_000) throw new Error('多文件 DiffProposal replacementText 无效或超过限制。')
    seen.add(targetId)
    const target = targetMap.get(targetId)!
    return {
      id: idFactory(), proposalSetId: target.proposalSetId, targetId, path: target.path,
      from: target.from, to: target.to, text: target.text, replacementText,
      instruction: target.instruction, sourceModifiedMs: target.sourceModifiedMs,
      sourceFingerprint: target.sourceFingerprint, chunkIndex: target.chunkIndex,
      chunkCount: target.chunkCount, status: 'proposed' as const, createdAt: Date.now(),
    }
  })
}

export function applyDiffProposal(content: string, proposal: DiffProposal): string {
  if (proposal.status !== 'proposed') throw new Error('DiffProposal 已处理。')
  if (fingerprintDocument(content) !== proposal.sourceFingerprint) throw new Error('源文档已变化，无法安全应用 DiffProposal。')
  if (proposal.from < 0 || proposal.to < proposal.from || proposal.to > content.length) throw new Error('DiffProposal 选区范围已经失效。')
  if (content.slice(proposal.from, proposal.to) !== proposal.text) throw new Error('源文档已变化，无法安全应用 DiffProposal。')
  return `${content.slice(0, proposal.from)}${proposal.replacementText}${content.slice(proposal.to)}`
}

export function applyDiffProposalSet(baseline: string, proposals: DiffProposal[]): string {
  if (proposals.length === 0) return baseline
  const fingerprint = fingerprintDocument(baseline)
  if (proposals.some((proposal) => proposal.sourceFingerprint !== fingerprint)) throw new Error('源文档已变化，无法安全应用 DiffProposal。')
  const ordered = [...proposals].sort((left, right) => right.from - left.from)
  let nextBoundary = baseline.length
  let content = baseline
  for (const proposal of ordered) {
    if (proposal.from < 0 || proposal.to < proposal.from || proposal.to > nextBoundary) throw new Error('DiffProposal 分块范围重叠或已经失效。')
    if (baseline.slice(proposal.from, proposal.to) !== proposal.text) throw new Error('源文档已变化，无法安全应用 DiffProposal。')
    content = `${content.slice(0, proposal.from)}${proposal.replacementText}${content.slice(proposal.to)}`
    nextBoundary = proposal.from
  }
  return content
}

export function formatDiffProposalMessage(proposal: DiffProposal): string {
  return `已生成选区修改提案，尚未写回文档。\n\n**目标**：\`${proposal.path}\`（字符 ${proposal.from}-${proposal.to}）\n\n**替换预览**\n\n${proposal.replacementText || '（删除选区内容）'}\n\n请在文件编辑器中接受或拒绝该提案。`
}

export function formatMultiFileDiffProposalMessage(proposals: DiffProposal[]): string {
  const files = [...new Set(proposals.map((proposal) => proposal.path))]
  return `已生成 ${proposals.length} 个逐块修改提案，覆盖 ${files.length} 个文档，尚未写回文件。请逐块审核；已接受修改只进入编辑器，仍需显式保存。`
}
