import type { ContextDocument, WorkspaceSnapshot } from '../types'
import { estimateTokens } from './context'
import { buildWorkspaceProfile } from './workspaceOverview'

const MAX_FOCUSED_CONTEXT_TOKENS = 12_000
const PROFILE_FILE_LIMIT = 40

function clipToTokens(value: string, limit: number): { value: string; truncated: boolean } {
  if (estimateTokens(value) <= limit) return { value, truncated: false }
  let lower = 0
  let upper = value.length
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    if (estimateTokens(value.slice(0, middle)) <= limit) lower = middle
    else upper = middle - 1
  }
  return { value: value.slice(0, lower).trimEnd(), truncated: true }
}

export function buildFocusedWorkspaceMessage(
  workspace: WorkspaceSnapshot,
  documents: ContextDocument[],
  contextWindow: number,
): string {
  const tokenLimit = Math.min(MAX_FOCUSED_CONTEXT_TOKENS, Math.max(512, Math.floor(contextWindow * 0.45)))
  const profile = buildWorkspaceProfile(workspace, PROFILE_FILE_LIMIT)
  const evidence: Array<{ path: string; kind: string; excerpt: string; truncated: boolean }> = []
  let remaining = tokenLimit - estimateTokens(JSON.stringify(profile)) - 160

  for (let index = 0; index < documents.length && remaining > 96; index += 1) {
    const document = documents[index]
    const documentsLeft = documents.length - index
    const allowance = Math.max(96, Math.floor(remaining / documentsLeft) - 32)
    const clipped = clipToTokens(document.content, allowance)
    evidence.push({
      path: document.path,
      kind: document.kind ?? 'text',
      excerpt: clipped.value,
      truncated: clipped.truncated,
    })
    remaining -= estimateTokens(clipped.value) + 32
  }

  return `以下是当前项目的聚焦证据。请优先直接回答用户询问的项目性质、用途和核心组成；只依据画像、已有项目记忆和这些有限摘录，不要把未读取部分说成已确认事实。证据不足时简短说明局限，并建议用户是否需要继续深度分析。回答中注明主要依据的相对文件路径。\n\n<focused-project-evidence>\n${JSON.stringify({ profile, documents: evidence }, null, 2)}\n</focused-project-evidence>`
}
