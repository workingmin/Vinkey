import { describe, expect, it } from 'vitest'
import { buildConversationReference, createTaskExecutionDispatch, createTaskMessageRef, createTaskRequest, refineTaskForDocuments, routeTask, validateTaskExecutionInput } from './taskRuntime'
import type { ContextDocument } from '../types'
import { assertToolCallAllowed, createToolGateway } from './runtimePolicy'

const document = (content: string): ContextDocument => ({
  path: '章节/第一章.md', name: '第一章.md', content, size: content.length, kind: 'markdown',
})

describe('structured task runtime intake', () => {
  it('routes an explicit action without reclassifying its prompt', () => {
    const request = createTaskRequest({
      entryPoint: 'context-menu', actionId: 'structure-segmentation', instruction: '执行拆分',
      targets: [{ id: 'chapter-1', kind: 'document' }],
    })
    const plan = routeTask(request, true)
    expect(plan.intent).toBe('structure-segmentation')
    expect(plan.requiresModel).toBe(false)
    expect(request.targets[0].id).toBe('chapter-1')
    expect(request.requestedEffect).toBe('proposal')
  })

  it('rejects a request/plan side-effect mismatch before Rust admission', () => {
    const request = createTaskRequest({ instruction: '普通聊天' })
    const plan = routeTask(request, false)
    expect(() => validateTaskExecutionInput({ taskId: 'task-1', stage: 'preflight', resumeJobId: null, request, plan })).not.toThrow()
    expect(() => validateTaskExecutionInput({ taskId: 'task-1', stage: 'preflight', resumeJobId: null, request: { ...request, requestedEffect: 'proposal' }, plan }))
      .toThrow('副作用不一致')
  })

  it('declares proposal authority for an implicit segmentation command', () => {
    const request = createTaskRequest({ instruction: '请拆分章节' })
    const plan = routeTask(request, true)
    expect(request.requestedEffect).toBe('proposal')
    expect(() => validateTaskExecutionInput({ taskId: 'task-2', stage: 'preflight', resumeJobId: null, request, plan })).not.toThrow()
  })

  it('keeps small revisions on bounded original-text context', () => {
    const plan = refineTaskForDocuments(routeTask(createTaskRequest({ instruction: '根据文档润色', actionId: null }), true), [document('短段落')])
    expect(plan.revisionStrategy).toBe('bounded')
    expect(plan.sourcePolicy).toBe('local-excerpts')
    expect(plan.execution.currentMode).toBe('direct-model')
  })

  it('keeps large revisions on the resumable long-text workflow', () => {
    const plan = refineTaskForDocuments(routeTask(createTaskRequest({ instruction: '根据这个文件改写一版', actionId: null }), true), [document('长文本'.repeat(20_000))])
    expect(plan.revisionStrategy).toBe('long')
    expect(plan.sourcePolicy).toBe('local-chunks')
    expect(plan.execution.workflow).toBe('long-text-analysis')
  })

  it('uses the active model budget when selecting a revision workflow', () => {
    const initial = routeTask(createTaskRequest({ instruction: '根据这个文件改写一版' }), true)
    const plan = refineTaskForDocuments(initial, [document('较长原文'.repeat(800))], 512)
    expect(plan.revisionStrategy).toBe('long')
    expect(plan.execution.workflow).toBe('long-text-analysis')
  })

  it('routes an editor selection directly to a DiffProposal revision', () => {
    const request = createTaskRequest({
      entryPoint: 'editor-selection', actionId: 'document-revision', instruction: '润色选区',
      targets: [{ id: 'a.md#2:8', kind: 'selection' }],
    })
    const plan = routeTask(request, true)
    expect(plan.scope).toBe('editor-selection')
    expect(plan.revisionStrategy).toBe('direct')
    expect(plan.execution.currentMode).toBe('direct-model')
  })

  it('stops an ambiguous body-reading request for one clarification', () => {
    const request = createTaskRequest({
      instruction: '根据这个文档说说你的看法',
      targets: [{ id: 'a.md', kind: 'document' }],
    })
    const plan = routeTask(request, true)
    expect(plan.confidence).toBe('low')
    const dispatch = createTaskExecutionDispatch({ taskId: 'task-ambiguous', stage: 'preflight', resumeJobId: null, request, plan }, 'workspace-1')
    expect(dispatch.executionPhase).toBe('clarification-required')
    expect(dispatch.serviceId).toBeNull()
    expect(dispatch.frontendStreamingRequired).toBe(false)
    expect(dispatch.clarification?.question).toContain('分析所选文档正文')
  })

  it('dispatches final long text work with a stable job identity', () => {
    const request = createTaskRequest({
      actionId: 'document-analysis', instruction: '完整分析这个文档',
      targets: [{ id: 'a.md', kind: 'document' }],
    })
    const plan = routeTask(request, true)
    const dispatch = createTaskExecutionDispatch({ taskId: 'task-long', stage: 'final', resumeJobId: 'existing-job', request, plan }, 'workspace-1')
    expect(dispatch.serviceId).toBe('long-text-analysis')
    expect(dispatch.executionOwner).toBe('webview')
    expect(dispatch.backgroundEligible).toBe(true)
    expect(dispatch.jobId).toBe('existing-job')
  })

  it('checks each tool call against the routed plan', () => {
    const plan = routeTask(createTaskRequest({ instruction: '普通聊天' }), false)
    expect(() => assertToolCallAllowed(plan, 'stream_chat')).toThrow('输入不符合 schema')
    expect(() => assertToolCallAllowed(plan, 'stream_chat', {
      requestId: 'request-1', profileId: 'profile-1', sourcePolicy: 'metadata-only',
      messages: [{ role: 'user', content: '你好' }],
    })).not.toThrow()
    expect(() => assertToolCallAllowed(plan, 'read_document')).toThrow('未授权调用 Tool')
  })

  it('honors an explicit intent and normalizes duplicate targets', () => {
    const request = createTaskRequest({
      instruction: '执行分析',
      intent: 'document-analysis',
      targets: [
        { id: ' chapter-1 ', kind: 'document' },
        { id: 'chapter-1', kind: 'document' },
        { id: '', kind: 'selection' },
      ],
    })
    expect(routeTask(request, true).intent).toBe('document-analysis')
    expect(request.targets).toEqual([{ id: 'chapter-1', kind: 'document' }])
  })

  it('validates structured Tool input at the gateway boundary', async () => {
    const plan = routeTask(createTaskRequest({ instruction: '普通聊天' }), false)
    const gateway = createToolGateway(plan)
    const input = { requestId: 'r', profileId: 'p', sourcePolicy: 'metadata-only', messages: [{ role: 'user', content: 'hi' }] }
    expect(() => gateway.assert('stream_chat', input)).not.toThrow()
    expect(() => gateway.assert('stream_chat', { requestId: 'r' })).toThrow('缺少必填字段')
    await expect(gateway.call('stream_chat', input, async () => undefined)).resolves.toBeUndefined()
  })

  it('prevents a model call from escalating the routed source policy', () => {
    const gateway = createToolGateway(routeTask(createTaskRequest({ instruction: '普通聊天' }), false))
    expect(() => gateway.assert('stream_chat', {
      requestId: 'r', profileId: 'p', sourcePolicy: 'local-chunks', messages: [],
    })).toThrow('不能将来源策略')
  })

  it('inherits a safe previous task for a continuation', () => {
    const previousRequest = createTaskRequest({ instruction: '分析这个文档', actionId: 'document-analysis', targets: [{ id: 'a.md', kind: 'document' }] })
    const previousPlan = routeTask(previousRequest, true)
    const taskRef = createTaskMessageRef(previousRequest, previousPlan, 'task-1')
    const conversationRef = buildConversationReference([{ id: 'm1', role: 'user', content: '分析这个文档', createdAt: 1, taskRef }])
    const continued = routeTask(createTaskRequest({ instruction: '继续，重点看第二幕', conversationRef }), true)
    expect(continued.intent).toBe('document-analysis')
    expect(conversationRef.previousTaskId).toBe('task-1')
  })

  it('does not inherit a proposal side effect', () => {
    const previousRequest = createTaskRequest({ instruction: '拆分章节', actionId: 'structure-segmentation' })
    const taskRef = createTaskMessageRef(previousRequest, routeTask(previousRequest, true), 'task-2')
    const conversationRef = buildConversationReference([{ id: 'm2', role: 'user', content: '拆分章节', createdAt: 1, taskRef }])
    expect(routeTask(createTaskRequest({ instruction: '继续', conversationRef }), true).intent).toBe('general-chat')
  })

  it('requires a fresh selection instead of restoring selection text from history', () => {
    const previousRequest = createTaskRequest({
      instruction: '润色选区', actionId: 'document-revision', targets: [{ id: 'a.md#1:4', kind: 'selection' }],
    })
    const taskRef = createTaskMessageRef(previousRequest, routeTask(previousRequest, true), 'task-3')
    const conversationRef = buildConversationReference([{ id: 'm3', role: 'user', content: '润色选区', createdAt: 1, taskRef }])
    expect(routeTask(createTaskRequest({ instruction: '继续', conversationRef }), false).intent).toBe('general-chat')
  })
})
