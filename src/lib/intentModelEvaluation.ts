import { getTaskCapabilities } from './registry'
import type { AgentId, SkillId } from './registry'
import { scoreIntentLexicon } from './intent'
import type { DocumentSelectionMode, IntentLexiconEvidence, TaskIntent, TaskScope } from './intent'
import {
  INTENT_ROUTER_CANDIDATE_JSON_SCHEMA,
  parseIntentCandidateOutput,
  type IntentCandidate,
  type IntentCandidateOutput,
} from './intentCandidates'
import type { ChatRequest, ChatStreamEvent, ModelConnection, ModelProfile } from '../types'
import { isLoopbackModelEndpoint } from './modelPrivacy'

export const INTENT_MODEL_EVALUATION_SUITE_VERSION = 'intent-router-eval-3'
export const INTENT_ROUTER_PROMPT_VERSION = 'intent-router-prompt-4'
export const INTENT_CANDIDATE_MARGIN_THRESHOLD = 0.12

export const INTENT_CLASSIFICATION_JSON_SCHEMA = INTENT_ROUTER_CANDIDATE_JSON_SCHEMA

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
  effectivePrediction?: IntentClassificationPrediction | null
  effectiveMatchedFields?: Array<keyof IntentClassificationPrediction>
  effectiveExactMatch?: boolean
  resolutionSource?: 'model' | 'lexicon' | 'facts' | 'lexicon+facts' | 'registry' | 'candidate+lexicon' | 'invalid-model'
  resolutionEvidence?: IntentLexiconEvidence[]
  candidateOutput?: IntentCandidateOutput | null
  candidateMode?: 'candidate' | 'legacy-single'
  candidateDecision?: 'route' | 'clarify' | 'reject'
  candidateMargin?: number | null
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
  candidateParsedCount: number
  candidateParseRate: number
  candidateTop2Recall: number
  clarificationCount: number
  clarificationRate: number
  passed: boolean
}

export type IntentClassificationEvaluationMode = 'raw' | 'effective'

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
        '只返回一个 JSON 对象，不要 Markdown 或解释。输出 candidates（最多 3 个）及 needsClarification、missingFacts，不要输出其他字段。',
        `intent 可选值：${[...intents].join(', ')}`,
        `agent 可选值：${[...agents].join(', ')}`,
        `skill 可选值：${[...skills].join(', ')}`,
        '每个 candidate 必须包含 intent、agent、skill、modelScore（0 到 1 的排序分数）和 reasonCodes（词元或边界代码数组）。',
        'modelScore 不是校准概率，只用于候选排序；不要伪造精确概率。',
        '',
        '请严格按以下顺序判断：',
        '1. 只能从给定枚举中选择，最多输出 3 个不同 Intent；无法区分时保留前两项并设置 needsClarification=true。',
        '2. documentSelection 不需要输出，由后置层根据 targets 数量计算：0=none，1=single，2 个及以上=multiple。',
        '3. scope 不需要输出，由后置层结合 Intent 和 targets 计算；普通闲聊即使带附件也不能读取正文；不要把 document 目标写成 current-document。',
        '4. agent 必须与 skill 一致：general-conversation=>GeneralConversation；chapter-boundary-detect=>StructureSegmentation；long-text-analysis/character-arc-extraction/workspace-*=>StoryDeconstruction；document-revision=>RevisionEditor；continuity-review=>ContinuityReviewer。',
        '',
        '重点词元到分类的映射（仅作为边界提示，仍需结合完整指令）：',
        ...INTENT_ROUTER_TOKEN_HINTS,
        '',
        '四个边界示例（只示意 candidates）：',
        '{"instruction":"分析这个文档的故事主线","targets":[{"id":"a.txt","kind":"document"}]} => candidates:[{intent:"document-analysis",skill:"long-text-analysis"}]',
        '{"instruction":"给我三个写作灵感","targets":[{"id":"a.txt","kind":"document"}]} => candidates:[{intent:"general-chat",skill:"general-conversation"}]',
        '{"instruction":"当前项目有哪些文件","targets":[]} => candidates:[{intent:"workspace-analysis",skill:"workspace-overview"}]',
        '{"instruction":"比较所选文档的人物塑造和叙事视角","targets":[{"id":"a.txt","kind":"document"},{"id":"b.txt","kind":"document"}]} => candidates:[{intent:"document-analysis",skill:"long-text-analysis"}]',
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

function documentSelectionForTargets(targets: IntentClassificationEvaluationCase['targets']): DocumentSelectionMode {
  const count = targets.length
  return count > 1 ? 'multiple' : count === 1 ? 'single' : 'none'
}

function scopeForIntent(intent: TaskIntent, targets: IntentClassificationEvaluationCase['targets']): TaskScope {
  if (intent === 'general-chat') return 'conversation'
  if (intent === 'workspace-analysis') return 'workspace'
  return targets.length > 0 ? 'selected-documents' : 'conversation'
}

function candidateToPrediction(candidate: IntentCandidate, testCase: IntentClassificationEvaluationCase, canonicalize = false): IntentClassificationPrediction {
  const capabilities = getTaskCapabilities(candidate.intent)
  const compatibleSkills: Partial<Record<TaskIntent, SkillId[]>> = {
    'document-analysis': ['document-overview', 'long-text-analysis'],
    'character-analysis': ['document-overview', 'character-arc-extraction'],
    'workspace-analysis': ['workspace-overview', 'workspace-focused-analysis', 'workspace-analysis'],
  }
  const skill = canonicalize
    ? compatibleSkills[candidate.intent]?.includes(candidate.skill) ? candidate.skill : capabilities.skill
    : candidate.skill
  return {
    intent: candidate.intent,
    agent: canonicalize ? capabilities.agent : candidate.agent,
    skill,
    scope: scopeForIntent(candidate.intent, testCase.targets),
    documentSelection: documentSelectionForTargets(testCase.targets),
  }
}

function parseEvaluationOutput(testCase: IntentClassificationEvaluationCase, output: string): {
  prediction: IntentClassificationPrediction
  candidateOutput: IntentCandidateOutput
  legacy: boolean
} {
  try {
    const candidateOutput = parseIntentCandidateOutput(output)
    const sorted = [...candidateOutput.candidates].sort((left, right) => right.modelScore - left.modelScore)
    return { prediction: candidateToPrediction(sorted[0], testCase), candidateOutput, legacy: false }
  } catch (candidateError) {
    try {
      const prediction = parseIntentClassificationPrediction(output)
      return {
        prediction,
        candidateOutput: {
          candidates: [{ ...prediction, modelScore: 1, reasonCodes: ['legacy-single'] }],
          needsClarification: false,
          missingFacts: [],
        },
        legacy: true,
      }
    } catch (legacyError) {
      throw legacyError instanceof Error ? legacyError : candidateError
    }
  }
}

function resolveIntentCandidateOutput(
  testCase: IntentClassificationEvaluationCase,
  candidateOutput: IntentCandidateOutput,
): {
  prediction: IntentClassificationPrediction
  source: 'model' | 'lexicon' | 'facts' | 'lexicon+facts' | 'registry' | 'candidate+lexicon'
  evidence: IntentLexiconEvidence[]
  decision: 'route' | 'clarify' | 'reject'
  margin: number | null
} {
  const sorted = [...candidateOutput.candidates].sort((left, right) => right.modelScore - left.modelScore)
  const top = sorted[0]
  const second = sorted[1]
  const margin = second ? top.modelScore - second.modelScore : null
  const lexical = scoreIntentLexicon(testCase.instruction)
  const topPrediction = candidateToPrediction(top, testCase, true)
  const lowMargin = margin !== null && margin < INTENT_CANDIDATE_MARGIN_THRESHOLD
  if (candidateOutput.needsClarification || candidateOutput.missingFacts.length > 0 || lowMargin) {
    return { prediction: topPrediction, source: 'model', evidence: lexical.evidence, decision: 'clarify', margin }
  }

  let selected = top
  let source: 'model' | 'lexicon' | 'facts' | 'lexicon+facts' | 'registry' | 'candidate+lexicon' = 'model'
  if (lexical.intent && lexical.confidence !== 'low' && (lexical.intent === 'character-analysis' || lexical.intent === 'document-analysis')) {
    const lexicalCandidate = sorted.find((candidate) => candidate.intent === lexical.intent)
    const lexicalCloseEnough = !lexicalCandidate || lexicalCandidate.modelScore >= top.modelScore - 0.25
    if (lexicalCloseEnough && lexical.intent !== top.intent) {
      selected = lexicalCandidate ?? {
        intent: lexical.intent,
        agent: getTaskCapabilities(lexical.intent).agent,
        skill: getTaskCapabilities(lexical.intent).skill,
        modelScore: top.modelScore,
        reasonCodes: lexical.evidence.map((item) => item.token),
      }
      source = 'lexicon'
    }
  }
  const rawSelectedPrediction = candidateToPrediction(selected, testCase)
  const prediction = candidateToPrediction(selected, testCase, true)
  const registryChanged = rawSelectedPrediction.agent !== prediction.agent || rawSelectedPrediction.skill !== prediction.skill
  if (registryChanged) source = source === 'lexicon' ? 'candidate+lexicon' : 'registry'
  const expectedSelection = documentSelectionForTargets(testCase.targets)
  const expectedScope = scopeForIntent(prediction.intent, testCase.targets)
  if (prediction.documentSelection !== expectedSelection || prediction.scope !== expectedScope) source = source === 'lexicon' ? 'lexicon+facts' : 'facts'
  return { prediction, source, evidence: lexical.evidence, decision: 'route', margin }
}

export function evaluateIntentClassificationOutput(
  testCase: IntentClassificationEvaluationCase,
  output: string,
): IntentClassificationCaseResult {
  try {
    const parsed = parseEvaluationOutput(testCase, output)
    const prediction = parsed.prediction
    const matchedFields = predictionFields.filter((field) => prediction[field] === testCase.expected[field])
    const resolution = parsed.legacy
      ? { ...resolveIntentClassificationPrediction(testCase, prediction), decision: 'route' as const, margin: null }
      : resolveIntentCandidateOutput(testCase, parsed.candidateOutput)
    const effectiveMatchedFields = predictionFields.filter((field) => resolution.prediction[field] === testCase.expected[field])
    return {
      caseId: testCase.id,
      output,
      prediction,
      matchedFields,
      exactMatch: matchedFields.length === predictionFields.length,
      error: null,
      effectivePrediction: resolution.prediction,
      effectiveMatchedFields,
      effectiveExactMatch: effectiveMatchedFields.length === predictionFields.length,
      resolutionSource: resolution.source,
      resolutionEvidence: resolution.evidence,
      candidateOutput: parsed.candidateOutput,
      candidateMode: parsed.legacy ? 'legacy-single' : 'candidate',
      candidateDecision: resolution.decision,
      candidateMargin: resolution.margin,
    }
  } catch (cause) {
    return {
      caseId: testCase.id,
      output,
      prediction: null,
      matchedFields: [],
      exactMatch: false,
      error: cause instanceof Error ? cause.message : String(cause),
      effectivePrediction: null,
      effectiveMatchedFields: [],
      effectiveExactMatch: false,
      resolutionSource: 'invalid-model',
      resolutionEvidence: [],
      candidateOutput: null,
      candidateMode: undefined,
      candidateDecision: 'reject',
      candidateMargin: null,
    }
  }
}

export function resolveIntentClassificationPrediction(
  testCase: IntentClassificationEvaluationCase,
  prediction: IntentClassificationPrediction,
): {
  prediction: IntentClassificationPrediction
  source: 'model' | 'lexicon' | 'facts' | 'lexicon+facts'
  evidence: IntentLexiconEvidence[]
} {
  const resolved = { ...prediction }
  const changedByLexicon: Array<keyof IntentClassificationPrediction> = []
  const changedByFacts: Array<keyof IntentClassificationPrediction> = []
  const lexical = scoreIntentLexicon(testCase.instruction)
  if (lexical.intent && lexical.confidence !== 'low' && (lexical.intent === 'character-analysis' || lexical.intent === 'document-analysis')) {
    const capabilities = getTaskCapabilities(lexical.intent)
    if (resolved.intent !== lexical.intent) { resolved.intent = lexical.intent; changedByLexicon.push('intent') }
    if (resolved.agent !== capabilities.agent) { resolved.agent = capabilities.agent; changedByLexicon.push('agent') }
    if (resolved.skill !== capabilities.skill) { resolved.skill = capabilities.skill; changedByLexicon.push('skill') }
  }

  const targetCount = testCase.targets.length
  const documentSelection: DocumentSelectionMode = targetCount > 1 ? 'multiple' : targetCount === 1 ? 'single' : 'none'
  if (resolved.documentSelection !== documentSelection) {
    resolved.documentSelection = documentSelection
    changedByFacts.push('documentSelection')
  }
  const scope: TaskScope = resolved.intent === 'general-chat'
    ? 'conversation'
    : resolved.intent === 'workspace-analysis'
      ? 'workspace'
      : targetCount > 0 ? 'selected-documents' : resolved.scope
  if (resolved.scope !== scope) {
    resolved.scope = scope
    changedByFacts.push('scope')
  }
  const source = changedByLexicon.length > 0 && changedByFacts.length > 0
    ? 'lexicon+facts'
    : changedByLexicon.length > 0
      ? 'lexicon'
      : changedByFacts.length > 0 ? 'facts' : 'model'
  return { prediction: resolved, source, evidence: lexical.evidence }
}

export function summarizeIntentClassificationEvaluation(
  profile: Pick<ModelProfile, 'id' | 'model'>,
  results: IntentClassificationCaseResult[],
  cases: IntentClassificationEvaluationCase[] = INTENT_CLASSIFICATION_EVALUATION_CASES,
  mode: IntentClassificationEvaluationMode = 'raw',
): IntentClassificationEvaluationSummary {
  const caseIds = new Set(cases.map((item) => item.id))
  if (cases.length === 0 || caseIds.size !== cases.length || results.length !== cases.length || results.some((item) => !caseIds.has(item.caseId))
    || new Set(results.map((item) => item.caseId)).size !== results.length) {
    throw new Error('IntentRouter 模型评测必须为每个版本化用例提供且只提供一条结果。')
  }
  const matchedFields = (item: IntentClassificationCaseResult) => mode === 'effective' ? item.effectiveMatchedFields ?? item.matchedFields : item.matchedFields
  const exactMatch = (item: IntentClassificationCaseResult) => mode === 'effective' ? item.effectiveExactMatch ?? item.exactMatch : item.exactMatch
  const ratio = (field: keyof IntentClassificationPrediction) => results.filter((item) => matchedFields(item).includes(field)).length / cases.length
  const exactMatchRate = results.filter(exactMatch).length / cases.length
  const candidateParsedCount = results.filter((item) => item.candidateMode === 'candidate').length
  const candidateTop2Recall = results.filter((item) => {
    if (item.candidateMode !== 'candidate') return false
    const expected = cases.find((testCase) => testCase.id === item.caseId)?.expected.intent
    return Boolean(expected && item.candidateOutput?.candidates
      .slice().sort((left, right) => right.modelScore - left.modelScore).slice(0, 2)
      .some((candidate) => candidate.intent === expected))
  }).length / cases.length
  const clarificationCount = results.filter((item) => item.candidateDecision === 'clarify').length
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
    candidateParsedCount,
    candidateParseRate: candidateParsedCount / cases.length,
    candidateTop2Recall,
    clarificationCount,
    clarificationRate: clarificationCount / cases.length,
    passed: exactMatchRate === 1 && (mode === 'raw' || candidateParsedCount === cases.length),
  }
}

export async function runConfiguredIntentModelEvaluation(
  preferredProfileId: string | null | undefined,
  dependencies: IntentModelEvaluationDependencies,
  cases: IntentClassificationEvaluationCase[] = INTENT_CLASSIFICATION_EVALUATION_CASES,
): Promise<{ model: ConfiguredIntentModel; results: IntentClassificationCaseResult[]; summary: IntentClassificationEvaluationSummary; effectiveSummary: IntentClassificationEvaluationSummary }> {
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
  return {
    model,
    results,
    summary: summarizeIntentClassificationEvaluation(model.profile, results, cases, 'raw'),
    effectiveSummary: summarizeIntentClassificationEvaluation(model.profile, results, cases, 'effective'),
  }
}
