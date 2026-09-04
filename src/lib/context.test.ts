import { describe, expect, it } from 'vitest'
import { buildContextMessage, buildRoutingContext, calculateContextBudget, estimateTokens, selectRecentMessages } from './context'

describe('conversation context budget', () => {
  it('estimates CJK text more densely than ASCII text', () => {
    expect(estimateTokens('雾港来信')).toBe(4)
    expect(estimateTokens('abcdefghijkl')).toBe(3)
  })

  it('builds selected-document context without copying the body', () => {
    const result = buildContextMessage([{ path: '设定/人物.md', name: '人物.md', content: '林晚', size: 2 }])
    expect(result).toContain('path="设定/人物.md"')
    expect(result).toContain('document-index')
    expect(result).toContain('name="人物.md"')
    expect(result).not.toContain('<document path=')
    expect(result).not.toContain('\n林晚\n')
  })

  it('builds a body-free document manifest for routing', () => {
    const result = buildRoutingContext([{ path: '小说.txt', name: '小说.txt', content: '林晚回乡', size: 12 }])
    expect(result).toBe(JSON.stringify({ documents: [{ path: '小说.txt', name: '小说.txt', size: 12, estimatedTokens: 4 }] }))
    expect(result).not.toContain('林晚回乡')
  })

  it('marks requests that exceed the available input window', () => {
    const budget = calculateContextBudget([], [], '雾'.repeat(2000), 2048)
    expect(budget.exceedsLimit).toBe(true)
  })

  it('keeps the newest messages that fit', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'a'.repeat(4000), createdAt: 1 },
      { id: '2', role: 'assistant' as const, content: 'short', createdAt: 2 },
    ]
    expect(selectRecentMessages(messages, [], 'next', 2048).map((item) => item.id)).toEqual(['2'])
  })
})
