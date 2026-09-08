import type { ModelProfile, ModelProfileInput } from '../types'
import { isLoopbackModelEndpoint } from './modelPrivacy'
import type { TaskPlan } from './intent'

export type ModelGroupRole = 'efficient' | 'general'
export type ModelAssignments = Partial<Record<ModelGroupRole, string | null>>

export function readModelAssignments(value: string | null): ModelAssignments {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter(([key, id]) => (key === 'efficient' || key === 'general') && (id === null || typeof id === 'string')))
  } catch { return {} }
}

export function reconcileModelAssignments(assignments: ModelAssignments, profiles: ModelProfile[], activeId: string | null): ModelAssignments {
  const result = { ...assignments }
  for (const role of ['efficient', 'general'] as const) {
    if (result[role] !== undefined) {
      if (result[role] && !profiles.some((profile) => profile.id === result[role])) result[role] = null
      continue
    }
    const recommended = MINIMUM_OLLAMA_MODEL_GROUP.members.find((member) => member.role === role)!
    result[role] = profiles.find((profile) => isSameOllamaModel(profile.model, recommended.model))?.id
      ?? (role === 'general' ? profiles.find((profile) => profile.id === activeId)?.id ?? profiles[0]?.id : undefined)
  }
  return result
}

export function modelRoleForTask(task: Pick<TaskPlan, 'intent'>): ModelGroupRole {
  return ['document-analysis', 'character-analysis', 'workspace-analysis', 'structure-enhancement'].includes(task.intent) ? 'efficient' : 'general'
}

export function recommendModel(models: string[], role: ModelGroupRole): string | null {
  const preferred = MINIMUM_OLLAMA_MODEL_GROUP.members.find((member) => member.role === role)!
  const exact = models.find((model) => isSameOllamaModel(model, preferred.model))
  if (exact) return exact
  const chatModels = models.filter((model) => !/embed|rerank|whisper|tts|dall-e|moderation/i.test(model))
  const efficient = /mini|nano|flash|haiku|small|[1378]b\b/i
  return chatModels.find((model) => role === 'efficient' ? efficient.test(model) : !efficient.test(model)) ?? chatModels[0] ?? null
}

export interface ModelGroupMember {
  id: string
  name: string
  model: string
  role: ModelGroupRole
  roleLabel: string
  description: string
  size: string
}

export interface ModelGroupDefinition {
  id: string
  name: string
  description: string
  contextWindow: number
  members: ModelGroupMember[]
}

export const MINIMUM_OLLAMA_MODEL_GROUP: ModelGroupDefinition = {
  id: 'minimum-zh-writing',
  name: '最低配置 · 中文创作',
  description: '面向 16 GB 内存设备的单模型按需切换组',
  contextWindow: 16_384,
  members: [
    { id: 'minicpm41-8b', name: '轻量 · MiniCPM4.1 8B', model: 'openbmb/minicpm4.1:latest', role: 'efficient', roleLabel: '轻量高效', description: '提取、摘要、分块分析与快速草稿', size: '5.0 GB' },
    { id: 'qwen3-8b', name: '综合 · Qwen3 8B', model: 'qwen3:8b', role: 'general', roleLabel: '综合创作', description: '基准、主笔、润色、对白与审校', size: '5.2 GB' },
  ],
}

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase()
}

export function isSameOllamaModel(left: string, right: string): boolean {
  const first = normalizeModelName(left)
  const second = normalizeModelName(right)
  if (first === second) return true
  return `${first}:latest` === second || first === `${second}:latest`
}

export function isOllamaModelInstalled(installedModels: string[], model: string): boolean {
  return installedModels.some((installed) => isSameOllamaModel(installed, model))
}

export function createGroupProfileInput(member: ModelGroupMember, contextWindow = MINIMUM_OLLAMA_MODEL_GROUP.contextWindow): ModelProfileInput {
  return {
    id: `group-${MINIMUM_OLLAMA_MODEL_GROUP.id}-${member.id}`,
    name: member.name,
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: member.model,
    contextWindow,
  }
}

export function isLocalOllamaProfile(profile: Pick<ModelProfile, 'kind' | 'baseUrl'> | null | undefined): boolean {
  return Boolean(profile && profile.kind === 'ollama' && isLoopbackModelEndpoint(profile.baseUrl))
}

export function shouldStopOllamaBeforeSwitch(previous: ModelProfile | null | undefined, next: ModelProfile | null | undefined, enabled = true): boolean {
  if (!enabled || !previous || !next || !isLocalOllamaProfile(previous)) return false
  return !isSameOllamaModel(previous.model, next.model) || previous.baseUrl !== next.baseUrl
}
