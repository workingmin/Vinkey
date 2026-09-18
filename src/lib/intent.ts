import { getTaskCapabilities } from './registry'
import type { AgentId, SkillId } from './registry'
import type { AnalysisCoverage, AnalysisMode, ContextDocument, SourcePolicy } from '../types'
import { estimateTokens } from './context'
import { resolveExecutionStrategy } from './executionStrategy'
import type { ExecutionStrategy } from './executionStrategy'
import { assertRoutedTaskPolicy } from './runtimePolicy'

export type TaskIntent =
  | 'structure-segmentation'
  | 'structure-enhancement'
  | 'document-analysis'
  | 'document-revision'
  | 'character-analysis'
  | 'continuity-review'
  | 'workspace-analysis'
  | 'general-chat'

export type TaskOperation = 'segment' | 'analyze' | 'revise' | 'review' | 'chat'
export type TaskScope = 'editor-selection' | 'selected-documents' | 'current-document' | 'workspace' | 'conversation'
export type TaskSideEffect = 'read' | 'draft' | 'proposal'
export type DocumentAccess = 'none' | 'selected-metadata' | 'selected' | 'workspace-metadata' | 'workspace-focused' | 'workspace'
export type DocumentSelectionMode = 'none' | 'single' | 'multiple'
export type RevisionStrategy = 'direct' | 'bounded' | 'long' | null

export const INTENT_TOKEN_DICTIONARY_VERSION = 'intent-token-dict-1'

export interface IntentLexiconEvidence {
  token: string
  intent: TaskIntent
  weight: number
  match: string
}

export interface IntentLexiconScore {
  intent: TaskIntent | null
  confidence: 'high' | 'medium' | 'low'
  scores: Partial<Record<TaskIntent, number>>
  evidence: IntentLexiconEvidence[]
}

interface IntentLexiconEntry {
  token: string
  intent: TaskIntent
  weight: number
  pattern: RegExp
}

const INTENT_TOKEN_LEXICON: IntentLexiconEntry[] = [
  { token: 'character-relationship', intent: 'character-analysis', weight: 6, pattern: /(?:人物|角色)(?:关系|关联|联系|冲突|合作|感情|亲属关系)/u },
  { token: 'character-fate', intent: 'character-analysis', weight: 5, pattern: /(?:人物|角色)(?:命运|弧光|成长|变化|发展)|角色弧光/u },
  { token: 'character-extraction', intent: 'character-analysis', weight: 4, pattern: /(?:提取|分析|梳理)(?:主要|核心|关键)?人物/u },
  { token: 'cross-document-comparison', intent: 'document-analysis', weight: 7, pattern: /比较.{0,40}(?:人物塑造|叙事视角|故事结构|情节结构)/u },
  { token: 'story-structure', intent: 'document-analysis', weight: 3, pattern: /故事主线|情节结构|叙事视角|故事结构|情节推进|整体概览|通读分析/u },
  { token: 'document-overview', intent: 'document-analysis', weight: 2, pattern: /(?:文档|文件|文本|小说|故事)(?:内容|概要|梗概|摘要|概括|总结)/u },
]

export interface TaskRoutingContext {
  hasContextDocuments?: boolean
  targetDocumentCount?: number
}

export interface TaskPlan {
  intent: TaskIntent
  agent: AgentId
  skill: SkillId
  allowedTools: string[]
  operation: TaskOperation
  scope: TaskScope
  sideEffect: TaskSideEffect
  /** Number category of explicitly selected/mentioned document targets; this does not grant body access. */
  documentSelection: DocumentSelectionMode
  /** Whether the downstream service may read the selected document bodies. */
  documentAccess: DocumentAccess
  analysisMode: AnalysisMode | null
  analysisCoverage: AnalysisCoverage
  sourcePolicy: SourcePolicy
  requiresModel: boolean
  confidence: 'high' | 'medium' | 'low'
  revisionStrategy: RevisionStrategy
  execution: ExecutionStrategy
}

type TaskPlanInput = Omit<TaskPlan, 'agent' | 'skill' | 'allowedTools' | 'execution' | 'documentSelection'>

function withCapabilities(plan: TaskPlanInput, documentSelection: DocumentSelectionMode): TaskPlan {
  const routed = { ...plan, ...getTaskCapabilities(plan.intent, plan.analysisMode) }
  assertRoutedTaskPolicy(routed)
  return { ...routed, documentSelection, execution: resolveExecutionStrategy(routed) }
}

/** Extract file paths from the composer mention syntax without reading bodies. */
export function extractDocumentMentionPaths(value: string): string[] {
  const paths = [...value.matchAll(/(?:^|\s)@([^\s@]+)/gu)].map((match) => match[1]).filter(Boolean)
  return [...new Set(paths)]
}

/** Remove mention tokens before matching natural-language routing keywords. */
export function stripDocumentMentions(value: string): string {
  return value.replace(/(?:^|\s)@[^\s@]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function resolveRoutingContext(value: string, input: boolean | TaskRoutingContext): {
  hasContextDocuments: boolean
  documentSelection: DocumentSelectionMode
} {
  const mentionedCount = extractDocumentMentionPaths(value).length
  const requestedCount = typeof input === 'boolean' ? (input ? 1 : 0) : input.targetDocumentCount ?? 0
  const targetDocumentCount = Math.max(mentionedCount, Number.isFinite(requestedCount) ? Math.max(0, Math.floor(requestedCount)) : 0)
  const hasContextDocuments = targetDocumentCount > 0 || (typeof input === 'boolean' ? input : Boolean(input.hasContextDocuments))
  return {
    hasContextDocuments,
    documentSelection: targetDocumentCount > 1 ? 'multiple' : hasContextDocuments ? 'single' : 'none',
  }
}

function referencesSelectedDocuments(prompt: string): boolean {
  return /(?:根据|参考|基于|结合|按照)[^。！？\n]{0,20}(?:文档|文件|文本|小说|故事|文章)|(?:这|该|此|这个|这篇|所选|当前)(?:篇)?(?:文档|文件|文本|小说|故事|文章)|(?:文档|文件|文本|小说|故事|文章)(?:中|内容|正文)|(?:续写|改写|润色|校对|修改)(?:当前|这|该|此|这个|这篇|所选)?(?:文档|文件|文本|小说|故事|内容|段落|章节|下一章|一版)/u.test(prompt)
}

function asksAboutCharacterRelations(prompt: string): boolean {
  return /(?:人物|角色)?(?:关系|关联|联系|冲突|合作|感情|亲属关系)|(?:之间|和|与).{0,16}(?:是什么关系|有何关系|关系如何|如何联系|是否有关联)/u.test(prompt)
}

function asksForContinuityReview(prompt: string): boolean {
  return /(?:连续性|连贯性|前后矛盾|设定冲突|设定矛盾|时间线冲突|时间矛盾|人物状态冲突|人物状态矛盾|伏笔(?:检查|审校|回收)|吃书|穿帮)/u.test(prompt)
}

function asksForDocumentRevision(prompt: string): boolean {
  return /(?:续写|改写|润色|校对|修改|重写|创作|生成)/u.test(prompt)
}

function asksAboutWorkspace(prompt: string): boolean {
  return /(?:这个|当前|整个|本地|该|本)(?:项目|工作区|工程)|(?:项目|工作区|工程)(?:目录|文件)|(?:项目|工作区|工程)(?:中|里|内|的)?(?:有哪些|包含|有多少|是什么|做什么|讲了什么|介绍|概况|总览|全貌|结构|组成|分析|总结)|(?:分析|介绍|概览|总结|梳理|通读)(?:一下|下)?(?:这个|当前|整个|本地|该|本)?(?:项目|工作区|工程)|(?:全部|所有)(?:文件|文档)(?:内容|概要|摘要|总结|汇总|分析)/u.test(prompt)
}

function asksForWorkspaceMetadata(prompt: string): boolean {
  const metadataQuestion = /(?:目录(?:结构|层级)?|文件(?:清单|列表|数量|类型|格式|分布|结构)|有哪些文件|有多少(?:个)?(?:文件|文档)|多少(?:个)?(?:文件|文档)|扩展名|索引状态|项目规模|工作区状态)/u.test(prompt)
  const semanticQuestion = /(?:文件内容|正文|讲了什么|写了什么|做什么|用途|主题|人物|角色|关系|情节|剧情|主线|支线|设定|世界观|风格|摘要|总结|梗概|伏笔)/u.test(prompt)
  return metadataQuestion && !semanticQuestion
}

function asksForDeepWorkspaceAnalysis(prompt: string): boolean {
  return exhaustiveCoverage(prompt)
    || /(?:深入|深度|详细|全面|系统)(?:地)?(?:分析|研究|梳理|解读)|(?:文件内容|正文|讲了什么|写了什么|主题|人物|角色|关系|情节|剧情|故事结构|主线|支线|设定|世界观|风格|摘要|总结|梗概|伏笔)/u.test(prompt)
}

function exhaustiveCoverage(prompt: string): boolean {
  return /(?:完整|全量|全部|所有|通读|逐章|逐节|逐文件|不要遗漏|不遗漏|一字不漏)/u.test(prompt)
}

function workspaceAnalysisPolicy(prompt: string): Pick<TaskPlan, 'analysisMode' | 'analysisCoverage' | 'sourcePolicy'> {
  if (asksForWorkspaceMetadata(prompt)) {
    return { analysisMode: 'overview', analysisCoverage: 'index-only', sourcePolicy: 'metadata-only' }
  }
  if (asksForDeepWorkspaceAnalysis(prompt)) {
    return { analysisMode: 'deep', analysisCoverage: exhaustiveCoverage(prompt) ? 'exhaustive' : 'targeted', sourcePolicy: 'local-chunks' }
  }
  return { analysisMode: 'focused', analysisCoverage: 'targeted', sourcePolicy: 'local-excerpts' }
}

function deepAnalysisPolicy(prompt: string): Pick<TaskPlan, 'analysisMode' | 'analysisCoverage' | 'sourcePolicy'> {
  return { analysisMode: 'deep', analysisCoverage: exhaustiveCoverage(prompt) ? 'exhaustive' : 'targeted', sourcePolicy: 'local-chunks' }
}

/** Score high-signal semantic tokens without allowing document paths to trigger routing. */
export function scoreIntentLexicon(value: string): IntentLexiconScore {
  const prompt = stripDocumentMentions(value)
  const scores: Partial<Record<TaskIntent, number>> = {}
  const evidence: IntentLexiconEvidence[] = []
  for (const entry of INTENT_TOKEN_LEXICON) {
    const match = prompt.match(entry.pattern)?.[0]
    if (!match) continue
    scores[entry.intent] = (scores[entry.intent] ?? 0) + entry.weight
    evidence.push({ token: entry.token, intent: entry.intent, weight: entry.weight, match })
  }
  const ranked = Object.entries(scores)
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
    .map(([intent, score]) => ({ intent: intent as TaskIntent, score: score ?? 0 }))
  const top = ranked[0]
  const second = ranked[1]
  if (!top) return { intent: null, confidence: 'low', scores, evidence }
  const margin = top.score - (second?.score ?? 0)
  const confidence = top.score >= 5 && margin >= 3 ? 'high' : margin >= 3 ? 'medium' : 'low'
  return { intent: top.intent, confidence, scores, evidence }
}

/**
 * Route explicit document operations before assembling a model request.
 * This is deliberately deterministic: ambiguous prompts remain low-confidence and
 * are subject to the existing clarification gate before body access.
 */
export function classifyTask(value: string, context: boolean | TaskRoutingContext, actionId: string | null = null): TaskPlan {
  const prompt = stripDocumentMentions(value)
  const { hasContextDocuments, documentSelection } = resolveRoutingContext(value, context)
  const route = (plan: TaskPlanInput) => withCapabilities(plan, documentSelection)

  if (actionId === 'structure-segmentation') {
    return route({
      intent: 'structure-segmentation', operation: 'segment', scope: 'selected-documents', sideEffect: 'proposal',
      documentAccess: 'selected', analysisMode: null, analysisCoverage: 'targeted', sourcePolicy: 'local-chunks',
      requiresModel: false, confidence: 'high', revisionStrategy: null,
    })
  }
  if (actionId === 'structure-enhancement') {
    return route({
      intent: 'structure-enhancement', operation: 'analyze', scope: 'selected-documents', sideEffect: 'draft',
      documentAccess: 'selected', ...deepAnalysisPolicy(prompt), requiresModel: true, confidence: 'high', revisionStrategy: null,
    })
  }
  if (actionId === 'document-analysis') {
    const policy = deepAnalysisPolicy(prompt)
    return route({
      intent: 'document-analysis', operation: 'analyze', scope: 'selected-documents', sideEffect: 'draft',
      documentAccess: 'selected', ...policy, requiresModel: true, confidence: 'high', revisionStrategy: null,
    })
  }
  if (actionId === 'character-analysis') {
    const policy = deepAnalysisPolicy(prompt)
    return route({
      intent: 'character-analysis', operation: 'analyze', scope: 'selected-documents', sideEffect: 'draft',
      documentAccess: 'selected', ...policy, requiresModel: true, confidence: 'high', revisionStrategy: null,
    })
  }
  if (actionId === 'document-revision') {
    return route({
      intent: 'document-revision', operation: 'revise', scope: 'selected-documents', sideEffect: 'draft',
      documentAccess: 'selected', ...deepAnalysisPolicy(prompt), requiresModel: true, confidence: 'high', revisionStrategy: 'long',
    })
  }
  if (actionId === 'continuity-review') {
    const workspaceScope = asksAboutWorkspace(prompt)
    return route({
      intent: 'continuity-review', operation: 'review', scope: workspaceScope ? 'workspace' : 'selected-documents', sideEffect: 'draft',
      documentAccess: workspaceScope ? 'workspace' : 'selected', ...deepAnalysisPolicy(prompt), requiresModel: true, confidence: 'high', revisionStrategy: null,
    })
  }
  if (actionId === 'workspace-analysis') {
    const policy = workspaceAnalysisPolicy(prompt)
    return route({
      intent: 'workspace-analysis', operation: 'analyze', scope: 'workspace', sideEffect: 'draft',
      documentAccess: policy.analysisMode === 'overview' ? 'workspace-metadata' : policy.analysisMode === 'focused' ? 'workspace-focused' : 'workspace',
      ...policy, requiresModel: policy.analysisMode !== 'overview', confidence: 'high', revisionStrategy: null,
    })
  }

  if (/(?:重新梳理|深入梳理|语义梳理|隐含场景|剧情阶段|章节命名|结构归纳)/u.test(prompt)) {
    return route({
      intent: 'structure-enhancement',
      operation: 'analyze',
      scope: 'selected-documents',
      sideEffect: 'draft',
      documentAccess: 'selected',
      analysisMode: 'deep',
      analysisCoverage: exhaustiveCoverage(prompt) ? 'exhaustive' : 'targeted',
      sourcePolicy: 'local-chunks',
      requiresModel: true,
      confidence: 'high',
      revisionStrategy: null,
    })
  }

  if (/(?:拆分章节|章节拆分|拆分场景|场景边界|识别章节(?:和|与)?场景|章节结构)/u.test(prompt)) {
    return route({
      intent: 'structure-segmentation',
      operation: 'segment',
      scope: 'selected-documents',
      sideEffect: 'proposal',
      documentAccess: 'selected',
      analysisMode: null,
      analysisCoverage: 'targeted',
      sourcePolicy: 'local-chunks',
      requiresModel: false,
      confidence: 'high',
      revisionStrategy: null,
    })
  }

  if (asksForContinuityReview(prompt)) {
    const workspaceScope = asksAboutWorkspace(prompt)
    const policy = deepAnalysisPolicy(prompt)
    return route({
      intent: 'continuity-review',
      operation: 'review',
      scope: workspaceScope ? 'workspace' : 'selected-documents',
      sideEffect: 'draft',
      documentAccess: workspaceScope ? 'workspace' : 'selected',
      ...policy,
      requiresModel: true,
      confidence: 'high',
      revisionStrategy: null,
    })
  }

  if (hasContextDocuments && referencesSelectedDocuments(prompt) && asksForDocumentRevision(prompt)) {
    const policy = deepAnalysisPolicy(prompt)
    return route({
      intent: 'document-revision',
      operation: 'revise',
      scope: 'selected-documents',
      sideEffect: 'draft',
      documentAccess: 'selected',
      ...policy,
      requiresModel: true,
      confidence: 'high',
      revisionStrategy: null,
    })
  }

  if (asksAboutWorkspace(prompt)) {
    const policy = workspaceAnalysisPolicy(prompt)
    return route({
      intent: 'workspace-analysis',
      operation: 'analyze',
      scope: 'workspace',
      sideEffect: 'draft',
      documentAccess: policy.analysisMode === 'overview'
        ? 'workspace-metadata'
        : policy.analysisMode === 'focused' ? 'workspace-focused' : 'workspace',
      ...policy,
      requiresModel: policy.analysisMode !== 'overview',
      confidence: policy.analysisMode === 'focused' ? 'medium' : 'high',
      revisionStrategy: null,
    })
  }

  if (/(?:分析(?:当前|这个|已选)?(?:文档|文件|文本|小说|故事)|(?:这|该|此|这个|这篇|所选)?(?:篇)?(?:小说|故事|文章|文本)(?:主要)?(?:说了什么|讲了什么|讲述了什么|内容是什么|写了什么)|(?:小说|故事|文章|文本)(?:内容|概要|梗概|摘要|概括|总结)|故事主线|人物线|提取人物|伏笔|情节结构)/u.test(prompt)) {
    const policy = deepAnalysisPolicy(prompt)
    const lexical = scoreIntentLexicon(prompt)
    return route({
      intent: lexical.intent ?? (prompt.includes('人物') ? 'character-analysis' : 'document-analysis'),
      operation: 'analyze',
      scope: 'selected-documents',
      sideEffect: 'draft',
      documentAccess: 'selected',
      ...policy,
      requiresModel: true,
      confidence: lexical.intent ? lexical.confidence : 'medium',
      revisionStrategy: null,
    })
  }

  if (asksAboutCharacterRelations(prompt)) {
    const policy = deepAnalysisPolicy(prompt)
    return route({
      intent: 'character-analysis',
      operation: 'analyze',
      scope: 'selected-documents',
      sideEffect: 'draft',
      documentAccess: 'selected',
      ...policy,
      requiresModel: true,
      confidence: 'high',
      revisionStrategy: null,
    })
  }

  if (hasContextDocuments && referencesSelectedDocuments(prompt)) {
    const policy = deepAnalysisPolicy(prompt)
    return route({
      intent: 'document-analysis',
      operation: 'analyze',
      scope: 'selected-documents',
      sideEffect: 'draft',
      documentAccess: 'selected',
      ...policy,
      requiresModel: true,
      confidence: 'low',
      revisionStrategy: null,
    })
  }

  return route({
    intent: 'general-chat',
    operation: 'chat',
    scope: 'conversation',
    sideEffect: 'draft',
    documentAccess: 'none',
    analysisMode: null,
    analysisCoverage: 'index-only',
    sourcePolicy: 'metadata-only',
    requiresModel: true,
    confidence: 'low',
    revisionStrategy: null,
  })
}

export const MAX_BOUNDED_REVISION_TOKENS = 12_000

/** Refine document revision after the authorized targets have been loaded. */
export function refineTaskPlanForDocuments(
  plan: TaskPlan,
  documents: ContextDocument[],
  maxSourceTokens = MAX_BOUNDED_REVISION_TOKENS,
): TaskPlan {
  if (plan.intent !== 'document-revision') return plan
  if (plan.revisionStrategy === 'direct') return plan
  const sourceTokens = documents.reduce((sum, document) => sum + estimateTokens(document.content), 0)
  const bounded = documents.length <= 8 && sourceTokens <= Math.min(MAX_BOUNDED_REVISION_TOKENS, Math.max(256, maxSourceTokens))
  const revised: TaskPlan = {
    ...plan,
    revisionStrategy: bounded ? 'bounded' : 'long',
    sourcePolicy: bounded ? 'local-excerpts' : 'local-chunks',
    analysisMode: bounded ? null : 'deep',
    analysisCoverage: bounded ? 'targeted' : plan.analysisCoverage,
  }
  assertRoutedTaskPolicy(revised)
  return { ...revised, execution: resolveExecutionStrategy(revised) }
}
