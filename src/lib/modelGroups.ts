import type { ModelProfile, ModelProfileInput } from '../types'
import { isLoopbackModelEndpoint } from './modelPrivacy'

export type ModelGroupRole = 'efficient' | 'general'

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
