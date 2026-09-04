import { describe, expect, it } from 'vitest'
import { classifyTask } from './intent'

describe('task routing', () => {
  it('routes chapter segmentation without a model', () => {
    const plan = classifyTask('请在当前项目中按已选文档的章节和场景边界生成拆分文件；首轮使用本地规则粗分，不覆盖原文。', true)
    expect(plan.intent).toBe('structure-segmentation')
    expect(plan.operation).toBe('segment')
    expect(plan.requiresModel).toBe(false)
    expect(plan.sideEffect).toBe('proposal')
  })

  it('accepts both natural word orders for chapter splitting', () => {
    expect(classifyTask('拆分章节', true).intent).toBe('structure-segmentation')
    expect(classifyTask('章节拆分', true).intent).toBe('structure-segmentation')
    expect(classifyTask('识别场景边界', true).intent).toBe('structure-segmentation')
  })

  it('keeps ordinary conversation model-backed', () => {
    const plan = classifyTask('帮我把这段话写得更克制一些。', false)
    expect(plan.intent).toBe('general-chat')
    expect(plan.documentAccess).toBe('none')
    expect(plan.requiresModel).toBe(true)
  })

  it('does not attach unrelated selected documents to ordinary chat', () => {
    expect(classifyTask('帮我想三个标题。', true).documentAccess).toBe('none')
    expect(classifyTask('帮我写一篇文章。', true).documentAccess).toBe('none')
    expect(classifyTask('根据这个文件改写一版。', true).documentAccess).toBe('selected')
  })

  it('routes optional semantic restructuring back to the model', () => {
    const plan = classifyTask('重新梳理章节结构，补充隐含场景和剧情阶段。', true)
    expect(plan.intent).toBe('structure-enhancement')
    expect(plan.requiresModel).toBe(true)
  })

  it('routes novel summary questions to document analysis', () => {
    const plan = classifyTask('这个小说说了什么', true)
    expect(plan.intent).toBe('document-analysis')
    expect(plan.operation).toBe('analyze')
    expect(plan.scope).toBe('selected-documents')
    expect(plan.requiresModel).toBe(true)
  })

  it('routes specific character relationship questions to document analysis', () => {
    const plan = classifyTask('林晚和林崇山是什么关系？', true)
    expect(plan.intent).toBe('character-analysis')
    expect(plan.operation).toBe('analyze')
    expect(plan.documentAccess).toBe('selected')
    expect(plan.confidence).toBe('high')
  })

  it('routes project-wide file content questions to workspace analysis', () => {
    const plan = classifyTask('分析当前项目有哪些文件内容', false)
    expect(plan.intent).toBe('workspace-analysis')
    expect(plan.scope).toBe('workspace')
    expect(plan.documentAccess).toBe('workspace')
  })
})
