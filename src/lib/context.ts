import type { ChatMessage, ContextDocument } from '../types'

export interface ContextBudget {
  estimatedTokens: number
  limit: number
  usedPercent: number
  exceedsLimit: boolean
}

export function estimateTokens(value: string): number {
  let cjk = 0
  let other = 0
  for (const character of value) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) cjk += 1
    else other += 1
  }
  return cjk + Math.ceil(other / 4)
}

export function buildContextMessage(documents: ContextDocument[]): string | null {
  if (documents.length === 0) return null
  const content = documents.map((document) =>
    `<document path="${document.path}">\n${document.content}\n</document>`).join('\n\n')
  return `以下是用户明确选择的本地创作文档。仅将它们作为参考，不要声称访问了其他文件。\n\n${content}`
}

export function calculateContextBudget(
  messages: Array<Pick<ChatMessage, 'content'>>,
  documents: ContextDocument[],
  draft: string,
  contextWindow: number,
): ContextBudget {
  const context = buildContextMessage(documents) ?? ''
  const inputTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)
    + estimateTokens(context) + estimateTokens(draft)
  const outputReserve = Math.min(4096, Math.max(1024, Math.floor(contextWindow * 0.2)))
  const safetyReserve = Math.max(512, Math.floor(contextWindow * 0.1))
  const limit = Math.max(1024, contextWindow - outputReserve - safetyReserve)
  return {
    estimatedTokens: inputTokens,
    limit,
    usedPercent: Math.min(100, Math.round((inputTokens / limit) * 100)),
    exceedsLimit: inputTokens > limit,
  }
}

export function selectRecentMessages(
  messages: ChatMessage[],
  documents: ContextDocument[],
  draft: string,
  contextWindow: number,
): ChatMessage[] {
  const fixedTokens = estimateTokens(buildContextMessage(documents) ?? '') + estimateTokens(draft)
  const outputReserve = Math.min(4096, Math.max(1024, Math.floor(contextWindow * 0.2)))
  const safetyReserve = Math.max(512, Math.floor(contextWindow * 0.1))
  let remaining = Math.max(0, contextWindow - outputReserve - safetyReserve - fixedTokens)
  const selected: ChatMessage[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const cost = estimateTokens(messages[index].content)
    if (cost > remaining) break
    selected.unshift(messages[index])
    remaining -= cost
  }
  return selected
}
