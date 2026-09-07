import { getSkillDefinition, getToolDefinition } from './registry'
import type { SkillId } from './registry'
import type { AnalysisMode, SourcePolicy } from '../types'
import type { TaskSideEffect } from './intent'
import type { TaskScope } from './intent'
import { assertJsonSchema } from './jsonSchema'

export interface RoutedTaskPolicy {
  skill: SkillId
  allowedTools: string[]
  sideEffect: TaskSideEffect
  scope: TaskScope
  requiresModel: boolean
  analysisMode: AnalysisMode | null
  sourcePolicy: SourcePolicy
}

export interface ToolGateway {
  /** Authorize one invocation and optionally validate its structured input. */
  assert(toolName: string, input?: unknown): void
  /** Execute a Tool only after the same authorization check. */
  call<T>(toolName: string, input: unknown, operation: () => Promise<T>): Promise<T>
  assertResult(toolName: string, output: unknown): void
}

export function validateRoutedTaskPolicy(plan: RoutedTaskPolicy): string[] {
  const errors: string[] = []
  const skill = getSkillDefinition(plan.skill)
  if (!skill) return [`未注册 Skill：${plan.skill}`]

  if (!skill.sideEffects.includes(plan.sideEffect)) {
    errors.push(`Skill ${plan.skill} 不允许副作用 ${plan.sideEffect}`)
  }

  if (!skill.contextScopes.includes(plan.scope)) {
    errors.push(`Skill ${plan.skill} 不允许上下文作用域 ${plan.scope}`)
  }

  if (skill.modelRequirements === 'configured' && !plan.requiresModel) {
    errors.push(`Skill ${plan.skill} 要求模型，但任务未声明模型依赖`)
  }
  if (skill.modelRequirements === 'none' && plan.requiresModel) {
    errors.push(`Skill ${plan.skill} 不应调用模型`)
  }

  if (new Set(plan.allowedTools).size !== plan.allowedTools.length) {
    errors.push('任务允许工具包含重复项')
  }

  for (const toolName of plan.allowedTools) {
    if (!getToolDefinition(toolName)) errors.push(`未注册 Tool：${toolName}`)
    if (!skill.allowedTools.includes(toolName)) errors.push(`Skill ${plan.skill} 未授权 Tool：${toolName}`)
  }

  if (!plan.requiresModel && plan.allowedTools.includes('stream_chat')) {
    errors.push('非模型任务不能获得 stream_chat')
  }
  if (plan.requiresModel && !plan.allowedTools.includes('stream_chat')) {
    errors.push('模型任务必须通过 stream_chat 调用模型')
  }

  if (plan.analysisMode === 'overview' || plan.sourcePolicy === 'metadata-only') {
    for (const toolName of ['read_document', 'chunk_document']) {
      if (plan.allowedTools.includes(toolName)) errors.push(`元数据任务不能获得 ${toolName}`)
    }
  }

  return errors
}

export function assertRoutedTaskPolicy(plan: RoutedTaskPolicy): void {
  const errors = validateRoutedTaskPolicy(plan)
  if (errors.length > 0) throw new Error(`任务能力配置无效：${errors.join('；')}`)
}

/** Fail closed for every individual Tool invocation, not only at route creation. */
function validateToolInput(toolName: string, input: unknown): void {
  const tool = getToolDefinition(toolName)
  if (tool) assertJsonSchema(tool.inputSchema, input, `Tool ${toolName} 输入`)
}

export function assertToolResult(toolName: string, output: unknown): void {
  const tool = getToolDefinition(toolName)
  if (!tool) throw new Error(`未注册 Tool：${toolName}`)
  assertJsonSchema(tool.outputSchema, output, `Tool ${toolName} 输出`)
}

export function assertToolCallAllowed(plan: RoutedTaskPolicy, toolName: string, input?: unknown): void {
  assertRoutedTaskPolicy(plan)
  if (!plan.allowedTools.includes(toolName)) {
    throw new Error(`任务 ${plan.skill} 未授权调用 Tool：${toolName}`)
  }
  const tool = getToolDefinition(toolName)
  if (!tool) throw new Error(`未注册 Tool：${toolName}`)
  if (!tool.sideEffects.includes('read') && !tool.sideEffects.includes(plan.sideEffect)) {
    throw new Error(`Tool ${toolName} 不允许副作用 ${plan.sideEffect}`)
  }
  if (plan.sourcePolicy === 'metadata-only' && ['read_document', 'chunk_document'].includes(toolName)) {
    throw new Error(`来源策略 ${plan.sourcePolicy} 禁止调用 Tool：${toolName}`)
  }
  if (toolName === 'stream_chat' && input && typeof input === 'object' && !Array.isArray(input)) {
    const requested = (input as Record<string, unknown>).sourcePolicy
    const rank: Record<SourcePolicy, number> = { 'metadata-only': 0, 'local-excerpts': 1, 'local-chunks': 2 }
    if (typeof requested === 'string' && requested in rank && rank[requested as SourcePolicy] > rank[plan.sourcePolicy]) {
      throw new Error(`Tool ${toolName} 不能将来源策略从 ${plan.sourcePolicy} 升级为 ${requested}`)
    }
  }
  validateToolInput(toolName, input)
}

export function createToolGateway(plan: RoutedTaskPolicy): ToolGateway {
  return {
    assert(toolName: string, input?: unknown) {
      assertToolCallAllowed(plan, toolName, input)
    },
    async call<T>(toolName: string, input: unknown, operation: () => Promise<T>) {
      assertToolCallAllowed(plan, toolName, input)
      const output = await operation()
      assertToolResult(toolName, output)
      return output
    },
    assertResult(toolName: string, output: unknown) {
      assertToolResult(toolName, output)
    },
  }
}
