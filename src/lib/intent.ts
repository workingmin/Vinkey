export type TaskIntent =
  | 'structure-segmentation'
  | 'structure-enhancement'
  | 'document-analysis'
  | 'character-analysis'
  | 'general-chat'

export type TaskOperation = 'segment' | 'analyze' | 'chat'
export type TaskScope = 'selected-documents' | 'current-document' | 'conversation'
export type TaskSideEffect = 'read' | 'draft' | 'proposal'
export type DocumentAccess = 'none' | 'selected'

export interface TaskPlan {
  intent: TaskIntent
  operation: TaskOperation
  scope: TaskScope
  sideEffect: TaskSideEffect
  /** Whether the downstream service may read the selected document bodies. */
  documentAccess: DocumentAccess
  requiresModel: boolean
  confidence: 'high' | 'medium' | 'low'
}

function referencesSelectedDocuments(prompt: string): boolean {
  return /(?:根据|参考|基于|结合|按照)[^。！？\n]{0,20}(?:文档|文件|文本|小说|故事|文章)|(?:这|该|此|这个|这篇|所选|当前)(?:篇)?(?:文档|文件|文本|小说|故事|文章)|(?:文档|文件|文本|小说|故事|文章)(?:中|内容|正文)|(?:续写|改写|润色|校对|修改)(?:当前|这|该|此|这个|这篇|所选)?(?:文档|文件|文本|小说|故事|内容|段落|章节|下一章|一版)/u.test(prompt)
}

/**
 * Route explicit document operations before assembling a model request.
 * This is deliberately deterministic: ambiguous prompts remain ordinary chat.
 */
export function classifyTask(value: string, hasContextDocuments: boolean): TaskPlan {
  const prompt = value.trim()
  const scope: TaskScope = hasContextDocuments ? 'selected-documents' : 'conversation'

  if (/(?:重新梳理|深入梳理|语义梳理|隐含场景|剧情阶段|章节命名|结构归纳)/u.test(prompt)) {
    return {
      intent: 'structure-enhancement',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: 'selected',
      requiresModel: true,
      confidence: 'high',
    }
  }

  if (/(?:拆分章节|章节拆分|拆分场景|场景边界|识别章节(?:和|与)?场景|章节结构)/u.test(prompt)) {
    return {
      intent: 'structure-segmentation',
      operation: 'segment',
      scope,
      sideEffect: 'proposal',
      documentAccess: 'selected',
      requiresModel: false,
      confidence: 'high',
    }
  }

  if (/(?:分析(?:当前|这个|已选)?(?:文档|文件|文本|小说|故事)|(?:这|该|此|这个|这篇|所选)?(?:篇)?(?:小说|故事|文章|文本)(?:主要)?(?:说了什么|讲了什么|讲述了什么|内容是什么|写了什么)|(?:小说|故事|文章|文本)(?:内容|概要|梗概|摘要|概括|总结)|故事主线|人物线|提取人物|伏笔|情节结构)/u.test(prompt)) {
    return {
      intent: prompt.includes('人物') ? 'character-analysis' : 'document-analysis',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      documentAccess: 'selected',
      requiresModel: true,
      confidence: 'medium',
    }
  }

  const documentAccess = hasContextDocuments && referencesSelectedDocuments(prompt) ? 'selected' : 'none'
  return {
    intent: 'general-chat',
    operation: 'chat',
    scope: documentAccess === 'selected' ? scope : 'conversation',
    sideEffect: 'draft',
    documentAccess,
    requiresModel: true,
    confidence: 'low',
  }
}
