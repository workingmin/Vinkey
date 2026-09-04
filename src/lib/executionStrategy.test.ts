import { describe, expect, it } from 'vitest'
import { classifyTask } from './intent'
import { usesLongTextWorkflow } from './executionStrategy'

describe('business chain execution strategy', () => {
  it('keeps metadata overview deterministic and model-free', () => {
    const plan = classifyTask('当前项目有哪些文件', false)
    expect(plan.execution).toEqual({
      currentMode: 'deterministic-service',
      targetMode: 'deterministic-service',
      workflow: null,
      agentUpgrade: 'never',
      requiredCapabilities: [],
    })
  })

  it('keeps deterministic chapter splitting outside agent runtimes', () => {
    const plan = classifyTask('拆分章节', true)
    expect(plan.execution.currentMode).toBe('deterministic-service')
    expect(plan.execution.workflow).toBe('structure-segmentation')
    expect(plan.execution.agentUpgrade).toBe('never')
    expect(plan.execution.requiredCapabilities).toContain('human-approval')
  })

  it('uses direct model execution for ordinary conversation', () => {
    const plan = classifyTask('帮我想三个标题', false)
    expect(plan.execution.currentMode).toBe('direct-model')
    expect(plan.execution.targetMode).toBe('direct-model')
    expect(usesLongTextWorkflow(plan.execution)).toBe(false)
  })

  it('describes focused analysis as a bounded fixed workflow', () => {
    const plan = classifyTask('介绍这个项目', false)
    expect(plan.execution.currentMode).toBe('fixed-workflow')
    expect(plan.execution.workflow).toBe('focused-analysis')
    expect(plan.execution.agentUpgrade).toBe('optional')
    expect(usesLongTextWorkflow(plan.execution)).toBe(false)
  })

  it('keeps deep analysis fixed today but marks a hybrid upgrade path', () => {
    const plan = classifyTask('深入分析当前项目的故事主线', false)
    expect(plan.execution.currentMode).toBe('fixed-workflow')
    expect(plan.execution.targetMode).toBe('hybrid-agent-workflow')
    expect(plan.execution.workflow).toBe('long-text-analysis')
    expect(plan.execution.agentUpgrade).toBe('optional')
    expect(usesLongTextWorkflow(plan.execution)).toBe(true)
  })

  it('recommends an agent upgrade for semantic structure and character reasoning', () => {
    const structure = classifyTask('重新梳理章节结构和隐含场景', true)
    const characters = classifyTask('分析这个故事的人物关系', true)
    for (const plan of [structure, characters]) {
      expect(plan.execution.targetMode).toBe('hybrid-agent-workflow')
      expect(plan.execution.agentUpgrade).toBe('recommended')
      expect(plan.execution.requiredCapabilities).toContain('tool-selection')
      expect(plan.execution.requiredCapabilities).toContain('structured-output')
    }
  })

  it('routes selected-document rewrites through the existing long-text workflow', () => {
    const plan = classifyTask('根据这个文件改写一版', true)
    expect(plan.intent).toBe('document-revision')
    expect(plan.execution.agentUpgrade).toBe('recommended')
    expect(plan.execution.workflow).toBe('long-text-analysis')
    expect(usesLongTextWorkflow(plan.execution)).toBe(true)
  })
})
