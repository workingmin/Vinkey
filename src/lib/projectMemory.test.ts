import { describe, expect, it } from 'vitest'
import { buildMemoryCandidate, buildMemoryCandidates, buildProjectMemoryContext, selectRelevantMemory } from './projectMemory'
import type { ProjectMemoryItem } from '../types'

const memory = (overrides: Partial<ProjectMemoryItem>): ProjectMemoryItem => ({
  id: 'memory-1', kind: 'summary', title: '雾港项目', content: '林晚回到雾港寻找父亲留下的信。', sourcePaths: ['第一章.md'],
  confidence: 'medium', status: 'confirmed', createdAt: 1, updatedAt: 1, ...overrides,
})

describe('project memory helpers', () => {
  it('creates bounded candidates with unique sources', () => {
    const candidate = buildMemoryCandidate('  项目摘要  ', ['a.md', 'a.md', 'b.md'], '梳理项目')
    expect(candidate?.kind).toBe('summary')
    expect(candidate?.sourcePaths).toEqual(['a.md', 'b.md'])
    expect(candidate?.content).toBe('项目摘要')
  })

  it('extracts categorized candidates from report headings', () => {
    const result = buildMemoryCandidates('# 摘要\n\n这是足够长的摘要内容，用于保留项目背景和主要冲突信息。\n\n## 人物线\n\n林晚寻找父亲留下的信，并在过程中改变了对父亲的看法。', ['a.md'], '分析项目')
    expect(result.map((item) => item.kind)).toEqual(['summary', 'summary', 'character'])
  })

  it('selects only confirmed memory relevant to a query', () => {
    const result = selectRelevantMemory([
      memory({ id: 'a', content: '林晚寻找父亲的信。' }),
      memory({ id: 'b', status: 'proposed', content: '林晚的年龄。' }),
      memory({ id: 'c', content: '港口钟楼的时间线。' }),
    ], '父亲 信')
    expect(result.map((item) => item.id)).toEqual(['a'])
  })

  it('renders a bounded memory context', () => {
    const result = buildProjectMemoryContext([memory({ id: 'a' })])
    expect(result).toContain('<project-memory>')
    expect(result).toContain('仅作为辅助上下文')
  })
})
