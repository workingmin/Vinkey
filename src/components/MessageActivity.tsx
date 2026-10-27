import { Check, ChevronDown, ChevronRight, Clock, Copy, FileText, Pause, ShieldAlert, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { readAnalysisArtifact } from '../lib/desktop'
import { processSections, workerStageLabel } from '../lib/chatActivity'
import type { ChatActivity, ChatRunResult, ChatRunStatus } from '../types'
import { MarkdownContent } from './MarkdownContent'

const PAGE_SIZE = 50
const workerStatusLabels = { running: '执行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消' }

export function MessageActivity({ items, active = false, taskDescription, result, runStatus, completedAt, historyError }: {
  items: ChatActivity[]
  active?: boolean
  taskDescription?: string | null
  result?: ChatRunResult | null
  runStatus?: ChatRunStatus
  completedAt?: number
  historyError?: string
}) {
  // Two disclosure levels: runtime segment, then individual activity details.
  // Task-wide controls only update the section choices; they add no container.
  const [sectionDefault, setSectionDefault] = useState(active)
  const [sectionChoices, setSectionChoices] = useState<Record<string, boolean>>({})
  const sections = useMemo(() => processSections(items), [items])
  const [details, setDetails] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(0)
  const disclosureId = useId()
  const [selected, setSelected] = useState<{ jobId: string; name: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const lastItem = items.at(-1)
  const last = items.filter((item) => item.worker).at(-1)?.worker
  const currentWorker = lastItem?.worker
  const status = active
    ? runStatus === 'stopping' ? 'stopping' : currentWorker?.status === 'paused' ? 'paused'
      : currentWorker?.status === 'failed' ? 'failed' : currentWorker?.status === 'cancelled' ? 'cancelled' : 'running'
    : result?.status ?? (currentWorker?.stage === 'lifecycle' || currentWorker?.status !== 'completed'
      ? currentWorker?.status : undefined)
  const hasFailure = status === 'failed'
  const startedAt = items[0]?.timestamp
  const finishedAt = completedAt ?? items.reduce((latest, item) => Math.max(latest, item.completedAt ?? item.timestamp), startedAt ?? 0)
  const elapsedSeconds = startedAt === undefined ? 0 : Math.max(0, Math.round((finishedAt - startedAt) / 1000))
  const lastPage = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const offset = currentPage * PAGE_SIZE
  const incompleteHistory = useMemo(() => {
    const sequences = new Map<string, number>()
    for (const item of items) {
      if (!item.id) return true
      if (!item.worker) continue
      const previous = sequences.get(item.worker.jobId) ?? 0
      if (item.worker.sequence !== previous + 1) return true
      sequences.set(item.worker.jobId, item.worker.sequence)
    }
    return false
  }, [items])

  useEffect(() => {
    if (!selected) return
    let disposed = false
    setPreview(null)
    setError(null)
    setCopied(false)
    if (typeof dialog.current?.showModal === 'function') dialog.current.showModal()
    else dialog.current?.setAttribute('open', '')
    void readAnalysisArtifact(selected.jobId, selected.name).then((text) => {
      if (!disposed) {
        if (text === null) setError('该产物尚未生成或已失效。')
        else setPreview(text)
      }
    }).catch((reason: unknown) => { if (!disposed) setError(String(reason)) })
    return () => { disposed = true }
  }, [selected])

  if (!items.length && !historyError) return null
  const open = (jobId: string, name: string) => setSelected({ jobId, name })
  const close = () => {
    if (typeof dialog.current?.close === 'function') dialog.current.close()
    else dialog.current?.removeAttribute('open')
    setSelected(null)
  }
  const elapsedLabel = elapsedSeconds >= 60
    ? `${Math.floor(elapsedSeconds / 60)} 分 ${elapsedSeconds % 60} 秒`
    : `${elapsedSeconds} 秒`
  const label = status === 'failed' ? '处理失败' : status === 'cancelled' ? '已停止'
    : status === 'paused' ? '已暂停' : status === 'stopping' ? '正在停止'
      : active ? '正在处理' : status === 'completed' ? `已完成 · ${elapsedLabel}`
        : completedAt ? '执行已结束 · 结果状态未记录' : '执行状态待确认'
  const currentLabel = currentWorker ? workerStageLabel(currentWorker.stage) : lastItem?.message ?? '正在准备请求'

  return <div className="execution-trace">
    {taskDescription?.trim() && <div className="execution-prompt" aria-label="任务描述">
      <span aria-hidden="true">&gt;</span><span>{taskDescription.trim()}</span>
    </div>}
    <div className="execution-feedback">
      <div className="execution-task-summary" aria-label="任务状态">
        {hasFailure ? <ShieldAlert /> : status === 'paused' ? <Pause /> : active && status === 'running' ? <span className="execution-live-dot" aria-hidden="true" /> : status === 'completed' ? <Check /> : <Clock />}
        <span>任务反馈</span><span>{label}</span><small>{items.length} 条记录</small>
      </div>
      <div className="execution-bulk-actions" aria-label="过程批量操作">
        <button type="button" aria-controls={disclosureId} onClick={() => { setSectionDefault(true); setSectionChoices({}) }}>展开全部过程</button>
        <button type="button" aria-controls={disclosureId} onClick={() => { setSectionDefault(false); setSectionChoices({}) }}>收起全部过程</button>
      </div>
      {active && lastItem && <div className="execution-current" role="status">
        <strong className={status === 'running' ? 'execution-live-text' : undefined}>{currentLabel}</strong><span>{currentWorker?.message ?? lastItem.message ?? '正在准备请求'}</span>
      </div>}
    </div>
    {incompleteHistory && <p className="execution-history-note">此过程包含旧版或缺失记录，历史可能不完整；未补造缺失步骤。</p>}
    {historyError && <p className="execution-history-note" role="alert">{historyError}</p>}
    {result?.error && <p className="execution-history-note" role="alert">{result.error.message}</p>}
    <div id={disclosureId}>
      {items.length > PAGE_SIZE && <nav className="execution-pagination" aria-label="过程记录分页">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span>第 {offset + 1}–{Math.min(offset + PAGE_SIZE, items.length)} 条 / 共 {items.length} 条</span>
        <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>下一页</button>
        <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(lastPage)}>查看最新记录</button>
      </nav>}
      {sections.map((section) => {
        const visibleEntries = section.entries.filter(({ index }) => index >= offset && index < offset + PAGE_SIZE)
        const responses = section.entries.filter(({ item }) => item.response)
        if (!visibleEntries.length && !responses.length) return null
        const sectionOpen = sectionChoices[section.id] ?? sectionDefault
        const sectionId = `${disclosureId}-section-${section.entries[0].key}`
        const latest = section.entries.at(-1)!.item
        const segmentSeconds = section.startedAt !== undefined && latest.completedAt !== undefined
          ? Math.max(0, Math.round((latest.completedAt - section.startedAt) / 1000)) : null
        return <section className="execution-segment" key={section.id} aria-label={section.label}>
          {visibleEntries.length > 0 && <>
            <button type="button" className="execution-toggle execution-segment-toggle" aria-expanded={sectionOpen} aria-controls={sectionId}
              onClick={() => setSectionChoices((current) => ({ ...current, [section.id]: !sectionOpen }))}>
              {sectionOpen ? <ChevronDown /> : <ChevronRight />}
              <strong>{section.label}</strong><small>{section.entries.length} 条记录</small>
              {latest.worker && <small>最近记录：{workerStatusLabels[latest.worker.status]}</small>}
              {segmentSeconds !== null && <small>耗时 {segmentSeconds} 秒</small>}
              <time dateTime={new Date(section.entries[0].item.timestamp).toISOString()}>{new Date(section.entries[0].item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
            </button>
            <div id={sectionId} hidden={!sectionOpen}>
              {!section.hasBoundary && <p className="execution-history-note">按原始顺序展示，未推测执行轮次。</p>}
              <ol className="execution-steps" start={visibleEntries[0].index + 1}>
                {visibleEntries.map(({ item, index, key }) => {
                  const worker = item.worker
                  const running = active && item === lastItem && (!worker || worker.status === 'running') && status === 'running'
                  const failed = worker?.status === 'failed' || worker?.cacheSource === 'quarantined'
                  const detailId = `${disclosureId}-event-${key}`
                  const detailOpen = details[key] ?? false
                  const historicalStatus = worker ? workerStatusLabels[worker.status] : item.completedAt ? '阶段记录' : '处理中'
                  return <li key={key}>
                    <div className="execution-step-disclosure" data-open={detailOpen}>
                      <button type="button" className="execution-step-summary" aria-expanded={detailOpen} aria-controls={detailId}
                        onClick={() => setDetails((current) => ({ ...current, [key]: !detailOpen }))}>
                        {failed ? <ShieldAlert className="warning" /> : running ? <span className="execution-live-dot small" aria-hidden="true" /> : worker?.status === 'paused' ? <Pause /> : worker?.status === 'completed' ? <Check /> : <Clock />}
                        <span className="execution-step-title"><strong>{index + 1}. {item.message ?? (worker ? workerStageLabel(worker.stage) : '准备请求')}</strong>
                          <span>{historicalStatus}{worker && !running ? '（当时）' : ''}</span>
                          {worker && worker.total > 0 && <span>{Math.min(worker.completed, worker.total)} / {worker.total}</span>}
                          <time dateTime={new Date(item.timestamp).toISOString()}>{new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
                        </span>
                      </button>
                      <div id={detailId} className="execution-step-content" hidden={!detailOpen}>
                        <p>{worker ? workerStageLabel(worker.stage) : item.message ?? '准备请求'}</p>
                        {!worker && item.completedAt && <p>耗时 {Math.max(0, Math.round((item.completedAt - item.timestamp) / 1000))} 秒</p>}
                        {worker && worker.total > 0 && <progress aria-label={workerStageLabel(worker.stage)} max={worker.total} value={Math.min(worker.completed, worker.total)} />}
                        {(!!item.cacheHits || !!item.modelRequests) && <small>
                          {!!item.cacheHits && `已复用 ${item.cacheHits} 个结果`}
                          {!!item.cacheHits && !!item.modelRequests && ' · '}
                          {!!item.modelRequests && `模型请求 ${item.modelRequests} 次`}
                        </small>}
                        {worker && item.artifacts?.map((name) => <button key={name} type="button" className="artifact-link" onClick={() => open(worker.jobId, name)}>
                          <FileText /><span>{name}</span>
                        </button>)}
                      </div>
                    </div>
                  </li>
                })}
              </ol>
            </div>
          </>}
          {responses.map(({ item, key }) => <div className="execution-segment-result" key={`response:${key}`} aria-label="本段响应">
            <MarkdownContent content={item.response!} />
          </div>)}
        </section>
      })}
      {last && <div className="execution-artifacts">
        <FileText /><span>中间产物保存在项目目录</span>
        <button type="button" onClick={() => open(last.jobId, 'worker-checkpoints.json')}>查看产物清单</button>
        <code>.vinkey/analysis/jobs/{last.jobId}/</code>
      </div>}
    </div>
    {selected && <dialog ref={dialog} className="artifact-dialog" onCancel={close} aria-label="分析产物预览">
      <header><FileText /><strong>{selected.name}</strong>
        <button type="button" aria-label="关闭产物预览" title="关闭" onClick={close}><X /></button>
      </header>
      <div className="artifact-preview">
        {error ? <p role="alert">{error}</p> : preview === null ? <p role="status">正在读取产物...</p>
          : selected.name.endsWith('.json') ? <pre>{preview}</pre> : <MarkdownContent content={preview} />}
      </div>
      <footer><span>只读产物</span><button type="button" disabled={preview === null} title="复制产物" aria-label="复制产物" onClick={() => {
        void navigator.clipboard.writeText(preview ?? '').then(() => setCopied(true)).catch(() => setError('复制失败'))
      }}>{copied ? <Check /> : <Copy />}</button></footer>
    </dialog>}
  </div>
}
