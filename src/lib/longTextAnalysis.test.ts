import { describe, expect, it } from 'vitest'
import { batchSummaries, chunkTaskGuidance, finalTaskGuidance } from './longTextAnalysis'

describe('long text analysis orchestration', () => {
  it('packs summaries into budgeted reduce batches without dropping records', () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      sourceId: 'book.md', chunkId: `chunk-${index}`, heading: null, text: '雾'.repeat(900),
    }))
    const batches = batchSummaries(records, 4096)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.flat().map((record) => record.chunkId)).toEqual(records.map((record) => record.chunkId))
  })

  it('keeps a single small batch intact', () => {
    const records = [{ sourceId: 'book.md', chunkId: 'chunk-0', heading: '第一章', text: '林晚走进雾里。' }]
    expect(batchSummaries(records, 32768)).toEqual([records])
  })

  it('uses evidence-first guidance for continuity review', () => {
    const chunkGuidance = chunkTaskGuidance('检查当前项目的连续性和设定冲突')
    expect(chunkGuidance).toContain('事实断言')
    expect(chunkGuidance).toContain('不要仅凭信息缺失判定冲突')

    const finalGuidance = finalTaskGuidance('检查当前项目的连续性和设定冲突')
    expect(finalGuidance).toContain('明确冲突、疑似冲突和待补证项')
    expect(finalGuidance).toContain('最小修改建议')
  })

  it('keeps creative and relationship tasks on their dedicated guidance', () => {
    expect(finalTaskGuidance('续写这一章')).toContain('完成用户的创作或改写任务')
    expect(finalTaskGuidance('分析林晚和父亲的关系')).toContain('先直接回答用户询问的人物关系')
  })

  it('keeps generic document answers focused on the user task', () => {
    const guidance = finalTaskGuidance('根据这个文件回答主角为什么离开')
    expect(guidance).toContain('直接完成用户任务')
    expect(guidance).toContain('不要机械补充无关的文档概览')
  })
})
