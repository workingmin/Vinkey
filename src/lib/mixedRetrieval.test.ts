import { describe, expect, it } from 'vitest'
import { retrieveMixed, scoreMixedRetrieval } from './mixedRetrieval'
import type { MixedRetrievalItem } from './mixedRetrieval'

const item = (overrides: Partial<MixedRetrievalItem> = {}): MixedRetrievalItem => ({
  id: 'doc', title: '雾港第一章', path: '章节/第一章.md', headings: ['林晚回到雾港', '父亲留下的一封信'], excerpt: '港口钟楼在雨中响了三下。', ...overrides,
})

describe('vector-free mixed retrieval', () => {
  it('prioritizes aliases over excerpt matches', () => {
    const exact = scoreMixedRetrieval('林晚', item({ title: '阿晚', aliases: ['林晚'] }))
    const excerpt = scoreMixedRetrieval('林晚', item())
    expect(exact).toBeGreaterThan(excerpt)
  })

  it('ranks heading and path signals ahead of generic body text', () => {
    const result = retrieveMixed([
      item({ id: 'a', headings: ['林晚寻找父亲'] }),
      item({ id: 'b' }),
    ], '林晚')
    expect(result[0].id).toBe('a')
  })

  it('returns only items with at least one signal', () => {
    expect(retrieveMixed([item({ id: 'noise', title: '无关文档', headings: [], excerpt: '' })], '林晚')).toEqual([])
  })
})
