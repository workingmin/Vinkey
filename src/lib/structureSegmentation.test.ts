import { describe, expect, it } from 'vitest'
import { buildStructureOutputs, formatStructureResult, segmentDocument } from './structureSegmentation'

describe('local structure segmentation', () => {
  it('finds chapter and scene boundaries without model access', () => {
    const proposal = segmentDocument({
      path: 'book.txt',
      name: 'book.txt',
      content: '引子\n\n第一章 雾港\n\n林晚走下渡轮。\n\n***\n\n她看见旧钟楼。\n\n第二章 信件\n\n信封没有邮戳。',
      size: 0,
    })
    expect(proposal.segments.map((segment) => segment.kind)).toEqual(['chapter', 'chapter', 'scene', 'chapter'])
    expect(proposal.segments[0].lineStart).toBe(1)
    expect(proposal.segments[2].splitReason).toBe('scene-separator')
    expect(proposal.segments[3].title).toBe('第二章 信件')
  })

  it('returns a low-confidence segment when no explicit markers exist', () => {
    const proposal = segmentDocument({ path: 'plain.txt', name: 'plain.txt', content: '第一段。\n\n第二段。', size: 0 })
    expect(proposal.segments).toHaveLength(1)
    expect(proposal.segments[0].confidence).toBe('low')
    expect(proposal.segments[0].splitReason).toBe('no-explicit-boundary')
  })

  it('writes visible chapter files with deterministic names', () => {
    const proposal = segmentDocument({ path: 'plain.txt', name: 'plain.txt', content: '第一段。', size: 0 })
    const outputs = buildStructureOutputs({ path: 'draft/plain.txt', name: 'plain.txt', content: '第一段。', size: 0 }, proposal)
    expect(outputs[0].path).toBe('draft/plain-章节拆分/001-章节-未命名章节-1.txt')
    expect(outputs[0].content).toBe('第一段。')
    expect(formatStructureResult([proposal], outputs.map((output) => output.path))).toContain('已完成本地章节拆分')
  })

  it('keeps Unicode character offsets stable around emoji', () => {
    const proposal = segmentDocument({
      path: 'unicode.txt',
      name: 'unicode.txt',
      content: '😀 引子\n\n第一章\n\n正文',
      size: 0,
    })
    expect(proposal.segments[1].startChar).toBe(Array.from('😀 引子\n\n').length)
    expect(proposal.segments[1].preview).toContain('第一章')
  })
})
