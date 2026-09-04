import type { AnalysisMode } from '../types'
import type { TaskIntent, TaskSideEffect } from './intent'

export type AgentId =
  | 'GeneralConversation'
  | 'StructureSegmentation'
  | 'StoryDeconstruction'

export type SkillId =
  | 'general-conversation'
  | 'chapter-boundary-detect'
  | 'structure-enhancement'
  | 'long-text-analysis'
  | 'character-arc-extraction'
  | 'document-overview'
  | 'workspace-overview'
  | 'workspace-focused-analysis'
  | 'workspace-analysis'

export type ToolPermission =
  | 'workspace-read'
  | 'workspace-write'
  | 'model-invoke'
  | 'memory-read'
  | 'analysis-artifact-write'
  | 'analysis-artifact-read'

export interface ToolDefinition {
  name: string
  version: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  permission: ToolPermission
  sideEffects: TaskSideEffect[]
  timeoutMs: number
  cancellable: boolean
  auditFields: string[]
}

export interface SkillDefinition {
  name: SkillId
  version: string
  description: string
  allowedTools: string[]
  contextScope: 'none' | 'selected-documents' | 'workspace' | 'conversation'
  sideEffects: TaskSideEffect[]
  approvalPolicy: 'auto' | 'user-confirm'
  modelRequirements: 'none' | 'configured'
  failureAndRetry: string
}

export interface TaskCapabilities {
  agent: AgentId
  skill: SkillId
  allowedTools: string[]
}

const anyObject = { type: 'object' } as const
const anyArray = { type: 'array' } as const

const toolDefinitions: ToolDefinition[] = [
  {
    name: 'get_workspace_profile', version: '1.0.0', description: '获取不含正文和绝对路径的工作区画像',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, name: { type: 'string' }, directoryCount: { type: 'integer' }, fileCount: { type: 'integer' }, documentKindCounts: anyObject } },
    permission: 'workspace-read', sideEffects: ['read'], timeoutMs: 5_000, cancellable: false, auditFields: [],
  },
  {
    name: 'list_document_profiles', version: '1.0.0', description: '分页列出不含正文的文档画像',
    inputSchema: { type: 'object', properties: { cursor: { type: 'integer' }, limit: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { documents: anyArray, nextCursor: { type: ['integer', 'null'] } } },
    permission: 'workspace-read', sideEffects: ['read'], timeoutMs: 5_000, cancellable: false, auditFields: ['cursor', 'limit'],
  },
  {
    name: 'get_document_digest', version: '1.0.0', description: '读取与文档指纹绑定的已有摘要，不触发正文读取',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { status: { type: 'string' }, digestId: { type: ['string', 'null'] }, sourceFingerprint: { type: ['string', 'null'] } } },
    permission: 'analysis-artifact-read', sideEffects: ['read'], timeoutMs: 5_000, cancellable: false, auditFields: ['path'],
  },
  {
    name: 'get_project_digest', version: '1.0.0', description: '读取与工作区版本绑定的已有项目摘要，不触发正文读取',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { status: { type: 'string' }, digestId: { type: ['string', 'null'] }, coverage: { type: ['string', 'null'] } } },
    permission: 'analysis-artifact-read', sideEffects: ['read'], timeoutMs: 5_000, cancellable: false, auditFields: [],
  },
  {
    name: 'read_document', version: '1.0.0', description: '读取授权工作区内的规范化文本文件',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
    outputSchema: anyObject, permission: 'workspace-read', sideEffects: ['read'], timeoutMs: 10_000,
    cancellable: false, auditFields: ['path'],
  },
  {
    name: 'search_workspace', version: '1.0.0', description: '在授权工作区内搜索文本',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
    outputSchema: anyArray, permission: 'workspace-read', sideEffects: ['read'], timeoutMs: 15_000,
    cancellable: true, auditFields: ['query'],
  },
  {
    name: 'chunk_document', version: '1.0.0', description: '按结构和 token 预算生成可复用分块',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, maxTokens: { type: 'integer' }, overlapTokens: { type: 'integer' } } },
    outputSchema: anyObject, permission: 'workspace-read', sideEffects: ['read'], timeoutMs: 30_000,
    cancellable: true, auditFields: ['path', 'maxTokens', 'overlapTokens'],
  },
  {
    name: 'stream_chat', version: '1.0.0', description: '调用已配置的本地或兼容模型并流式返回结果',
    inputSchema: { type: 'object', required: ['requestId', 'profileId', 'sourcePolicy', 'messages'], properties: { requestId: { type: 'string' }, profileId: { type: 'string' }, sourcePolicy: { enum: ['metadata-only', 'local-excerpts', 'local-chunks'] }, messages: anyArray } },
    outputSchema: anyObject, permission: 'model-invoke', sideEffects: ['draft'], timeoutMs: 300_000,
    cancellable: true, auditFields: ['requestId', 'profileId'],
  },
  {
    name: 'create_document', version: '1.0.0', description: '创建用户可见的章节拆分文件',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
    outputSchema: anyObject, permission: 'workspace-write', sideEffects: ['proposal'], timeoutMs: 10_000,
    cancellable: false, auditFields: ['path'],
  },
  {
    name: 'create_directory', version: '1.0.0', description: '创建用户可见的章节拆分目录',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
    outputSchema: anyObject, permission: 'workspace-write', sideEffects: ['proposal'], timeoutMs: 10_000,
    cancellable: false, auditFields: ['path'],
  },
  {
    name: 'write_analysis_artifact', version: '1.0.0', description: '保存长文本分析的中间产物或报告',
    inputSchema: { type: 'object', required: ['jobId', 'name', 'content'], properties: { jobId: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } } },
    outputSchema: { type: 'string' }, permission: 'analysis-artifact-write', sideEffects: ['draft'], timeoutMs: 10_000,
    cancellable: false, auditFields: ['jobId', 'name'],
  },
  {
    name: 'read_analysis_artifact', version: '1.0.0', description: '读取可恢复长文本任务的中间产物',
    inputSchema: { type: 'object', required: ['jobId', 'name'], properties: { jobId: { type: 'string' }, name: { type: 'string' } } },
    outputSchema: { type: 'string' }, permission: 'analysis-artifact-read', sideEffects: ['read'], timeoutMs: 10_000,
    cancellable: false, auditFields: ['jobId', 'name'],
  },
  {
    name: 'list_analysis_jobs', version: '1.0.0', description: '列出当前工作区可恢复的分析任务',
    inputSchema: { type: 'object', properties: {} }, outputSchema: anyArray, permission: 'analysis-artifact-read',
    sideEffects: ['read'], timeoutMs: 10_000, cancellable: false, auditFields: [],
  },
  {
    name: 'search_project_memory', version: '1.0.0', description: '检索当前项目已确认的长期记忆',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, maxResults: { type: 'integer' } } },
    outputSchema: anyArray, permission: 'memory-read', sideEffects: ['read'], timeoutMs: 10_000,
    cancellable: false, auditFields: ['query'],
  },
]

const skillDefinitions: SkillDefinition[] = [
  {
    name: 'document-overview', version: '1.0.0', description: '仅依据文档画像和已有摘要进行概览，不读取正文',
    allowedTools: ['list_document_profiles', 'get_document_digest', 'stream_chat'], contextScope: 'selected-documents', sideEffects: ['draft'],
    approvalPolicy: 'auto', modelRequirements: 'configured', failureAndRetry: '摘要不可用时只报告结构元数据，不升级正文权限。',
  },
  {
    name: 'workspace-overview', version: '1.0.0', description: '仅依据工作区画像、文档画像和已有摘要进行项目概览',
    allowedTools: ['get_workspace_profile', 'list_document_profiles', 'get_project_digest'], contextScope: 'workspace', sideEffects: ['draft'],
    approvalPolicy: 'auto', modelRequirements: 'none', failureAndRetry: '索引或摘要不可用时降级为确定性清单概览，不升级正文权限。',
  },
  {
    name: 'workspace-focused-analysis', version: '1.0.0', description: '依据项目画像和少量高信号文件摘录快速回答项目性质与用途',
    allowedTools: ['get_workspace_profile', 'list_document_profiles', 'get_project_digest', 'read_document', 'stream_chat', 'search_project_memory'],
    contextScope: 'workspace', sideEffects: ['draft'], approvalPolicy: 'auto', modelRequirements: 'configured',
    failureAndRetry: '证据不足时明确覆盖范围并建议深度分析，不自动扩大读取目标。',
  },
  {
    name: 'general-conversation', version: '1.0.0', description: '普通对话和创作建议，不写入工作区',
    allowedTools: ['stream_chat', 'search_project_memory'], contextScope: 'conversation', sideEffects: ['draft'],
    approvalPolicy: 'auto', modelRequirements: 'configured', failureAndRetry: '模型错误可重试，不提交副作用。',
  },
  {
    name: 'chapter-boundary-detect', version: '1.0.0', description: '用确定性规则识别章节和场景边界并生成拆分提案',
    allowedTools: ['read_document', 'create_directory', 'create_document'], contextScope: 'selected-documents', sideEffects: ['proposal'],
    approvalPolicy: 'user-confirm', modelRequirements: 'none', failureAndRetry: '文件冲突时停止并要求用户选择新目录。',
  },
  {
    name: 'structure-enhancement', version: '1.0.0', description: '基于首轮拆分结果补充隐含结构和剧情阶段',
    allowedTools: ['read_document', 'stream_chat'], contextScope: 'selected-documents', sideEffects: ['draft'],
    approvalPolicy: 'auto', modelRequirements: 'configured', failureAndRetry: '保留首轮拆分结果，模型失败可从当前请求重试。',
  },
  {
    name: 'long-text-analysis', version: '1.0.0', description: '编排分块、Map、Reduce、Synthesis 和证据校验',
    allowedTools: ['read_document', 'chunk_document', 'stream_chat', 'write_analysis_artifact', 'read_analysis_artifact', 'list_analysis_jobs', 'search_project_memory'],
    contextScope: 'selected-documents', sideEffects: ['draft'], approvalPolicy: 'auto', modelRequirements: 'configured',
    failureAndRetry: '保留已完成产物，校验源指纹后从失败阶段恢复。',
  },
  {
    name: 'character-arc-extraction', version: '1.0.0', description: '提取人物目标、关系和变化并生成可审核报告',
    allowedTools: ['read_document', 'chunk_document', 'stream_chat', 'write_analysis_artifact', 'read_analysis_artifact', 'list_analysis_jobs', 'search_project_memory'], contextScope: 'selected-documents', sideEffects: ['draft'],
    approvalPolicy: 'auto', modelRequirements: 'configured', failureAndRetry: '模型失败时不写入结构化 canon，可重试分析。',
  },
  {
    name: 'workspace-analysis', version: '1.0.0', description: '扫描工作区并汇总跨文件结构、关系和证据',
    allowedTools: ['read_document', 'chunk_document', 'stream_chat', 'write_analysis_artifact', 'read_analysis_artifact', 'list_analysis_jobs', 'search_project_memory'],
    contextScope: 'workspace', sideEffects: ['draft'], approvalPolicy: 'auto', modelRequirements: 'configured',
    failureAndRetry: '排除不可读文件并保留已完成的任务产物。',
  },
]

const taskCapabilities: Record<TaskIntent, TaskCapabilities> = {
  'structure-segmentation': { agent: 'StructureSegmentation', skill: 'chapter-boundary-detect', allowedTools: ['read_document', 'create_directory', 'create_document'] },
  'structure-enhancement': { agent: 'StructureSegmentation', skill: 'structure-enhancement', allowedTools: ['read_document', 'stream_chat'] },
  'document-analysis': { agent: 'StoryDeconstruction', skill: 'long-text-analysis', allowedTools: ['read_document', 'chunk_document', 'stream_chat', 'write_analysis_artifact', 'read_analysis_artifact', 'list_analysis_jobs', 'search_project_memory'] },
  'character-analysis': { agent: 'StoryDeconstruction', skill: 'character-arc-extraction', allowedTools: ['read_document', 'chunk_document', 'stream_chat', 'write_analysis_artifact', 'read_analysis_artifact', 'list_analysis_jobs', 'search_project_memory'] },
  'workspace-analysis': { agent: 'StoryDeconstruction', skill: 'workspace-analysis', allowedTools: ['read_document', 'chunk_document', 'stream_chat', 'write_analysis_artifact', 'read_analysis_artifact', 'list_analysis_jobs', 'search_project_memory'] },
  'general-chat': { agent: 'GeneralConversation', skill: 'general-conversation', allowedTools: ['stream_chat', 'search_project_memory'] },
}

export function listToolDefinitions(): ToolDefinition[] {
  return toolDefinitions.map((tool) => ({ ...tool, sideEffects: [...tool.sideEffects], auditFields: [...tool.auditFields] }))
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  const tool = toolDefinitions.find((candidate) => candidate.name === name)
  return tool ? listToolDefinitions().find((candidate) => candidate.name === name) : undefined
}

export function listSkillDefinitions(): SkillDefinition[] {
  return skillDefinitions.map((skill) => ({ ...skill, allowedTools: [...skill.allowedTools], sideEffects: [...skill.sideEffects] }))
}

export function getSkillDefinition(name: string): SkillDefinition | undefined {
  const skill = skillDefinitions.find((candidate) => candidate.name === name)
  return skill ? listSkillDefinitions().find((candidate) => candidate.name === name) : undefined
}

export function getTaskCapabilities(intent: TaskIntent, analysisMode: AnalysisMode | null = null): TaskCapabilities {
  if (analysisMode === 'overview' && intent === 'workspace-analysis') {
    return { agent: 'StoryDeconstruction', skill: 'workspace-overview', allowedTools: ['get_workspace_profile', 'list_document_profiles', 'get_project_digest'] }
  }
  if (analysisMode === 'overview' && (intent === 'document-analysis' || intent === 'character-analysis')) {
    return { agent: 'StoryDeconstruction', skill: 'document-overview', allowedTools: ['list_document_profiles', 'get_document_digest', 'stream_chat'] }
  }
  if (analysisMode === 'focused' && intent === 'workspace-analysis') {
    return {
      agent: 'StoryDeconstruction',
      skill: 'workspace-focused-analysis',
      allowedTools: ['get_workspace_profile', 'list_document_profiles', 'get_project_digest', 'read_document', 'stream_chat', 'search_project_memory'],
    }
  }
  const value = taskCapabilities[intent]
  return { ...value, allowedTools: [...value.allowedTools] }
}
