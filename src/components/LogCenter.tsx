import {
  Activity, AlertCircle, Check, ChevronDown, ChevronRight, Copy,
  MessageSquareText, RefreshCw, Search, Trash2, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearTaskJobHistory, getLongTextWorkerOutput, listConversations,
  listTaskJobs, loadConversation,
} from '../lib/desktop'
import { normalizeServiceError, formatServiceError } from '../lib/serviceError'
import { useAppStore, type ChatRun } from '../store'
import type {
  ChatActivity, Conversation, LongTextWorkerOutput, ServiceError,
  TaskJob, TaskMessageRef,
} from '../types'

type LogFilter = 'all' | 'running' | 'failed' | 'completed'
type LogStatus = TaskJob['status']

export interface ConversationLogEntry {
  id: string
  kind: 'conversation' | 'background'
  status: LogStatus
  title: string
  conversationId: string | null
  conversationTitle: string
  sourceMessageId: string | null
  createdAt: number
  updatedAt: number
  failure: ServiceError | null
  activityLog: ChatActivity[]
  resultExcerpt: string
  taskRef: TaskMessageRef | null
  job: TaskJob | null
}

const statusLabels: Record<LogStatus, string> = {
  planned: '等待中', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消',
}

const activityLabels: Record<ChatActivity['status'], string> = {
  sending: '提交请求', thinking: '理解请求', fetching: '读取资料', tool_calling: '执行流程', streaming: '生成回答', stopping: '停止请求',
}

function stepLabel(stepId: string): string {
  if (stepId === 'chunking') return '文档分块'
  if (stepId === 'map') return '逐块分析'
  if (stepId === 'chapter') return '章节汇总'
  if (stepId === 'volume') return '卷级汇总'
  if (stepId === 'synthesis') return '最终综合'
  if (stepId === 'evidence') return '证据校验'
  if (stepId.startsWith('reduce-')) return `第 ${stepId.slice(7)} 层归并`
  return stepId
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    'task.started': '任务已启动', 'task.resumed': '任务已恢复', 'task.paused': '任务已暂停',
    'task.failed': '任务执行失败', 'task.cancelled': '任务已取消', 'task.completed': '任务已完成',
    'worker.paused': '后台流程已暂停', 'worker.resumed': '后台流程已恢复', 'step.completed': '步骤已完成',
    'step.started': '步骤已开始', 'step.failed': '步骤执行失败', 'step.retry_requested': '步骤已请求重试',
    'worker.step_retry_requested': '步骤已请求重试', 'worker.completed': '后台流程已完成', 'worker.failed': '后台流程执行失败',
    'worker.restore_failed': '后台流程恢复失败', 'worker.cache_recovered': '已恢复缓存产物',
  }
  return labels[eventType] ?? eventType
}

function compactText(value: string, limit = 120): string {
  const text = value.replace(/[`#>*_~-]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function legacyRunResult(content: string): { status: LogStatus; failure: ServiceError | null } {
  const failure = content.match(/任务未完成：([^\n]+)/u)?.[1]?.trim()
  if (failure) return { status: 'failed', failure: normalizeServiceError(failure) }
  if (content.includes('任务已停止，已完成的产物仍保留')) return { status: 'cancelled', failure: null }
  return { status: 'completed', failure: null }
}

function conversationEntries(conversation: Conversation, jobSourceMessages: Set<string>): ConversationLogEntry[] {
  const entries: ConversationLogEntry[] = []
  let sourceMessage: Conversation['messages'][number] | null = null
  for (const message of conversation.messages) {
    if (message.role === 'user') {
      sourceMessage = message
      continue
    }
    if (message.role !== 'assistant' || !sourceMessage) continue
    if (jobSourceMessages.has(sourceMessage.id)) {
      sourceMessage = null
      continue
    }
    const activityLog = message.activityLog ?? []
    if (activityLog.length === 0 && !message.runResult) {
      sourceMessage = null
      continue
    }
    const legacy = legacyRunResult(message.content)
    const status = message.runResult?.status ?? legacy.status
    const failure = message.runResult?.error ?? legacy.failure
    entries.push({
      id: `conversation:${conversation.id}:${message.id}`,
      kind: 'conversation',
      status,
      title: compactText(sourceMessage.content, 72) || '对话请求',
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceMessageId: sourceMessage.id,
      createdAt: sourceMessage.createdAt,
      updatedAt: message.completedAt ?? message.createdAt,
      failure: failure ?? null,
      activityLog,
      resultExcerpt: compactText(message.content),
      taskRef: sourceMessage.taskRef ?? null,
      job: null,
    })
    sourceMessage = null
  }
  return entries
}

function jobEntry(job: TaskJob): ConversationLogEntry {
  return {
    id: `job:${job.taskId}`,
    kind: 'background',
    status: job.status,
    title: job.displayTitle || (job.taskType === 'long-text-analysis' ? '长文本分析' : job.taskType),
    conversationId: job.conversationId ?? null,
    conversationTitle: job.conversationTitleSnapshot || '独立运行',
    sourceMessageId: job.sourceMessageId ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    failure: job.failure ?? (job.error ? normalizeServiceError(job.error) : null),
    activityLog: [],
    resultExcerpt: '',
    taskRef: null,
    job,
  }
}

function liveEntry(run: ChatRun): ConversationLogEntry {
  return {
    id: `live:${run.requestId}`,
    kind: 'conversation',
    status: 'running',
    title: compactText(run.userMessage.content, 72) || '对话请求',
    conversationId: run.conversationId,
    conversationTitle: run.conversationTitle,
    sourceMessageId: run.userMessage.id,
    createdAt: run.userMessage.createdAt,
    updatedAt: run.activityLog.at(-1)?.timestamp ?? run.userMessage.createdAt,
    failure: null,
    activityLog: run.activityLog,
    resultExcerpt: compactText(run.assistantMessage.content),
    taskRef: run.userMessage.taskRef ?? null,
    job: null,
  }
}

export function buildConversationLogEntries(
  conversations: Conversation[],
  jobs: TaskJob[],
  liveRuns: ChatRun[] = [],
): ConversationLogEntry[] {
  const jobSourceMessages = new Set(jobs.flatMap((job) => job.sourceMessageId ? [job.sourceMessageId] : []))
  const jobIds = new Set(jobs.map((job) => job.taskId))
  const liveSourceMessageIds = new Set(liveRuns.filter((run) => !run.taskJobId || !jobIds.has(run.taskJobId)).map((run) => run.userMessage.id))
  const historical = conversations.flatMap((conversation) => conversationEntries(conversation, jobSourceMessages))
    .filter((entry) => !liveSourceMessageIds.has(entry.sourceMessageId ?? ''))
  const live = liveRuns.filter((run) => !run.taskJobId || !jobIds.has(run.taskJobId)).map(liveEntry)
  return [...jobs.map(jobEntry), ...live, ...historical].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function logDiagnosticsText(entry: ConversationLogEntry): string {
  const lines = [
    `运行：${entry.title}`,
    `记录 ID：${entry.job?.taskId ?? entry.id}`,
    `状态：${statusLabels[entry.status]}`,
    `对话：${entry.conversationTitle}`,
  ]
  if (entry.job) {
    lines.push(`项目：${entry.job.workspaceNameSnapshot || entry.job.workspaceId}`)
    lines.push(`执行模型：${[entry.job.modelNameSnapshot, entry.job.connectionNameSnapshot].filter(Boolean).join(' · ') || '来源未知'}`)
  }
  if (entry.failure) lines.push(`失败：${entry.failure.code} · ${entry.failure.message}`)
  const events = entry.job
    ? entry.job.events.slice(-50).map((event) => `${new Date(event.timestamp).toLocaleString('zh-CN')} · ${eventLabel(event.eventType)}${event.stepId ? ` · ${stepLabel(event.stepId)}` : ''}`)
    : entry.activityLog.slice(-50).map((activity) => `${new Date(activity.timestamp).toLocaleString('zh-CN')} · ${activity.message || activityLabels[activity.status]}`)
  lines.push('', '运行过程：', ...events)
  return lines.join('\n')
}

async function loadRecentConversations(workspaceId: string): Promise<Conversation[]> {
  const summaries = (await listConversations(workspaceId)).slice(0, 50)
  const conversations: Conversation[] = []
  for (let index = 0; index < summaries.length; index += 8) {
    const batch = summaries.slice(index, index + 8)
    conversations.push(...await Promise.all(batch.map((item) => loadConversation(item.id, workspaceId))))
  }
  return conversations
}

export function LogCenter({ onOpenSource }: {
  onOpenSource: (conversationId: string, sourceMessageId?: string | null) => Promise<void>
}) {
  const workspace = useAppStore((state) => state.workspace)
  const chatRuns = useAppStore((state) => state.chatRuns)
  const conversationSummaries = useAppStore((state) => state.conversations)
  const setError = useAppStore((state) => state.setError)
  const [jobs, setJobs] = useState<TaskJob[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<LogFilter>('all')
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, LongTextWorkerOutput>>({})
  const [outputLoading, setOutputLoading] = useState<Record<string, boolean>>({})
  const [outputErrors, setOutputErrors] = useState<Record<string, string>>({})
  const [clearingHistory, setClearingHistory] = useState(false)
  const outputRequests = useRef(new Set<string>())
  const conversationVersion = conversationSummaries.map((item) => `${item.id}:${item.updatedAt}`).join('|')

  const refreshJobs = useCallback(async () => {
    if (!workspace) { setJobs([]); return }
    try { setJobs(await listTaskJobs()) } catch (error) { setError(formatServiceError(error)) }
  }, [setError, workspace])

  const refreshConversations = useCallback(async () => {
    if (!workspace) { setConversations([]); return }
    try { setConversations(await loadRecentConversations(workspace.id)) } catch (error) { setError(formatServiceError(error)) }
  }, [setError, workspace])

  const refresh = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    await Promise.all([refreshJobs(), refreshConversations()])
    setLoading(false)
  }, [refreshConversations, refreshJobs, workspace])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refreshJobs(), 2_500)
    return () => window.clearInterval(timer)
  }, [refresh, refreshJobs])

  useEffect(() => { if (workspace) void refreshConversations() }, [conversationVersion, refreshConversations, workspace])

  useEffect(() => {
    setExpanded(null)
    setFilter('all')
    setQuery('')
    setOutputs({})
    setOutputErrors({})
    outputRequests.current.clear()
  }, [workspace?.id])

  const entries = useMemo(
    () => buildConversationLogEntries(conversations, jobs, Object.values(chatRuns)),
    [chatRuns, conversations, jobs],
  )
  const counts = useMemo(() => ({
    all: entries.length,
    running: entries.filter((entry) => ['planned', 'running', 'paused'].includes(entry.status)).length,
    failed: entries.filter((entry) => entry.status === 'failed').length,
    completed: entries.filter((entry) => entry.status === 'completed').length,
  }), [entries])
  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
    return entries.filter((entry) => {
      const statusMatches = filter === 'all'
        || (filter === 'running' && ['planned', 'running', 'paused'].includes(entry.status))
        || entry.status === filter
      if (!statusMatches) return false
      if (!normalizedQuery) return true
      return [entry.title, entry.conversationTitle, entry.failure?.message, entry.failure?.code]
        .some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    })
  }, [entries, filter, query])
  const hasTaskHistory = jobs.some((job) => ['completed', 'failed', 'cancelled'].includes(job.status))

  const copyDiagnostics = async (entry: ConversationLogEntry) => {
    try {
      await navigator.clipboard.writeText(logDiagnosticsText(entry))
      setCopiedId(entry.id)
      window.setTimeout(() => setCopiedId((current) => current === entry.id ? null : current), 1_800)
    } catch { setError('复制运行诊断信息失败') }
  }

  const clearHistory = async () => {
    if (!hasTaskHistory || clearingHistory) return
    if (!window.confirm('清除当前项目中已完成、失败和已取消的后台任务记录？对话运行记录和分析产物会保留。')) return
    setClearingHistory(true)
    try {
      const removed = await clearTaskJobHistory()
      setExpanded(null)
      await refreshJobs()
      if (removed === 0) setError('没有可清除的后台任务记录')
    } catch (error) { setError(formatServiceError(error)) } finally { setClearingHistory(false) }
  }

  const loadOutput = useCallback(async (jobId: string) => {
    if (outputs[jobId] || outputRequests.current.has(jobId)) return
    outputRequests.current.add(jobId)
    setOutputLoading((current) => ({ ...current, [jobId]: true }))
    setOutputErrors((current) => ({ ...current, [jobId]: '' }))
    try {
      const output = await getLongTextWorkerOutput(jobId)
      if (!output) throw new Error('运行结果尚未完成或已经失效')
      setOutputs((current) => ({ ...current, [jobId]: output }))
    } catch (error) {
      setOutputErrors((current) => ({ ...current, [jobId]: formatServiceError(error) }))
    } finally {
      outputRequests.current.delete(jobId)
      setOutputLoading((current) => ({ ...current, [jobId]: false }))
    }
  }, [outputs])

  useEffect(() => {
    if (!expanded) return
    const entry = entries.find((item) => item.id === expanded)
    const job = entry?.job
    if (job?.status === 'completed' && !outputs[job.taskId] && !outputErrors[job.taskId]) void loadOutput(job.taskId)
  }, [entries, expanded, loadOutput, outputErrors, outputs])

  if (!workspace) return <div className="log-center-empty"><AlertCircle /><strong>未打开项目</strong></div>

  const filters: Array<{ id: LogFilter; label: string }> = [
    { id: 'all', label: `全部 ${counts.all}` },
    { id: 'running', label: `运行 ${counts.running}` },
    { id: 'failed', label: `失败 ${counts.failed}` },
    { id: 'completed', label: `完成 ${counts.completed}` },
  ]

  return <section className="log-center" aria-label="日志中心">
    <header className="log-center-toolbar">
      <div className="log-filter" role="tablist" aria-label="日志状态筛选">
        {filters.map((item) => <button key={item.id} role="tab" aria-selected={filter === item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
      <div className="log-center-toolbar-actions">
        <label className="log-search"><Search /><input aria-label="搜索运行日志" placeholder="搜索对话、请求或错误" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" title="清除搜索" aria-label="清除搜索" onClick={() => setQuery('')}><X /></button>}</label>
        <button className="secondary-button danger-action" onClick={() => void clearHistory()} disabled={!hasTaskHistory || loading || clearingHistory} title="仅清理后台任务记录"><Trash2 />{clearingHistory ? '正在清理...' : '清理任务记录'}</button>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading || clearingHistory}><RefreshCw className={loading ? 'spin' : ''} />刷新</button>
      </div>
    </header>
    <div className="log-list">
      {visibleEntries.length > 0 && <div className="log-list-header" role="row">
        <span>运行记录</span><span>状态</span><span>更新时间</span><span>来源对话</span>
      </div>}
      {entries.length === 0 && <div className="log-center-empty"><Activity /><strong>暂无对话运行记录</strong></div>}
      {entries.length > 0 && visibleEntries.length === 0 && <div className="log-center-empty"><Search /><strong>没有匹配的运行记录</strong></div>}
      {visibleEntries.map((entry) => {
        const job = entry.job
        const output = job ? outputs[job.taskId] : null
        const expandedEntry = expanded === entry.id
        return <article className={`log-row status-${entry.status}`} key={entry.id}>
          <button className="log-row-toggle" onClick={() => setExpanded(expandedEntry ? null : entry.id)} aria-expanded={expandedEntry}>
            {expandedEntry ? <ChevronDown /> : <ChevronRight />}
            <span title={entry.title}><strong>{entry.title}</strong><small>{entry.kind === 'background' ? '后台任务' : '对话运行'} · {entry.conversationTitle}</small></span>
          </button>
          <span className={`log-status status-${entry.status}`}>{statusLabels[entry.status]}</span>
          <time>{new Date(entry.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
          <div className="log-row-actions">
            {entry.conversationId && <button title="打开来源对话" onClick={() => void onOpenSource(entry.conversationId!, entry.sourceMessageId)}><MessageSquareText /><span>打开对话</span></button>}
          </div>
          {expandedEntry && <div className="log-detail">
            <div className="log-metadata">
              <span>类型：{entry.kind === 'background' ? '后台任务' : '对话请求'}</span>
              <span>对话：{entry.conversationTitle}</span>
              {entry.taskRef && <span>意图：{entry.taskRef.intent} · 范围：{entry.taskRef.scope}</span>}
              {job && <span>执行模型：{job.modelNameSnapshot || '来源未知'}{job.connectionNameSnapshot ? ` · ${job.connectionNameSnapshot}` : ''}</span>}
              <span className="log-id">记录 ID：{job?.taskId ?? entry.id}</span>
            </div>
            {entry.failure && <div className="log-failure"><AlertCircle /><span><strong>{entry.failure.code}</strong><small>{entry.failure.message}</small></span><b>{entry.failure.retryable ? '可重试' : '需重新发起'}</b></div>}
            {job && job.steps.length > 0 && <ol className="log-steps">{job.steps.map((step) => <li key={step.id} className={`status-${step.status}`}><i /><span><strong>{stepLabel(step.id)}</strong><small>第 {step.attempt} 次 · {step.checkpoint ?? '无检查点'}</small></span></li>)}</ol>}
            <section className="log-events" aria-label="运行过程"><strong>运行过程</strong><ol>
              {job
                ? (job.events.length === 0 ? <li><span>暂无运行事件</span></li> : job.events.slice(-50).map((event) => <li key={event.sequence}><time>{new Date(event.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time><span>{eventLabel(event.eventType)}</span>{event.stepId && <code>{stepLabel(event.stepId)}</code>}</li>))
                : (entry.activityLog.length === 0 ? <li><span>暂无活动轨迹</span></li> : entry.activityLog.map((activity, index) => <li key={`${activity.timestamp}-${index}`}><time>{new Date(activity.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time><span>{activity.message || activityLabels[activity.status]}</span>{activity.completedAt && <code>{Math.max(0, Math.round((activity.completedAt - activity.timestamp) / 1000))} 秒</code>}</li>))}
            </ol></section>
            {!job && entry.resultExcerpt && <div className="log-result"><strong>结果摘要</strong><p>{entry.resultExcerpt}</p></div>}
            {job?.status === 'completed' && outputLoading[job.taskId] && <div className="log-output-state" role="status"><RefreshCw className="spin" /><span>正在读取分析产物</span></div>}
            {job?.status === 'completed' && outputErrors[job.taskId] && !outputLoading[job.taskId] && <div className="log-output-state error" role="alert"><AlertCircle /><span><strong>分析产物读取失败</strong><small>{outputErrors[job.taskId]}</small></span><button onClick={() => void loadOutput(job.taskId)}><RefreshCw />重新加载</button></div>}
            {output && <div className="log-output">
              <strong>分析产物</strong>
              <div><span>模型调用 {output.modelInvocationCount}</span><span>跨任务命中 {output.stageCacheHits}</span><span>任务内命中 {output.jobCheckpointHits}</span><span>耗时 {(output.durationMs / 1000).toFixed(1)} 秒</span></div>
              <small>中间产物：.vinkey/analysis/jobs/{job!.taskId}/</small>
              <pre>{output.content}</pre>
            </div>}
            <div className="log-detail-actions">
              {entry.conversationId && <button onClick={() => void onOpenSource(entry.conversationId!, entry.sourceMessageId)}><MessageSquareText />回到来源对话</button>}
              <button title={copiedId === entry.id ? '诊断摘要已复制' : '复制诊断摘要'} onClick={() => void copyDiagnostics(entry)}>{copiedId === entry.id ? <Check /> : <Copy />}{copiedId === entry.id ? '已复制' : '复制诊断摘要'}</button>
            </div>
          </div>}
        </article>
      })}
    </div>
  </section>
}
