import { describe, expect, it } from 'vitest'
import { charCount, clipToTokens, estimateTokens, formatCount, utf8ByteLength } from './tokens'

describe('text metrics', () => {
  it('weights CJK characters more densely than ASCII', () => {
    expect(estimateTokens('雾港来信')).toBe(4)
    expect(estimateTokens('abcdefghijkl')).toBe(3)
  })

  it('counts code points instead of UTF-16 units', () => {
    expect(charCount('林晚🙂')).toBe(3)
    expect(utf8ByteLength('林晚')).toBe(6)
  })

  it('formats counts with zh-CN grouping', () => {
    expect(formatCount(12_345)).toBe('12,345')
  })

  it('returns the untouched value when it already fits', () => {
    expect(clipToTokens('短文本', 64)).toEqual({ value: '短文本', truncated: false })
  })

  it('keeps the truncated result including its marker inside the budget', () => {
    const marker = '\n[截断]'
    const clipped = clipToTokens('正文'.repeat(500), 120, marker)
    expect(clipped.truncated).toBe(true)
    expect(clipped.value.endsWith(marker)).toBe(true)
    expect(estimateTokens(clipped.value)).toBeLessThanOrEqual(120)
  })
})
