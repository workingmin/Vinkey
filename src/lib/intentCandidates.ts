import type { AgentId, SkillId } from './registry'
import type { TaskIntent } from './intent'

export const INTENT_ROUTER_CANDIDATE_OUTPUT_VERSION = 'intent-router-output-2'

export const INTENT_ROUTER_CANDIDATE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          intent: { type: 'string', enum: ['structure-segmentation', 'structure-enhancement', 'document-analysis', 'document-revision', 'character-analysis', 'continuity-review', 'workspace-analysis', 'general-chat'] },
          agent: { type: 'string', enum: ['GeneralConversation', 'StructureSegmentation', 'StoryDeconstruction', 'RevisionEditor', 'ContinuityReviewer'] },
          skill: { type: 'string', enum: ['general-conversation', 'chapter-boundary-detect', 'structure-enhancement', 'long-text-analysis', 'character-arc-extraction', 'document-revision', 'continuity-review', 'document-overview', 'workspace-overview', 'workspace-focused-analysis', 'workspace-analysis'] },
          modelScore: { type: 'number', minimum: 0, maximum: 1 },
          reasonCodes: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 80 } },
        },
        required: ['intent', 'agent', 'skill', 'modelScore', 'reasonCodes'],
      },
    },
    needsClarification: { type: 'boolean' },
    missingFacts: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 80 } },
  },
  required: ['candidates', 'needsClarification', 'missingFacts'],
} as const

export interface IntentCandidate {
  intent: TaskIntent
  agent: AgentId
  skill: SkillId
  modelScore: number
  reasonCodes: string[]
}

export interface IntentCandidateOutput {
  candidates: IntentCandidate[]
  needsClarification: boolean
  missingFacts: string[]
}

const intents = new Set<TaskIntent>([
  'structure-segmentation', 'structure-enhancement', 'document-analysis', 'document-revision',
  'character-analysis', 'continuity-review', 'workspace-analysis', 'general-chat',
])
const agents = new Set<AgentId>([
  'GeneralConversation', 'StructureSegmentation', 'StoryDeconstruction', 'RevisionEditor', 'ContinuityReviewer',
])
const skills = new Set<SkillId>([
  'general-conversation', 'chapter-boundary-detect', 'structure-enhancement', 'long-text-analysis',
  'character-arc-extraction', 'document-revision', 'continuity-review', 'document-overview',
  'workspace-overview', 'workspace-focused-analysis', 'workspace-analysis',
])

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
}

function parseJson(output: string): unknown {
  try { return JSON.parse(output.trim()) }
  catch { throw new Error('模型输出不是有效 JSON。') }
}

export function parseIntentCandidateOutput(output: string): IntentCandidateOutput {
  const value = parseJson(output)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模型候选输出必须是 JSON 对象。')
  const record = value as Record<string, unknown>
  if (!exactKeys(record, ['candidates', 'needsClarification', 'missingFacts'])) throw new Error('模型候选输出字段与分类合同不一致。')
  if (!Array.isArray(record.candidates) || record.candidates.length < 1 || record.candidates.length > 3) throw new Error('模型候选数量必须为 1 到 3。')
  if (typeof record.needsClarification !== 'boolean') throw new Error('模型候选 needsClarification 必须是布尔值。')
  if (!Array.isArray(record.missingFacts) || record.missingFacts.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error('模型候选 missingFacts 必须是非空字符串数组。')
  }

  const seen = new Set<string>()
  const candidates = record.candidates.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`模型候选 ${index + 1} 必须是对象。`)
    const candidate = item as Record<string, unknown>
    if (!exactKeys(candidate, ['intent', 'agent', 'skill', 'modelScore', 'reasonCodes'])) throw new Error(`模型候选 ${index + 1} 字段与分类合同不一致。`)
    if (!intents.has(candidate.intent as TaskIntent) || !agents.has(candidate.agent as AgentId) || !skills.has(candidate.skill as SkillId)) {
      throw new Error(`模型候选 ${index + 1} 包含未注册的分类值。`)
    }
    const routeKey = `${candidate.intent}::${candidate.skill}`
    if (seen.has(routeKey)) throw new Error(`模型候选包含重复 Intent/Skill 路由：${candidate.intent}/${candidate.skill}。`)
    seen.add(routeKey)
    if (typeof candidate.modelScore !== 'number' || !Number.isFinite(candidate.modelScore) || candidate.modelScore < 0 || candidate.modelScore > 1) {
      throw new Error(`模型候选 ${index + 1} 的 modelScore 必须在 0 到 1 之间。`)
    }
    if (!Array.isArray(candidate.reasonCodes) || candidate.reasonCodes.length < 1 || candidate.reasonCodes.some((reason) => typeof reason !== 'string' || reason.trim().length === 0)) {
      throw new Error(`模型候选 ${index + 1} 的 reasonCodes 必须是非空字符串数组。`)
    }
    return {
      intent: candidate.intent as TaskIntent,
      agent: candidate.agent as AgentId,
      skill: candidate.skill as SkillId,
      modelScore: candidate.modelScore,
      reasonCodes: [...candidate.reasonCodes] as string[],
    }
  })
  return {
    candidates,
    needsClarification: record.needsClarification,
    missingFacts: [...new Set(record.missingFacts as string[])],
  }
}

export function isIntentCandidateOutput(output: unknown): output is IntentCandidateOutput {
  return Boolean(output && typeof output === 'object' && !Array.isArray(output)
    && Array.isArray((output as IntentCandidateOutput).candidates)
    && typeof (output as IntentCandidateOutput).needsClarification === 'boolean'
    && Array.isArray((output as IntentCandidateOutput).missingFacts))
}
