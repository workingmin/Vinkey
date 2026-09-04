import { describe, expect, it } from 'vitest'
import { formatConversationAge } from './conversationTime'

describe('formatConversationAge', () => {
  const now = Date.UTC(2026, 8, 4, 12)

  it('formats recent activity in compact minute and hour units', () => {
    expect(formatConversationAge(now - 30_000, now)).toBe('<1分钟')
    expect(formatConversationAge(now - 17 * 60_000, now)).toBe('17分钟')
    expect(formatConversationAge(now - 3 * 60 * 60_000, now)).toBe('3小时')
  })

  it('formats older activity in whole days', () => {
    expect(formatConversationAge(now - 6 * 24 * 60 * 60_000, now)).toBe('6天')
  })

  it('handles future, missing, and invalid timestamps', () => {
    expect(formatConversationAge(now + 60_000, now)).toBe('<1分钟')
    expect(formatConversationAge(0, now)).toBe('')
    expect(formatConversationAge(Number.NaN, now)).toBe('')
  })
})
