import { describe, expect, it } from 'vitest'
import { buildDocumentIndexMessage, buildDocumentMetadata, buildDocumentMetadataCards } from './documentMetadata'

describe('document metadata index cards', () => {
  it('extracts file facts and structural hints without exposing the full body', () => {
    const document = {
      path: '章节/第一章.md',
      name: '第一章.md',
      content: '# 第一章 归港\n\n林晚回到雾港。林晚发现林崇山留下的信。\n\n林崇山的钟楼无人维护。',
      size: 1,
    }
    const card = buildDocumentMetadata(document)
    expect(card.documentType).toBe('markdown')
    expect(card.sizeBytes).toBeGreaterThan(card.contentChars)
    expect(card.headings).toEqual(['第一章 归港'])
    expect(card.entityCandidates).toContain('林晚')
    expect(card.entityCandidates).toContain('林崇山')
    expect(card.summary).toContain('第一章 归港')
    expect(card.answerableQuestions.some((question) => question.includes('是什么关系'))).toBe(true)
    expect(card.preview).toContain('林晚回到雾港')
  })

  it('builds a compact index for multiple files', () => {
    const documents = [
      { path: '人物.md', name: '人物.md', content: '# 人物\n\n林晚', size: 8 },
      { path: '时间线.txt', name: '时间线.txt', content: '2024 林晚回乡', size: 14 },
    ]
    const cards = buildDocumentMetadataCards(documents)
    const index = buildDocumentIndexMessage(documents)
    expect(cards).toHaveLength(2)
    expect(index).toContain('<document-index>')
    expect(index).toContain('name="人物.md"')
    expect(index).toContain('chars="8"')
    expect(index).toContain('正文前缀预览')
    expect(index).not.toContain('2024 林晚回乡</file>')
  })
})
