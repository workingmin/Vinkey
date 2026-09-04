import { getTaskCapabilities } from './registry'
import type { AgentId, SkillId } from './registry'
import type { AnalysisCoverage, AnalysisMode, SourcePolicy } from '../types'

export type TaskIntent =
  | 'structure-segmentation'
  | 'structure-enhancement'
  | 'document-analysis'
  | 'character-analysis'
  | 'workspace-analysis'
  | 'general-chat'

export type TaskOperation = 'segment' | 'analyze' | 'chat'
export type TaskScope = 'selected-documents' | 'current-document' | 'workspace' | 'conversation'
export type TaskSideEffect = 'read' | 'draft' | 'proposal'
export type DocumentAccess = 'none' | 'selected-metadata' | 'selected' | 'workspace-metadata' | 'workspace'

export interface TaskPlan {
  intent: TaskIntent
  agent: AgentId
  skill: SkillId
  allowedTools: string[]
  operation: TaskOperation
  scope: TaskScope
  sideEffect: TaskSideEffect
  /** Whether the downstream service may read the selected document bodies. */
  documentAccess: DocumentAccess
  analysisMode: AnalysisMode | null
  analysisCoverage: AnalysisCoverage
  sourcePolicy: SourcePolicy
  requiresModel: boolean
  confidence: 'high' | 'medium' | 'low'
}

function withCapabilities(plan: Omit<TaskPlan, 'agent' | 'skill' | 'allowedTools'>): TaskPlan {
  return { ...plan, ...getTaskCapabilities(plan.intent, plan.analysisMode) }
}

function referencesSelectedDocuments(prompt: string): boolean {
  return /(?:根据|参考|基于|结合|按照)[^。！？\n]{0,20}(?:文档|文件|文本|小说|故事|文章)|(?:这|该|此|这个|这篇|所选|当前)(?:篇)?(?:文档|文件|文本|小说|故事|文章)|(?:文档|文件|文本|小说|故事|文章)(?:中|内容|正文)|(?:续写|改写|润色|校对|修改)(?:当前|这|该|此|这个|这篇|所选)?(?:文档|文件|文本|小说|故事|内容|段落|章节|下一章|一版)/u.test(prompt)
}

function asksAboutCharacterRelations(prompt: string): boolean {
  return /(?:人物|角色)?(?:关系|关联|联系|冲突|合作|感情|亲属关系)|(?:之间|和|与).{0,16}(?:是什么关系|有何关系|关系如何|如何联系|是否有关联)/u.test(prompt)
}

function asksAboutWorkspace(prompt: string): boolean {
  return /(?:这个|当前|整个|本地|该|本)(?:项目|工作区|工程)|(?:项目|工作区|工程)(?:中|里|内|的)?(?:有哪些|包含|有多少|是什么|做什么|讲了什么|介绍|概况|总览|全貌|结构|组成|分析|总结)|(?:分析|介绍|概览|总结|梳理|通读)(?:一下|下)?(?:这个|当前|整个|本地|该|本)?(?:项目|工作区|工程)|(?:全部|所有)(?:文件|文档)(?:内容|概要|摘要|总结|汇总|分析)/u.test(prompt)
}

function explicitDeepMode(prompt: string): boolean {
  return /(?:详细|深入|深度|逐章|逐节|逐文件|通读|全文|完整|全量|全部|所有|不要遗漏|不遗漏)/u.test(prompt)
}

function explicitOverviewMode(prompt: string): boolean {
  return /(?:概览|总览|概况|大致|简要介绍|结构一览)/u.test(prompt)
}

function exhaustiveCoverage(prompt: string): boolean {
  return /(?:完整|全量|全部|所有|通读|逐章|逐节|逐文件|不要遗漏|不遗漏|一字不漏)/u.test(prompt)
}

function analysisPolicy(prompt: string, preferredMode: AnalysisMode): Pick<TaskPlan, 'analysisMode' | 'analysisCoverage' | 'sourcePolicy'> {
  const analysisMode: AnalysisMode = explicitDeepMode(prompt) ? 'deep' : explicitOverviewMode(prompt) ? 'overview' : preferredMode
  return analysisMode === 'overview'
    ? { analysisMode, analysisCoverage: 'index-only', sourcePolicy: 'metadata-only' }
    : { analysisMode, analysisCoverage: exhaustiveCoverage(prompt) ? 'exhaustive' : 'targeted', sourcePolicy: 'local-chunks' }
}

/**
 * Route explicit document operations before assembling a model request.
 * This is deliberately deterministic: ambiguous prompts remain ordinary chat.
 */
export function classifyTask(value: string, hasContextDocuments: boolean, preferredMode: AnalysisMode = 'overview'): TaskPlan {
  const prompt = value.trim()
  const scope: TaskScope = hasContextDocuments ? 'selected-documents' : 'conversation'

  if (/(?:重新梳理|深入梳理|语义梳理|隐含场景|剧情阶段|章节命名|结构归纳)/u.test(prompt)) {
    return withCapabilities({
      intent: 'structure-enhancement',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: 'selected',
      analysisMode: 'deep',
      analysisCoverage: exhaustiveCoverage(prompt) ? 'exhaustive' : 'targeted',
      sourcePolicy: 'local-chunks',
      requiresModel: true,
      confidence: 'high',
    })
  }

  if (/(?:拆分章节|章节拆分|拆分场景|场景边界|识别章节(?:和|与)?场景|章节结构)/u.test(prompt)) {
    return withCapabilities({
      intent: 'structure-segmentation',
      operation: 'segment',
      scope,
      sideEffect: 'proposal',
      documentAccess: 'selected',
      analysisMode: null,
      analysisCoverage: 'targeted',
      sourcePolicy: 'local-chunks',
      requiresModel: false,
      confidence: 'high',
    })
  }

  if (asksAboutWorkspace(prompt)) {
    const policy = analysisPolicy(prompt, preferredMode)
    return withCapabilities({
      intent: 'workspace-analysis',
      operation: 'analyze',
      scope: 'workspace',
      sideEffect: 'draft',
      documentAccess: policy.analysisMode === 'overview' ? 'workspace-metadata' : 'workspace',
      ...policy,
      requiresModel: true,
      confidence: 'high',
    })
  }

  if (/(?:分析(?:当前|这个|已选)?(?:文档|文件|文本|小说|故事)|(?:这|该|此|这个|这篇|所选)?(?:篇)?(?:小说|故事|文章|文本)(?:主要)?(?:说了什么|讲了什么|讲述了什么|内容是什么|写了什么)|(?:小说|故事|文章|文本)(?:内容|概要|梗概|摘要|概括|总结)|故事主线|人物线|提取人物|伏笔|情节结构)/u.test(prompt)) {
    const policy = analysisPolicy(prompt, preferredMode)
    return withCapabilities({
      intent: prompt.includes('人物') ? 'character-analysis' : 'document-analysis',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: policy.analysisMode === 'overview' ? 'selected-metadata' : 'selected',
      ...policy,
      requiresModel: true,
      confidence: 'medium',
    })
  }

  if (asksAboutCharacterRelations(prompt)) {
    const policy = analysisPolicy(prompt, preferredMode)
    return withCapabilities({
      intent: 'character-analysis',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: policy.analysisMode === 'overview' ? 'selected-metadata' : 'selected',
      ...policy,
      requiresModel: true,
      confidence: 'high',
    })
  }

  const documentAccess = hasContextDocuments && referencesSelectedDocuments(prompt) ? 'selected' : 'none'
  return withCapabilities({
    intent: 'general-chat',
    operation: 'chat',
    scope: documentAccess === 'selected' ? scope : 'conversation',
    sideEffect: 'draft',
    documentAccess,
    analysisMode: null,
    analysisCoverage: documentAccess === 'selected' ? 'targeted' : 'index-only',
    sourcePolicy: documentAccess === 'selected' ? 'local-chunks' : 'metadata-only',
    requiresModel: true,
    confidence: 'low',
  })
}
