import { describe, expect, it } from 'vitest'
import { classifyTask } from './intent'

describe('task routing', () => {
  it('routes chapter segmentation without a model', () => {
    const plan = classifyTask('请在当前项目中按已选文档的章节和场景边界生成拆分文件；首轮使用本地规则粗分，不覆盖原文。', true)
    expect(plan.intent).toBe('structure-segmentation')
    expect(plan.operation).toBe('segment')
    expect(plan.requiresModel).toBe(false)
    expect(plan.sideEffect).toBe('proposal')
    expect(plan.execution.currentMode).toBe('deterministic-service')
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
    expect(plan.execution.currentMode).toBe('direct-model')
  })

  it('does not attach unrelated selected documents to ordinary chat', () => {
    expect(classifyTask('帮我想三个标题。', true).documentAccess).toBe('none')
    expect(classifyTask('帮我写一篇文章。', true).documentAccess).toBe('none')
    const revision = classifyTask('根据这个文件改写一版。', true)
    expect(revision.intent).toBe('document-revision')
    expect(revision.agent).toBe('RevisionEditor')
    expect(revision.skill).toBe('document-revision')
    expect(revision.operation).toBe('revise')
    expect(revision.documentAccess).toBe('selected')
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
    expect(plan.analysisMode).toBe('deep')
    expect(plan.confidence).toBe('high')
  })

  it.each(['检查当前项目的连续性', '找出这个项目的设定冲突', '检查当前项目伏笔回收'])(
    'routes continuity request %s before generic workspace analysis',
    (prompt) => {
      const plan = classifyTask(prompt, false)
      expect(plan.intent).toBe('continuity-review')
      expect(plan.agent).toBe('ContinuityReviewer')
      expect(plan.skill).toBe('continuity-review')
      expect(plan.operation).toBe('review')
      expect(plan.scope).toBe('workspace')
      expect(plan.documentAccess).toBe('workspace')
      expect(plan.execution.agentUpgrade).toBe('recommended')
    },
  )

  it('uses selected documents for a bounded continuity review', () => {
    const plan = classifyTask('检查这几章有没有前后矛盾', true)
    expect(plan.intent).toBe('continuity-review')
    expect(plan.scope).toBe('selected-documents')
    expect(plan.documentAccess).toBe('selected')
    expect(plan.scope).toBe('selected-documents')
  })

  it('routes a selected-document question to a document-grounded chain', () => {
    const plan = classifyTask('根据这个文件回答主角为什么离开', true)
    expect(plan.intent).toBe('document-analysis')
    expect(plan.skill).toBe('long-text-analysis')
    expect(plan.documentAccess).toBe('selected')
    expect(plan.allowedTools).toContain('chunk_document')
  })

  it('routes project-wide file content questions to workspace analysis', () => {
    const plan = classifyTask('分析当前项目有哪些文件内容', false)
    expect(plan.intent).toBe('workspace-analysis')
    expect(plan.scope).toBe('workspace')
    expect(plan.documentAccess).toBe('workspace')
    expect(plan.analysisCoverage).toBe('targeted')
    expect(plan.sourcePolicy).toBe('local-chunks')
  })

  it.each(['这个项目', '分析这个项目', '介绍这个项目', '这个项目是做什么的', '这个项目搞的什么', '这个项目有什么用'])(
    'routes broad workspace question %s to focused analysis',
    (prompt) => {
      const plan = classifyTask(prompt, false)
      expect(plan.scope).toBe('workspace')
      expect(plan.analysisMode).toBe('focused')
      expect(plan.documentAccess).toBe('workspace-focused')
      expect(plan.sourcePolicy).toBe('local-excerpts')
      expect(plan.confidence).toBe('medium')
    },
  )

  it.each(['深入分析这个项目', '总结这个项目', '这个项目里有哪些角色', '分析当前项目的故事结构'])(
    'keeps evidence-heavy workspace question %s on deep analysis',
    (prompt) => {
      const plan = classifyTask(prompt, false)
      expect(plan.analysisMode).toBe('deep')
      expect(plan.documentAccess).toBe('workspace')
      expect(plan.sourcePolicy).toBe('local-chunks')
    },
  )

  it.each(['当前项目有哪些文件', '项目目录结构是什么', '当前工作区有多少个文档', '项目文件类型分布'])(
    'routes metadata workspace question %s to a deterministic overview',
    (prompt) => {
      const plan = classifyTask(prompt, false)
      expect(plan.scope).toBe('workspace')
      expect(plan.analysisMode).toBe('overview')
      expect(plan.documentAccess).toBe('workspace-metadata')
      expect(plan.requiresModel).toBe(false)
      expect(plan.execution.currentMode).toBe('deterministic-service')
    },
  )

  it('separates deep mode from exhaustive coverage', () => {
    const targeted = classifyTask('详细分析这个项目的人物关系', false)
    expect(targeted.analysisMode).toBe('deep')
    expect(targeted.analysisCoverage).toBe('targeted')
    expect(targeted.documentAccess).toBe('workspace')

    const exhaustive = classifyTask('完整通读当前项目，逐章分析，不要遗漏', false)
    expect(exhaustive.analysisMode).toBe('deep')
    expect(exhaustive.analysisCoverage).toBe('exhaustive')
  })

  it('does not confuse a request about file structure with semantic analysis', () => {
    expect(classifyTask('分析一下当前项目的目录结构', false).analysisMode).toBe('overview')
    expect(classifyTask('分析当前项目的故事结构', false).analysisMode).toBe('deep')
  })
})
