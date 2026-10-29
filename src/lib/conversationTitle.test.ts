import { describe, expect, it } from 'vitest'
import { buildTemporaryTitle, deriveSemanticTitle, normalizeConversationTitle, shouldUpgradeTitle } from './conversationTitle'

describe('conversation title lifecycle', () => {
  it('builds a deterministic model-free temporary title', () => {
    expect(buildTemporaryTitle('  请帮我 分析 这一段   ')).toBe('请帮我 分析 这一段')
  })

  it('normalizes empty input back to a stable fallback', () => {
    expect(normalizeConversationTitle('   ', '未命名会话')).toBe('未命名会话')
  })

  it('derives a semantic candidate from the first meaningful response line', () => {
    expect(deriveSemanticTitle('分析人物', '林晚最终回到雾港。')).toBe('林晚最终回到雾港。')
  })

  it('upgrades exactly once when a model is available', () => {
    expect(shouldUpgradeTitle(false, true, 1)).toBe(true)
    expect(shouldUpgradeTitle(true, true, 1)).toBe(false)
    expect(shouldUpgradeTitle(false, false, 1)).toBe(false)
  })
})
