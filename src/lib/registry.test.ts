import { describe, expect, it } from 'vitest'
import { classifyTask } from './intent'
import { getSkillDefinition, getTaskCapabilities, getToolDefinition, listSkillDefinitions, listToolDefinitions } from './registry'

describe('runtime capability registry', () => {
  it('keeps tool and skill names unique and skill tools registered', () => {
    const tools = listToolDefinitions()
    const skills = listSkillDefinitions()
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length)
    expect(new Set(skills.map((skill) => skill.name)).size).toBe(skills.length)
    for (const skill of skills) {
      for (const toolName of skill.allowedTools) expect(getToolDefinition(toolName)).toBeDefined()
    }
  })

  it('exposes explicit approval and model requirements', () => {
    expect(getSkillDefinition('chapter-boundary-detect')).toMatchObject({
      approvalPolicy: 'user-confirm', modelRequirements: 'none', sideEffects: ['proposal'],
    })
    expect(getToolDefinition('stream_chat')).toMatchObject({ permission: 'model-invoke', cancellable: true })
  })

  it('adds agent, skill and tool capabilities to routed plans', () => {
    const plan = classifyTask('分析当前项目有哪些文件内容', false)
    expect(plan.agent).toBe('StoryDeconstruction')
    expect(plan.skill).toBe('workspace-analysis')
    expect(plan.allowedTools).toContain('chunk_document')
    expect(plan.allowedTools).toEqual(getTaskCapabilities(plan.intent).allowedTools)
  })
})
