import { describe, expect, it } from 'vitest'
import { classifyTask } from './intent'

describe('task routing', () => {
  it('routes chapter segmentation without a model', () => {
    const plan = classifyTask('请根据已选文档识别章节和场景边界，给出章节拆分建议。', true)
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
    expect(plan.requiresModel).toBe(true)
  })

  it('routes optional semantic restructuring back to the model', () => {
    const plan = classifyTask('重新梳理章节结构，补充隐含场景和剧情阶段。', true)
    expect(plan.intent).toBe('structure-enhancement')
    expect(plan.requiresModel).toBe(true)
  })
})
