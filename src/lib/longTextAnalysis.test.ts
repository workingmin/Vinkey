import { describe, expect, it } from 'vitest'
import { batchSummaries } from './longTextAnalysis'

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
})
