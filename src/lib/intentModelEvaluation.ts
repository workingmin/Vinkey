import type { AgentId, SkillId } from './registry'
import type { DocumentSelectionMode, TaskIntent, TaskScope } from './intent'
import type { ChatRequest, ChatStreamEvent, ModelConnection, ModelProfile } from '../types'
import { isLoopbackModelEndpoint } from './modelPrivacy'

export const INTENT_MODEL_EVALUATION_SUITE_VERSION = 'intent-model-eval-2'
export const INTENT_ROUTER_PROMPT_VERSION = 'intent-router-prompt-3'

export const INTENT_CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['structure-segmentation', 'structure-enhancement', 'document-analysis', 'document-revision', 'character-analysis', 'continuity-review', 'workspace-analysis', 'general-chat'] },
    agent: { type: 'string', enum: ['GeneralConversation', 'StructureSegmentation', 'StoryDeconstruction', 'RevisionEditor', 'ContinuityReviewer'] },
    skill: { type: 'string', enum: ['general-conversation', 'chapter-boundary-detect', 'structure-enhancement', 'long-text-analysis', 'character-arc-extraction', 'document-revision', 'continuity-review', 'document-overview', 'workspace-overview', 'workspace-focused-analysis', 'workspace-analysis'] },
    scope: { type: 'string', enum: ['editor-selection', 'selected-documents', 'current-document', 'workspace', 'conversation'] },
    documentSelection: { type: 'string', enum: ['none', 'single', 'multiple'] },
  },
  required: ['intent', 'agent', 'skill', 'scope', 'documentSelection'],
} as const

export interface IntentClassificationPrediction {
  intent: TaskIntent
  agent: AgentId
  skill: SkillId
  scope: TaskScope
  documentSelection: DocumentSelectionMode
}

export interface IntentClassificationEvaluationCase {
  id: string
  instruction: string
  targets: Array<{ id: string; kind: 'document' | 'selection' | 'chapter' | 'work' }>
  expected: IntentClassificationPrediction
}

export interface IntentClassificationCaseResult {
  caseId: string
  output: string
  prediction: IntentClassificationPrediction | null
  matchedFields: Array<keyof IntentClassificationPrediction>
  exactMatch: boolean
  error: string | null
  durationMs?: number
}

export interface IntentClassificationEvaluationSummary {
  suiteVersion: typeof INTENT_MODEL_EVALUATION_SUITE_VERSION
  profileId: string
  model: string
  caseCount: number
  parsedCount: number
  exactMatchRate: number
  intentAccuracy: number
  agentAccuracy: number
  skillAccuracy: number
  scopeAccuracy: number
  documentSelectionAccuracy: number
  passed: boolean
}

export interface ConfiguredIntentModel {
  profile: ModelProfile
  connection: ModelConnection
}

export interface IntentModelEvaluationDependencies {
  listProfiles: () => Promise<ModelProfile[]>
  listConnections: () => Promise<ModelConnection[]>
  stream: (request: ChatRequest, onEvent: (event: ChatStreamEvent) => void) => Promise<void>
  getActiveProfileId: () => string | null | Promise<string | null>
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
const scopes = new Set<TaskScope>(['editor-selection', 'selected-documents', 'current-document', 'workspace', 'conversation'])
const documentSelections = new Set<DocumentSelectionMode>(['none', 'single', 'multiple'])
const predictionFields: Array<keyof IntentClassificationPrediction> = [
  'intent', 'agent', 'skill', 'scope', 'documentSelection',
]

export const INTENT_CLASSIFICATION_EVALUATION_CASES: IntentClassificationEvaluationCase[] = [
  {
    id: 'no-file-general-chat', instruction: '帮我想三个标题', targets: [],
    expected: { intent: 'general-chat', agent: 'GeneralConversation', skill: 'general-conversation', scope: 'conversation', documentSelection: 'none' },
  },
  {
    id: 'single-file-analysis', instruction: '分析这个文档的故事主线', targets: [{ id: '短篇/孔乙己.txt', kind: 'document' }],
    expected: { intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', scope: 'selected-documents', documentSelection: 'single' },
  },
  {
    id: 'single-file-character-analysis', instruction: '分析阿Q与赵太爷之间的人物关系', targets: [{ id: '中篇/阿Q正传.txt', kind: 'document' }],
    expected: { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', scope: 'selected-documents', documentSelection: 'single' },
  },
  {
    id: 'multi-file-continuity-review', instruction: '检查这几章有没有前后矛盾', targets: [
      { id: '短篇/狂人日记.txt', kind: 'document' }, { id: '短篇/故乡.txt', kind: 'document' },
    ],
    expected: { intent: 'continuity-review', agent: 'ContinuityReviewer', skill: 'continuity-review', scope: 'selected-documents', documentSelection: 'multiple' },
  },
  {
    id: 'single-file-revision', instruction: '根据这个文件改写一版', targets: [{ id: '短篇/故乡.txt', kind: 'document' }],
    expected: { intent: 'document-revision', agent: 'RevisionEditor', skill: 'document-revision', scope: 'selected-documents', documentSelection: 'single' },
  },
  {
    id: 'multi-file-revision', instruction: '统一润色所选文件', targets: [
      { id: '短篇/孔乙己.txt', kind: 'document' }, { id: '短篇/狂人日记.txt', kind: 'document' }, { id: '短篇/故乡.txt', kind: 'document' },
    ],
    expected: { intent: 'document-revision', agent: 'RevisionEditor', skill: 'document-revision', scope: 'selected-documents', documentSelection: 'multiple' },
  },
  {
    id: 'single-long-file-analysis', instruction: '完整分析这篇小说的人物命运和情节结构，不要遗漏', targets: [{ id: '中篇/阿Q正传.txt', kind: 'document' }],
    expected: { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', scope: 'selected-documents', documentSelection: 'single' },
  },
  {
    id: 'multi-file-comparison', instruction: '比较所选文档的人物塑造和叙事视角', targets: [
      { id: '短篇/孔乙己.txt', kind: 'document' }, { id: '短篇/狂人日记.txt', kind: 'document' }, { id: '中篇/阿Q正传.txt', kind: 'document' },
    ],
    expected: { intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', scope: 'selected-documents', documentSelection: 'multiple' },
  },
  {
    id: 'attached-file-unrelated-chat', instruction: '给我三个适合雨天写作的灵感', targets: [{ id: '短篇/故乡.txt', kind: 'document' }],
    expected: { intent: 'general-chat', agent: 'GeneralConversation', skill: 'general-conversation', scope: 'conversation', documentSelection: 'single' },
  },
  {
    id: 'single-file-structure-segmentation', instruction: '拆分章节和场景', targets: [{ id: '中篇/阿Q正传.txt', kind: 'document' }],
    expected: { intent: 'structure-segmentation', agent: 'StructureSegmentation', skill: 'chapter-boundary-detect', scope: 'selected-documents', documentSelection: 'single' },
  },
  {
    id: 'workspace-overview', instruction: '当前项目有哪些文件', targets: [],
    expected: { intent: 'workspace-analysis', agent: 'StoryDeconstruction', skill: 'workspace-overview', scope: 'workspace', documentSelection: 'none' },
  },
  {
    id: 'workspace-deep-analysis', instruction: '详细分析这个项目的人物关系', targets: [],
    expected: { intent: 'workspace-analysis', agent: 'StoryDeconstruction', skill: 'workspace-analysis', scope: 'workspace', documentSelection: 'none' },
  },
]

export const INTENT_ROUTER_TOKEN_HINTS = [
  '故事主线、情节结构、叙事视角、整体概览、通读分析 => intent=document-analysis, skill=long-text-analysis。',
  '人物关系、人物命运、角色关系、角色弧光 => intent=character-analysis, skill=character-arc-extraction。',
  '比较多份文档的叙事视角或人物塑造，若重点是跨文档整体比较而非单一人物关系 => intent=document-analysis, skill=long-text-analysis。',
  '项目有哪些文件、工作区概览、列出项目内容 => intent=workspace-analysis, skill=workspace-overview。',
  '详细分析项目人物关系、项目级深度分析 => intent=workspace-analysis, skill=workspace-analysis。',
  '仅要求灵感、标题、闲聊，且没有要求使用目标文件 => intent=general-chat, skill=general-conversation。',
]

export async function loadConfiguredIntentModel(
  preferredProfileId: string | null | undefined,
  dependencies: Pick<IntentModelEvaluationDependencies, 'listProfiles' | 'listConnections' | 'getActiveProfileId'>,
): Promise<ConfiguredIntentModel> {
  const [profiles, connections] = await Promise.all([dependencies.listProfiles(), dependencies.listConnections()])
  const selectedId = preferredProfileId ?? await dependencies.getActiveProfileId()
  const profile = selectedId ? profiles.find((item) => item.id === selectedId) : null
  if (!profile) throw new Error('尚未配置可用于 IntentRouter 评测的当前模型。')

  const connectionId = profile.connectionId ?? profile.id
  const connection = connections.find((item) => item.id === connectionId)
  if (!connection) throw new Error(`模型配置 ${profile.id} 缺少关联连接 ${connectionId}。`)
  if (!isLoopbackModelEndpoint(connection.baseUrl)) throw new Error('IntentRouter 本地模型评测只允许使用回环地址。')
  if (profile.kind !== connection.kind || profile.baseUrl !== connection.baseUrl) {
    throw new Error(`模型配置 ${profile.id} 与关联连接 ${connection.id} 不一致。`)
  }
  return { profile, connection }
}

export function buildIntentClassificationMessages(testCase: IntentClassificationEvaluationCase): ChatRequest['messages'] {
  return [
    {
      role: 'user',
      content: [
        `你是 Vinkey IntentRouter 的轻量分类器（提示合同 ${INTENT_ROUTER_PROMPT_VERSION}）。只能根据指令和目标元数据分类，不得读取或假设文件正文。`,
        '只返回一个 JSON 对象，不要 Markdown、解释、置信度或其他字段。字段必须为 intent、agent、skill、scope、documentSelection。',
        `intent 可选值：${[...intents].join(', ')}`,
        `agent 可选值：${[...agents].join(', ')}`,
        `skill 可选值：${[...skills].join(', ')}`,
        `scope 可选值：${[...scopes].join(', ')}`,
        'documentSelection 可选值：none, single, multiple。',
        '',
        '请严格按以下顺序判断：',
        '1. documentSelection 只由 targets 的数量决定：0=none，1=single，2 个及以上=multiple；不要因为语义改变这个字段。',
        '2. targets 为空且指令提到项目、工作区或“当前项目”时，scope=workspace；targets 为空的普通闲聊时，scope=conversation。',
        '3. targets 非空时，若指令明确要求分析、比较、检查、改写或拆分目标文件，scope=selected-documents；只有普通闲聊即使带有附件，scope=conversation。不要把 document 目标写成 current-document。',
        '4. workspace-analysis 必须使用 scope=workspace；general-chat 必须使用 scope=conversation。',
        '5. agent 必须与 skill 一致：general-conversation=>GeneralConversation；chapter-boundary-detect=>StructureSegmentation；long-text-analysis/character-arc-extraction/workspace-*=>StoryDeconstruction；document-revision=>RevisionEditor；continuity-review=>ContinuityReviewer。',
        '',
        '重点词元到分类的映射（仅作为边界提示，仍需结合完整指令）：',
        ...INTENT_ROUTER_TOKEN_HINTS,
        '',
        '四个边界示例：',
        '{"instruction":"分析这个文档的故事主线","targets":[{"id":"a.txt","kind":"document"}]} => document-analysis/StoryDeconstruction/long-text-analysis/selected-documents/single',
        '{"instruction":"给我三个写作灵感","targets":[{"id":"a.txt","kind":"document"}]} => general-chat/GeneralConversation/general-conversation/conversation/single',
        '{"instruction":"当前项目有哪些文件","targets":[]} => workspace-analysis/StoryDeconstruction/workspace-overview/workspace/none',
        '{"instruction":"比较所选文档的人物塑造和叙事视角","targets":[{"id":"a.txt","kind":"document"},{"id":"b.txt","kind":"document"}]} => document-analysis/StoryDeconstruction/long-text-analysis/selected-documents/multiple',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        instruction: testCase.instruction,
        targets: testCase.targets,
      }),
    },
  ]
}

export function parseIntentClassificationPrediction(output: string): IntentClassificationPrediction {
  let value: unknown
  try { value = JSON.parse(output.trim()) }
  catch { throw new Error('模型输出不是有效 JSON。') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模型输出必须是 JSON 对象。')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== predictionFields.length || keys.some((key) => !predictionFields.includes(key as keyof IntentClassificationPrediction))) {
    throw new Error('模型输出字段与分类合同不一致。')
  }
  if (!intents.has(record.intent as TaskIntent)
    || !agents.has(record.agent as AgentId)
    || !skills.has(record.skill as SkillId)
    || !scopes.has(record.scope as TaskScope)
    || !documentSelections.has(record.documentSelection as DocumentSelectionMode)) {
    throw new Error('模型输出包含缺失或未注册的分类值。')
  }
  return {
    intent: record.intent as TaskIntent,
    agent: record.agent as AgentId,
    skill: record.skill as SkillId,
    scope: record.scope as TaskScope,
    documentSelection: record.documentSelection as DocumentSelectionMode,
  }
}

export function evaluateIntentClassificationOutput(
  testCase: IntentClassificationEvaluationCase,
  output: string,
): IntentClassificationCaseResult {
  try {
    const prediction = parseIntentClassificationPrediction(output)
    const matchedFields = predictionFields.filter((field) => prediction[field] === testCase.expected[field])
    return {
      caseId: testCase.id,
      output,
      prediction,
      matchedFields,
      exactMatch: matchedFields.length === predictionFields.length,
      error: null,
    }
  } catch (cause) {
    return {
      caseId: testCase.id,
      output,
      prediction: null,
      matchedFields: [],
      exactMatch: false,
      error: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

export function summarizeIntentClassificationEvaluation(
  profile: Pick<ModelProfile, 'id' | 'model'>,
  results: IntentClassificationCaseResult[],
  cases: IntentClassificationEvaluationCase[] = INTENT_CLASSIFICATION_EVALUATION_CASES,
): IntentClassificationEvaluationSummary {
  const caseIds = new Set(cases.map((item) => item.id))
  if (cases.length === 0 || caseIds.size !== cases.length || results.length !== cases.length || results.some((item) => !caseIds.has(item.caseId))
    || new Set(results.map((item) => item.caseId)).size !== results.length) {
    throw new Error('IntentRouter 模型评测必须为每个版本化用例提供且只提供一条结果。')
  }
  const ratio = (field: keyof IntentClassificationPrediction) => results.filter((item) => item.matchedFields.includes(field)).length / cases.length
  const exactMatchRate = results.filter((item) => item.exactMatch).length / cases.length
  return {
    suiteVersion: INTENT_MODEL_EVALUATION_SUITE_VERSION,
    profileId: profile.id,
    model: profile.model,
    caseCount: cases.length,
    parsedCount: results.filter((item) => item.prediction !== null).length,
    exactMatchRate,
    intentAccuracy: ratio('intent'),
    agentAccuracy: ratio('agent'),
    skillAccuracy: ratio('skill'),
    scopeAccuracy: ratio('scope'),
    documentSelectionAccuracy: ratio('documentSelection'),
    passed: exactMatchRate === 1,
  }
}

export async function runConfiguredIntentModelEvaluation(
  preferredProfileId: string | null | undefined,
  dependencies: IntentModelEvaluationDependencies,
  cases: IntentClassificationEvaluationCase[] = INTENT_CLASSIFICATION_EVALUATION_CASES,
): Promise<{ model: ConfiguredIntentModel; results: IntentClassificationCaseResult[]; summary: IntentClassificationEvaluationSummary }> {
  const model = await loadConfiguredIntentModel(preferredProfileId, dependencies)
  const results: IntentClassificationCaseResult[] = []
  for (const testCase of cases) {
    const startedAt = Date.now()
    let output = ''
    let streamError: string | null = null
    await dependencies.stream({
      requestId: `intent-eval-${testCase.id}`,
      profileId: model.profile.id,
      sourcePolicy: 'metadata-only',
      messages: buildIntentClassificationMessages(testCase),
    }, (event) => {
      if (event.type === 'chunk') output += event.content
      if (event.type === 'error') streamError = event.message
    })
    if (streamError) throw new Error(`IntentRouter 模型评测 ${testCase.id} 调用失败：${streamError}`)
    const result = evaluateIntentClassificationOutput(testCase, output)
    result.durationMs = Date.now() - startedAt
    results.push(result)
  }
  return { model, results, summary: summarizeIntentClassificationEvaluation(model.profile, results, cases) }
}
