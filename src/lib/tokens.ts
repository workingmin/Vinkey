const CJK_SCRIPT = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u
const textEncoder = new TextEncoder()

/** Rough token estimate: one token per CJK character, four other characters per token. */
export function estimateTokens(value: string): number {
  let cjk = 0
  let other = 0
  for (const character of value) {
    if (CJK_SCRIPT.test(character)) cjk += 1
    else other += 1
  }
  return cjk + Math.ceil(other / 4)
}

/** Character count by code point, so astral characters count once. */
export function charCount(value: string): number {
  return Array.from(value).length
}

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).byteLength
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

export interface ClippedText {
  value: string
  truncated: boolean
}

/**
 * Largest prefix of `value` that fits `limit` estimated tokens. When a suffix
 * marker is supplied it is reserved inside the budget and appended only on
 * truncation, so the result never exceeds the limit.
 */
export function clipToTokens(value: string, limit: number, suffix = ''): ClippedText {
  if (estimateTokens(value) <= limit) return { value, truncated: false }
  const available = Math.max(0, limit - estimateTokens(suffix))
  let lower = 0
  let upper = value.length
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    if (estimateTokens(value.slice(0, middle)) <= available) lower = middle
    else upper = middle - 1
  }
  return { value: `${value.slice(0, lower).trimEnd()}${suffix}`, truncated: true }
}
