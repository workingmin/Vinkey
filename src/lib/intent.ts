export type TaskIntent =
  | 'structure-segmentation'
  | 'structure-enhancement'
  | 'document-analysis'
  | 'character-analysis'
  | 'general-chat'

export type TaskOperation = 'segment' | 'analyze' | 'chat'
export type TaskScope = 'selected-documents' | 'current-document' | 'conversation'
export type TaskSideEffect = 'read' | 'draft' | 'proposal'

export interface TaskPlan {
  intent: TaskIntent
  operation: TaskOperation
  scope: TaskScope
  sideEffect: TaskSideEffect
  requiresModel: boolean
  confidence: 'high' | 'medium' | 'low'
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
      requiresModel: false,
      confidence: 'high',
    }
  }

  if (/(?:分析(?:当前|这个|已选)?(?:文档|文件|文本)|故事主线|人物线|提取人物|伏笔|情节结构)/u.test(prompt)) {
    return {
      intent: prompt.includes('人物') ? 'character-analysis' : 'document-analysis',
      operation: 'analyze',
      scope,
      sideEffect: 'draft',
      requiresModel: true,
      confidence: 'medium',
    }
  }

  return {
    intent: 'general-chat',
    operation: 'chat',
    scope: 'conversation',
    sideEffect: 'draft',
    requiresModel: true,
    confidence: 'low',
  }
}
