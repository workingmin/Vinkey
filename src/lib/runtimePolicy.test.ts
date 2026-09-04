import { describe, expect, it } from 'vitest'
import { classifyTask } from './intent'
import { assertRoutedTaskPolicy, validateRoutedTaskPolicy } from './runtimePolicy'

describe('routed task runtime policy', () => {
  it('accepts every currently routed business chain', () => {
    const plans = [
      classifyTask('当前项目有哪些文件', false),
      classifyTask('介绍当前项目', false),
      classifyTask('深入分析当前项目', false),
      classifyTask('检查当前项目的连续性', false),
      classifyTask('检查这几章有没有前后矛盾', true),
      classifyTask('根据这个文件改写一版', true),
      classifyTask('拆分章节', true),
      classifyTask('普通聊天', false),
    ]
    for (const plan of plans) expect(validateRoutedTaskPolicy(plan)).toEqual([])
  })

  it('rejects raw document tools on metadata-only tasks', () => {
    const plan = classifyTask('当前项目有哪些文件', false)
    expect(validateRoutedTaskPolicy({ ...plan, allowedTools: [...plan.allowedTools, 'read_document'] }))
      .toContain('Skill workspace-overview 未授权 Tool：read_document')
    expect(() => assertRoutedTaskPolicy({ ...plan, allowedTools: [...plan.allowedTools, 'read_document'] }))
      .toThrow('任务能力配置无效')
  })

  it('rejects tools that are outside a skill allowlist', () => {
    const plan = classifyTask('普通聊天', false)
    const errors = validateRoutedTaskPolicy({ ...plan, allowedTools: [...plan.allowedTools, 'create_document'] })
    expect(errors).toContain('Skill general-conversation 未授权 Tool：create_document')
  })

  it('rejects model calls from model-free tasks', () => {
    const plan = classifyTask('拆分章节', true)
    const errors = validateRoutedTaskPolicy({ ...plan, allowedTools: [...plan.allowedTools, 'stream_chat'] })
    expect(errors).toContain('非模型任务不能获得 stream_chat')
  })

  it('rejects a routed scope that the skill does not allow', () => {
    const plan = classifyTask('普通聊天', false)
    const errors = validateRoutedTaskPolicy({ ...plan, scope: 'workspace' })
    expect(errors).toContain('Skill general-conversation 不允许上下文作用域 workspace')
  })

  it('requires model-backed tasks to use the registered model gateway', () => {
    const plan = classifyTask('普通聊天', false)
    const errors = validateRoutedTaskPolicy({ ...plan, allowedTools: ['search_project_memory'] })
    expect(errors).toContain('模型任务必须通过 stream_chat 调用模型')
  })
})
