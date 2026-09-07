import type { TaskIntent, TaskPlan, TaskScope } from './intent'
import { classifyTask, refineTaskPlanForDocuments } from './intent'
import type { ChatMessage, ContextDocument, TaskMessageRef } from '../types'
import { assertRoutedTaskPolicy } from './runtimePolicy'
import { resolveExecutionStrategy } from './executionStrategy'

export type TaskEntryPoint = 'chat' | 'context-menu' | 'editor-selection' | 'toolbar' | 'project' | 'command-palette'

export interface TaskRequest {
  entryPoint: TaskEntryPoint
  actionId: string | null
  instruction: string
  intent: TaskIntent | null
  scope: TaskScope | null
  targets: Array<{ id: string; kind: 'document' | 'selection' | 'chapter' | 'work' }>
  userConstraints: Record<string, string | number | boolean | string[]>
  conversationRef: {
    conversationId: string | null
    previousTaskId: string | null
    summary: string | null
  }
  requestedEffect: 'read' | 'draft' | 'proposal' | 'write' | 'network'
}

export interface TaskRequestInput {
  entryPoint?: TaskEntryPoint
  actionId?: string | null
  instruction: string
  intent?: TaskIntent | null
  scope?: TaskScope | null
  targets?: TaskRequest['targets']
  userConstraints?: TaskRequest['userConstraints']
  conversationRef?: Partial<TaskRequest['conversationRef']>
  requestedEffect?: TaskRequest['requestedEffect']
}

export interface TaskExecutionInput {
  taskId: string
  stage: 'preflight' | 'final'
  resumeJobId: string | null
  request: TaskRequest
  plan: TaskPlan
}

export type TaskServiceId = 'structure-segmentation' | 'workspace-overview' | 'focused-analysis' | 'long-text-analysis' | 'direct-model'

export interface TaskExecutionDispatch {
  taskId: string
  workspaceId: string | null
  policyVersion: string
  dispatchVersion: string
  acceptedAt: number
  stage: TaskExecutionInput['stage']
  executionPhase: 'ready' | 'clarification-required'
  serviceId: TaskServiceId | null
  executionOwner: 'webview' | 'rust-worker'
  frontendStreamingRequired: boolean
  backgroundEligible: boolean
  jobId: string | null
  clarification: { code: 'confirm-document-body-access'; question: string } | null
  plan: TaskPlan
}

function requestedEffect(input: TaskRequestInput): TaskRequest['requestedEffect'] {
  if (input.requestedEffect) return input.requestedEffect
  if (input.actionId === 'structure-segmentation' || input.intent === 'structure-segmentation') return 'proposal'
  return /(?:拆分章节|章节拆分|拆分场景|场景边界|识别章节(?:和|与)?场景|章节结构)/u.test(input.instruction)
    ? 'proposal'
    : 'draft'
}

export function createTaskRequest(input: TaskRequestInput): TaskRequest {
  const inheritedTargets = isContinuation(input.instruction)
    ? parseConversationSummary(input.conversationRef?.summary ?? null)?.targets ?? []
    : []
  const targets = (input.targets?.length ? input.targets : inheritedTargets)
    .filter((target) => target.id.trim().length > 0)
    .map((target) => ({ ...target, id: target.id.trim() }))
    .filter((target, index, values) => values.findIndex((candidate) => candidate.kind === target.kind && candidate.id === target.id) === index)
  return {
    entryPoint: input.entryPoint ?? 'chat',
    actionId: input.actionId ?? null,
    instruction: input.instruction.trim(),
    intent: input.intent ?? null,
    scope: input.scope ?? null,
    targets,
    userConstraints: input.userConstraints ?? {},
    conversationRef: {
      conversationId: input.conversationRef?.conversationId ?? null,
      previousTaskId: input.conversationRef?.previousTaskId ?? null,
      summary: input.conversationRef?.summary ?? null,
    },
    requestedEffect: requestedEffect(input),
  }
}

export function validateTaskExecutionInput(input: TaskExecutionInput): void {
  if (!/^[A-Za-z0-9_.-]{1,120}$/u.test(input.taskId)) throw new Error('任务 ID 无效')
  if (input.stage !== 'preflight' && input.stage !== 'final') throw new Error('任务调度阶段无效')
  if (input.resumeJobId && !/^[A-Za-z0-9_.-]{1,120}$/u.test(input.resumeJobId)) throw new Error('恢复任务 ID 无效')
  if (input.resumeJobId && input.plan.execution.workflow !== 'long-text-analysis') throw new Error('只有长文本任务可以请求恢复 Job')
  if (!input.request.instruction.trim() || input.request.instruction.length > 200_000) throw new Error('任务指令为空或超过限制')
  if (input.request.targets.length > 100) throw new Error('任务目标数量超过限制')
  if (input.request.intent && input.request.intent !== input.plan.intent) throw new Error('TaskRequest 与 TaskPlan intent 不一致')
  if (input.request.scope && input.request.scope !== input.plan.scope) throw new Error('TaskRequest 与 TaskPlan scope 不一致')
  if (input.request.requestedEffect !== input.plan.sideEffect) throw new Error('TaskRequest 与 TaskPlan 副作用不一致')
  assertRoutedTaskPolicy(input.plan)
}

/** Browser/demo mirror of the Rust dispatcher; desktop builds always use Rust as authority. */
export function createTaskExecutionDispatch(input: TaskExecutionInput, workspaceId: string | null): TaskExecutionDispatch {
  validateTaskExecutionInput(input)
  const readsBodies = input.plan.documentAccess === 'selected'
    || input.plan.documentAccess === 'workspace-focused'
    || input.plan.documentAccess === 'workspace'
  const needsClarification = input.plan.confidence === 'low' && readsBodies && !input.request.actionId && !input.resumeJobId
  const serviceId: TaskServiceId | null = needsClarification
    ? null
    : input.plan.intent === 'structure-segmentation'
      ? 'structure-segmentation'
      : input.plan.documentAccess === 'workspace-metadata'
        ? 'workspace-overview'
        : input.plan.execution.workflow === 'focused-analysis'
          ? 'focused-analysis'
          : input.plan.execution.workflow === 'long-text-analysis'
            ? 'long-text-analysis'
            : 'direct-model'
  const backgroundEligible = serviceId === 'long-text-analysis'
  return {
    taskId: input.taskId,
    workspaceId,
    policyVersion: 'task-policy-1',
    dispatchVersion: 'service-dispatch-1',
    acceptedAt: Date.now(),
    stage: input.stage,
    executionPhase: needsClarification ? 'clarification-required' : 'ready',
    serviceId,
    executionOwner: 'webview',
    frontendStreamingRequired: !needsClarification && input.plan.requiresModel,
    backgroundEligible,
    jobId: backgroundEligible ? input.resumeJobId ?? input.taskId : null,
    clarification: needsClarification ? {
      code: 'confirm-document-body-access',
      question: input.plan.scope === 'workspace'
        ? '请明确选择：只查看项目结构，还是读取项目正文进行分析？'
        : '请明确选择：仅继续聊天，还是分析所选文档正文？',
    } : null,
    plan: structuredClone(input.plan),
  }
}

export function routeTask(request: TaskRequest, hasContextDocuments: boolean): TaskPlan {
  const actionId = request.actionId ?? (request.intent && request.intent !== 'general-chat' ? request.intent : null)
  if (!actionId && isContinuation(request.instruction)) {
    const previous = parseConversationSummary(request.conversationRef.summary)
    if (previous && previous.sideEffect !== 'proposal') {
      if (previous.targets.some((target) => target.kind === 'selection')) return classifyTask(request.instruction, hasContextDocuments)
      const continuationIntent = /(?:改|润色|重写|续写|修改)/u.test(request.instruction) && previous.targets.length > 0
        ? 'document-revision'
        : previous.intent
      if (continuationIntent !== 'general-chat') return applyRequestContext(classifyTask(request.instruction, hasContextDocuments, continuationIntent), request)
    }
  }
  return applyRequestContext(classifyTask(request.instruction, hasContextDocuments, actionId), request)
}

function applyRequestContext(plan: TaskPlan, request: TaskRequest): TaskPlan {
  if (plan.intent !== 'document-revision' || !request.targets.some((target) => target.kind === 'selection')) return plan
  const revised: TaskPlan = {
    ...plan, scope: 'editor-selection', revisionStrategy: 'direct', analysisMode: null,
    analysisCoverage: 'targeted', sourcePolicy: 'local-excerpts',
  }
  assertRoutedTaskPolicy(revised)
  return { ...revised, execution: resolveExecutionStrategy(revised) }
}

export function refineTaskForDocuments(plan: TaskPlan, documents: ContextDocument[], maxSourceTokens?: number): TaskPlan {
  return refineTaskPlanForDocuments(plan, documents, maxSourceTokens)
}

function isContinuation(instruction: string): boolean {
  return /^(?:继续|接着|然后|再来|按(?:刚才|上面|之前)|沿用|就这个|照这个)/u.test(instruction.trim())
}

function parseConversationSummary(summary: string | null): TaskMessageRef | null {
  if (!summary) return null
  try {
    const value = JSON.parse(summary) as TaskMessageRef
    return value && typeof value.intent === 'string' && Array.isArray(value.targets) ? value : null
  } catch {
    return null
  }
}

/** Build a body-free reference to the previous routed task for follow-up routing. */
export function buildConversationReference(messages: ChatMessage[]): TaskRequest['conversationRef'] {
  const previous = [...messages].reverse().find((message) => message.role === 'user' && message.taskRef)?.taskRef
  return {
    conversationId: null,
    previousTaskId: previous?.taskId ?? null,
    summary: previous ? JSON.stringify(previous) : null,
  }
}

export function createTaskMessageRef(request: TaskRequest, plan: TaskPlan, taskId: string): TaskMessageRef {
  return {
    taskId,
    intent: plan.intent,
    scope: plan.scope,
    actionId: request.actionId,
    targets: plan.documentAccess === 'none' ? [] : request.targets,
    sideEffect: plan.sideEffect,
  }
}
