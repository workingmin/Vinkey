import type { DiffProposal, EditorRevisionRequest } from '../types'

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
    status: 'proposed', createdAt: Date.now(),
  }
}

export function applyDiffProposal(content: string, proposal: DiffProposal): string {
  if (proposal.status !== 'proposed') throw new Error('DiffProposal 已处理。')
  if (fingerprintDocument(content) !== proposal.sourceFingerprint) throw new Error('源文档已变化，无法安全应用 DiffProposal。')
  if (proposal.from < 0 || proposal.to < proposal.from || proposal.to > content.length) throw new Error('DiffProposal 选区范围已经失效。')
  if (content.slice(proposal.from, proposal.to) !== proposal.text) throw new Error('源文档已变化，无法安全应用 DiffProposal。')
  return `${content.slice(0, proposal.from)}${proposal.replacementText}${content.slice(proposal.to)}`
}

export function formatDiffProposalMessage(proposal: DiffProposal): string {
  return `已生成选区修改提案，尚未写回文档。\n\n**目标**：\`${proposal.path}\`（字符 ${proposal.from}-${proposal.to}）\n\n**替换预览**\n\n${proposal.replacementText || '（删除选区内容）'}\n\n请在文件编辑器中接受或拒绝该提案。`
}
