import { getSkillDefinition, getToolDefinition } from './registry'
import type { SkillId } from './registry'
import type { AnalysisMode, SourcePolicy } from '../types'
import type { TaskSideEffect } from './intent'
import type { TaskScope } from './intent'

export interface RoutedTaskPolicy {
  skill: SkillId
  allowedTools: string[]
  sideEffect: TaskSideEffect
  scope: TaskScope
  requiresModel: boolean
  analysisMode: AnalysisMode | null
  sourcePolicy: SourcePolicy
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
