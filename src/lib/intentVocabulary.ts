import type { TaskIntent } from './intent'
import type { AgentId, SkillId } from './registry'

// Canonical intent-router vocabulary. The JSON schema, the runtime validators
// and the evaluation harness all read from these lists so they cannot drift.

export const TASK_INTENTS = [
  'structure-segmentation', 'structure-enhancement', 'document-analysis', 'document-revision',
  'character-analysis', 'continuity-review', 'workspace-analysis', 'general-chat',
] as const satisfies readonly TaskIntent[]

export const AGENT_IDS = [
  'GeneralConversation', 'StructureSegmentation', 'StoryDeconstruction', 'RevisionEditor', 'ContinuityReviewer',
] as const satisfies readonly AgentId[]

export const SKILL_IDS = [
  'general-conversation', 'chapter-boundary-detect', 'structure-enhancement', 'long-text-analysis',
  'character-arc-extraction', 'document-revision', 'continuity-review', 'document-overview',
  'workspace-overview', 'workspace-focused-analysis', 'workspace-analysis',
] as const satisfies readonly SkillId[]

export const intentVocabulary: ReadonlySet<TaskIntent> = new Set(TASK_INTENTS)
export const agentVocabulary: ReadonlySet<AgentId> = new Set(AGENT_IDS)
export const skillVocabulary: ReadonlySet<SkillId> = new Set(SKILL_IDS)
