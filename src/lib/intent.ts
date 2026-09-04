import { getTaskCapabilities } from './registry'
import type { AgentId, SkillId } from './registry'

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
export type DocumentAccess = 'none' | 'selected' | 'workspace'

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
  requiresModel: boolean
  confidence: 'high' | 'medium' | 'low'
}

function withCapabilities(plan: Omit<TaskPlan, 'agent' | 'skill' | 'allowedTools'>): TaskPlan {
  return { ...plan, ...getTaskCapabilities(plan.intent) }
}

function referencesSelectedDocuments(prompt: string): boolean {
  return /(?:根据|参考|基于|结合|按照)[^。！？\n]{0,20}(?:文档|文件|文本|小说|故事|文章)|(?:这|该|此|这个|这篇|所选|当前)(?:篇)?(?:文档|文件|文本|小说|故事|文章)|(?:文档|文件|文本|小说|故事|文章)(?:中|内容|正文)|(?:续写|改写|润色|校对|修改)(?:当前|这|该|此|这个|这篇|所选)?(?:文档|文件|文本|小说|故事|内容|段落|章节|下一章|一版)/u.test(prompt)
}

function asksAboutCharacterRelations(prompt: string): boolean {
  return /(?:人物|角色)?(?:关系|关联|联系|冲突|合作|感情|亲属关系)|(?:之间|和|与).{0,16}(?:是什么关系|有何关系|关系如何|如何联系|是否有关联)/u.test(prompt)
}

function asksAboutWorkspace(prompt: string): boolean {
  return /(?:当前|整个|整个的|本地|这个)?(?:项目|工作区|目录|工程)(?:中|里|内)?(?:有哪些|包含哪些|有多少|的)?(?:文件|文档|内容|资料)|(?:全部|所有)(?:文件|文档)(?:内容|概要|摘要|总结|汇总|分析)|项目(?:结构|组成|概况|总览|全貌)/u.test(prompt)
}

/**
 * Route explicit document operations before assembling a model request.
 * This is deliberately deterministic: ambiguous prompts remain ordinary chat.
 */
export function classifyTask(value: string, hasContextDocuments: boolean): TaskPlan {
  const prompt = value.trim()
  const scope: TaskScope = hasContextDocuments ? 'selected-documents' : 'conversation'

  if (asksAboutWorkspace(prompt)) {
    return withCapabilities({
      intent: 'workspace-analysis',
      operation: 'analyze',
      scope: 'workspace',
      sideEffect: 'draft',
      documentAccess: 'workspace',
      requiresModel: true,
      confidence: 'high',
    })
  }

  if (/(?:重新梳理|深入梳理|语义梳理|隐含场景|剧情阶段|章节命名|结构归纳)/u.test(prompt)) {
    return withCapabilities({
      intent: 'structure-enhancement',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: 'selected',
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
      requiresModel: false,
      confidence: 'high',
    })
  }

  if (/(?:分析(?:当前|这个|已选)?(?:文档|文件|文本|小说|故事)|(?:这|该|此|这个|这篇|所选)?(?:篇)?(?:小说|故事|文章|文本)(?:主要)?(?:说了什么|讲了什么|讲述了什么|内容是什么|写了什么)|(?:小说|故事|文章|文本)(?:内容|概要|梗概|摘要|概括|总结)|故事主线|人物线|提取人物|伏笔|情节结构)/u.test(prompt)) {
    return withCapabilities({
      intent: prompt.includes('人物') ? 'character-analysis' : 'document-analysis',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: 'selected',
      requiresModel: true,
      confidence: 'medium',
    })
  }

  if (asksAboutCharacterRelations(prompt)) {
    return withCapabilities({
      intent: 'character-analysis',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: 'selected',
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
    requiresModel: true,
    confidence: 'low',
  })
}
