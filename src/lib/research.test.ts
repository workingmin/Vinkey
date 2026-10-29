import { describe, expect, it } from 'vitest'
import { composeResearchPrompt } from './research'

const evidence = {
  id: 'evidence-0',
  sourceId: 'wikipedia-zh',
  title: '市易法',
  url: 'https://zh.wikipedia.org/wiki/市易法',
  publisher: '中文维基百科',
  retrievedAt: 1,
  excerpt: '北宋熙宁年间推行的市场管理法令。',
  trustLevel: 'curated',
  contentHash: 'sha256:test',
  status: 'supported' as const,
  issues: [],
}

describe('research prompt composition', () => {
  it('keeps web evidence out of system instruction position', () => {
    const prompt = composeResearchPrompt('什么是市易法？', [evidence])
    expect(prompt).toContain('外部证据')
    expect(prompt).toContain('什么是市易法？')
    expect(prompt).toContain('市易法')
    expect(prompt).toContain('sha256:test')
  })

  it('reports no evidence instead of fabricating sources', () => {
    const prompt = composeResearchPrompt('什么是市易法？', [])
    expect(prompt).toContain('（无证据）')
  })
})
