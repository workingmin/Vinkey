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
      approvalPolicy: 'user-confirm', modelRequirements: 'none', sideEffects: ['proposal'], contextScopes: ['selected-documents'],
    })
    expect(getToolDefinition('stream_chat')).toMatchObject({ permission: 'model-invoke', cancellable: true })
  })

  it('allows continuity review at selected-document or workspace scope', () => {
    expect(getSkillDefinition('continuity-review')?.contextScopes).toEqual(['selected-documents', 'workspace'])
  })

  it('adds agent, skill and tool capabilities to routed plans', () => {
    const plan = classifyTask('当前项目有哪些文件', false)
    expect(plan.agent).toBe('StoryDeconstruction')
    expect(plan.skill).toBe('workspace-overview')
    expect(plan.allowedTools).toContain('get_workspace_profile')
    expect(plan.allowedTools).not.toContain('read_document')
    expect(plan.allowedTools).not.toContain('chunk_document')
    expect(plan.requiresModel).toBe(false)
    expect(getSkillDefinition('workspace-overview')?.modelRequirements).toBe('none')
    expect(plan.allowedTools).toEqual(getTaskCapabilities(plan.intent, plan.analysisMode).allowedTools)
  })

  it('grants chunk tools only to deep analysis', () => {
    const plan = classifyTask('深入分析当前项目', false)
    expect(plan.skill).toBe('workspace-analysis')
    expect(plan.allowedTools).toContain('read_document')
    expect(plan.allowedTools).toContain('chunk_document')
  })

  it('gives focused analysis bounded read tools without chunk orchestration', () => {
    const plan = classifyTask('这个项目搞的什么', false)
    expect(plan.skill).toBe('workspace-focused-analysis')
    expect(plan.allowedTools).toContain('read_document')
    expect(plan.allowedTools).toContain('stream_chat')
    expect(plan.allowedTools).not.toContain('chunk_document')
    expect(plan.allowedTools).not.toContain('write_analysis_artifact')
  })

  it('keeps overview tool schemas free of raw source fields', () => {
    for (const name of ['get_workspace_profile', 'list_document_profiles', 'get_document_digest', 'get_project_digest']) {
      const schema = JSON.stringify(getToolDefinition(name)?.outputSchema)
      expect(schema).not.toMatch(/"(?:content|text|chunk|preview|quote)"\s*:/u)
    }
  })
})
