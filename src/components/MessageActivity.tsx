import { Check, ChevronDown, ChevronRight, Clock, Copy, Download, FileText, Pause, ShieldAlert, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { readAnalysisArtifact } from '../lib/desktop'
import { historicalWorkerStatusLabels, processSections, taskStatusLabels, workerStageLabel } from '../lib/chatActivity'
import type { ChatActivity, ChatRunResult, ChatRunStatus } from '../types'
import { MarkdownContent } from './MarkdownContent'
import { downloadBytes } from './FilePreview'

const PAGE_SIZE = 50

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

  const traceRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  const [hasNewRecords, setHasNewRecords] = useState(false)
  const seenCount = useRef(items.length)
  const stopFollow = () => setPinned(false)
  const followLatest = () => {
    const container = traceRef.current?.closest<HTMLElement>('.message-stream') ?? null
    if (container) container.scrollTop = container.scrollHeight
  }
  const goLatest = () => {
    setPage(lastPage)
    setPinned(true)
    setHasNewRecords(false)
    requestAnimationFrame(followLatest)
  }
  useEffect(() => {
    const container = traceRef.current?.closest<HTMLElement>('.message-stream') ?? null
    if (!container) return
    const nearBottom = () => container.scrollHeight - container.scrollTop - container.clientHeight < 48
    const onScroll = () => {
      if (nearBottom()) { setPinned(true); setHasNewRecords(false) }
      else setPinned(false)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const grew = items.length > seenCount.current
    seenCount.current = items.length
    if (!grew || !active) return
    if (pinned && currentPage === lastPage) {
      followLatest()
      setHasNewRecords(false)
    } else {
      setHasNewRecords(true)
    }
  }, [items.length, pinned, currentPage, lastPage, active])
  if (!items.length && !active && !historyError) return null
  const open = (jobId: string, name: string) => setSelected({ jobId, name })
  const close = () => {
    if (typeof dialog.current?.close === 'function') dialog.current.close()
    else dialog.current?.removeAttribute('open')
    setSelected(null)
  }
  const elapsedLabel = elapsedSeconds >= 60
    ? `${Math.floor(elapsedSeconds / 60)} 分 ${elapsedSeconds % 60} 秒`
    : `${elapsedSeconds} 秒`
  const label = status === 'failed' ? taskStatusLabels.failed : status === 'cancelled' ? taskStatusLabels.cancelled
    : status === 'paused' ? taskStatusLabels.paused : status === 'stopping' ? taskStatusLabels.stopping
      : active ? taskStatusLabels.running : status === 'completed' ? `已完成 · ${elapsedLabel}`
        : completedAt ? '任务已结束，结果状态未记录' : '任务状态暂无法确认'
  const currentAction = (() => {
    if (currentWorker) return { title: workerStageLabel(currentWorker.stage), detail: currentWorker.message ?? undefined }
    if (runStatus === 'streaming' || lastItem?.status === 'streaming') return { title: lastItem?.message ?? '正在生成回答…' }
    if (lastItem?.message) return { title: lastItem.message }
    if (runStatus === 'sending') return { title: '正在发送…' }
    if (runStatus === 'fetching') return { title: '正在读取…' }
    return { title: '处理中' }
  })()
  const activityTitle = (item: ChatActivity) => item.message
    ?? (item.worker ? workerStageLabel(item.worker.stage) : item.segment?.label ?? '处理中')

  return <div className="execution-trace" ref={traceRef}>
    {taskDescription?.trim() && <div className="execution-prompt" aria-label="任务描述">
      <span aria-hidden="true">&gt;</span><span>{taskDescription.trim()}</span>
    </div>}
    <div className="execution-feedback">
      <div className="execution-task-summary" aria-label="任务状态">
        {hasFailure ? <ShieldAlert /> : status === 'paused' ? <Pause /> : active && status === 'running' ? <span className="execution-live-dot" aria-hidden="true" /> : status === 'completed' ? <Check /> : <Clock />}
        <span>处理过程</span><span>{label}</span><small>{items.length} 条记录</small>
      </div>
      <div className="execution-bulk-actions" aria-label="过程批量操作">
        <button type="button" aria-controls={disclosureId} onClick={() => { setSectionDefault(true); setSectionChoices({}) }}>展开全部过程</button>
        <button type="button" aria-controls={disclosureId} onClick={() => { setSectionDefault(false); setSectionChoices({}) }}>收起全部过程</button>
      </div>
      {active && <div className="execution-current" role="status">
        <strong className={status === 'running' ? 'execution-live-text' : undefined}>{currentAction.title}</strong>{currentAction.detail && <span>{currentAction.detail}</span>}
      </div>}
    </div>
    {incompleteHistory && <p className="execution-history-note">此过程包含旧版或缺失记录，历史可能不完整；未补造缺失步骤。</p>}
    {historyError && <p className="execution-history-note" role="alert">{historyError}</p>}
    {result?.error && <p className="execution-history-note" role="alert">{result.error.message}</p>}
    {active && items.length === 0 && <p className="execution-history-note">暂无可展示的过程记录</p>}
    {hasNewRecords && <button type="button" className="execution-new-records" onClick={goLatest}>有新记录 · 查看最新记录</button>}
    <div id={disclosureId}>
      {items.length > PAGE_SIZE && <nav className="execution-pagination" aria-label="过程记录分页">
        <button type="button" disabled={currentPage === 0} onClick={() => { stopFollow(); setPage(currentPage - 1) }}>上一页</button>
        <span>第 {offset + 1}–{Math.min(offset + PAGE_SIZE, items.length)} 条 / 共 {items.length} 条</span>
        <button type="button" disabled={currentPage === lastPage} onClick={() => { stopFollow(); setPage(currentPage + 1) }}>下一页</button>
        <button type="button" disabled={currentPage === lastPage} onClick={goLatest}>查看最新记录</button>
      </nav>}
      {sections.map((section) => {
        const visibleEntries = section.entries.filter(({ index }) => index >= offset && index < offset + PAGE_SIZE)
        const responses = section.entries.filter(({ item }) => item.response)
        if (!visibleEntries.length && !responses.length) return null
        const sectionOpen = sectionChoices[section.id] ?? sectionDefault
        const sectionId = `${disclosureId}-section-${section.entries[0].key}`
        return <section className="execution-segment" key={section.id} aria-label={section.label}>
          {visibleEntries.length > 0 && <>
            <button type="button" className="execution-toggle execution-segment-toggle" aria-expanded={sectionOpen} aria-controls={sectionId}
              onClick={() => { stopFollow(); setSectionChoices((current) => ({ ...current, [section.id]: !sectionOpen })) }}>
              {sectionOpen ? <ChevronDown /> : <ChevronRight />}
              <strong>{section.label}</strong><small>{section.entries.length} 条记录</small>
              {section.endedAt !== undefined && section.startedAt !== undefined && <small>已完成 · 耗时 {Math.max(0, Math.round((section.endedAt - section.startedAt) / 1000))} 秒</small>}
              <time dateTime={new Date(section.entries[0].item.timestamp).toISOString()}>{new Date(section.entries[0].item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
            </button>
            <div id={sectionId} hidden={!sectionOpen}>
              {!section.hasBoundary && <p className="execution-history-note">此记录未包含分段信息，按原始顺序展示。</p>}
              <ol className="execution-steps" start={visibleEntries[0].index + 1}>
                {visibleEntries.map(({ item, index, key }) => {
                  const worker = item.worker
                  const running = active && item === lastItem && (!worker || worker.status === 'running') && status === 'running'
                  const failed = worker?.status === 'failed' || worker?.cacheSource === 'quarantined'
                  const detailId = `${disclosureId}-event-${key}`
                  const detailOpen = details[key] ?? false
                  return <li key={key}>
                    <div className="execution-step-disclosure" data-open={detailOpen}>
                      <button type="button" className="execution-step-summary" aria-expanded={detailOpen} aria-controls={detailId}
                        onClick={() => { stopFollow(); setDetails((current) => ({ ...current, [key]: !detailOpen })) }}>
                        {failed ? <ShieldAlert className="warning" /> : running ? <span className="execution-live-dot small" aria-hidden="true" /> : worker?.status === 'paused' ? <Pause /> : worker?.status === 'completed' ? <Check /> : <Clock />}
                        <span className="execution-step-title"><strong>{index + 1}. {activityTitle(item)}</strong>
                          {worker && <span>{historicalWorkerStatusLabels[worker.status]}{!running ? '（当时）' : ''}</span>}
                          {worker && worker.total > 0 && <span>{Math.min(worker.completed, worker.total)} / {worker.total}</span>}
                          <time dateTime={new Date(item.timestamp).toISOString()}>{new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
                        </span>
                      </button>
                      <div id={detailId} className="execution-step-content" hidden={!detailOpen}>
                        {worker ? <p>{workerStageLabel(worker.stage)}</p> : item.message ? <p>{item.message}</p> : null}
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
      }}>{copied ? <Check /> : <Copy />}</button><button type="button" disabled={preview === null} title="导出产物" aria-label="导出产物" onClick={() => {
        if (preview === null) return
        downloadBytes(new TextEncoder().encode(preview), selected.name, 'text/plain;charset=utf-8')
      }}><Download /></button></footer>
    </dialog>}
  </div>
}
