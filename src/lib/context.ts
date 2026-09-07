import type { ChatMessage, ContextDocument } from '../types'
import { buildDocumentIndexMessage } from './documentMetadata'

export interface ContextBudget {
  estimatedTokens: number
  limit: number
  usedPercent: number
  exceedsLimit: boolean
}

export interface RoutingDocument {
  path: string
  name: string
  size: number
  estimatedTokens: number
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
  return buildDocumentIndexMessage(documents)
}

/** Build a bounded, source-labelled body context for revision tasks. */
export function buildRevisionContextMessage(documents: ContextDocument[], maxTokens = 12_000): string | null {
  if (documents.length === 0) return null
  const sections: string[] = []
  let remaining = Math.max(256, maxTokens)
  for (const document of documents) {
    if (remaining <= 128) break
    const header = `来源文件：${document.path}\n`
    const headerTokens = estimateTokens(header) + 32
    const allowance = Math.max(128, remaining - headerTokens)
    let body = document.content
    if (estimateTokens(body) > allowance) {
      let lower = 0
      let upper = body.length
      while (lower < upper) {
        const middle = Math.ceil((lower + upper) / 2)
        if (estimateTokens(body.slice(0, middle)) <= allowance) lower = middle
        else upper = middle - 1
      }
      body = `${body.slice(0, lower).trimEnd()}\n[原文已按任务预算截断]`
    }
    sections.push(`${header}<source-document>\n${body}\n</source-document>`)
    remaining -= estimateTokens(header) + estimateTokens(body) + 32
  }
  return `以下是允许用于本次创作修改的原文上下文。只修改用户要求的范围，不修改来源文件；最终输出草稿或 diff，不要声称已写回文件。\n\n${sections.join('\n\n')}`
}

/** Stable, body-free input for a task router or routing model. */
export function buildRoutingContext(documents: ContextDocument[]): string | null {
  if (documents.length === 0) return null
  const manifest: RoutingDocument[] = documents.map(({ path, name, content, size }) => ({
    path,
    name,
    size,
    estimatedTokens: estimateTokens(content),
  }))
  return JSON.stringify({ documents: manifest })
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
