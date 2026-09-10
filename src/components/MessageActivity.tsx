import { Check, ChevronDown, ChevronRight, Copy, FileText, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { readAnalysisArtifact } from '../lib/desktop'
import { workerStageLabel } from '../lib/chatActivity'
import type { ChatActivity } from '../types'
import { MarkdownContent } from './MarkdownContent'

export function MessageActivity({ items, active = false }: { items: ChatActivity[]; active?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<{ jobId: string; name: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const workers = items.filter((item) => item.worker)
  const lastItem = items.at(-1)
  const last = workers.at(-1)?.worker
  const hasFailure = workers.some((item) => item.worker?.status === 'failed')
  const hasCancelled = last?.status === 'cancelled'

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

  if (!items.length) return null
  const open = (jobId: string, name: string) => setSelected({ jobId, name })
  const close = () => {
    if (typeof dialog.current?.close === 'function') dialog.current.close()
    else dialog.current?.removeAttribute('open')
    setSelected(null)
  }
  const label = hasFailure ? '处理失败' : hasCancelled ? '已停止' : active ? '正在处理' : '处理记录'
  return <div className="execution-trace">
    <button className="execution-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? <ChevronDown /> : <ChevronRight />}
      {hasFailure ? <ShieldAlert /> : active ? <LoaderCircle className="spin" /> : <Check />}
      <span>{label}</span><small>{workers.length || items.length} 个工序</small>
    </button>
    {active && !expanded && lastItem && <div className="execution-current" role="status">
      {last ? workerStageLabel(last.stage) : lastItem.message ?? '正在准备请求'}
      {last && <span>{last.message}</span>}
    </div>}
    {expanded && <ol className="execution-steps">
      {items.map((item, index) => {
        const worker = item.worker
        const running = active && !item.completedAt && worker?.status !== 'paused'
        const failed = worker?.status === 'failed' || worker?.cacheSource === 'quarantined'
        return <li key={worker ? worker.jobId + worker.stage : item.timestamp + '-' + index}>
          {failed ? <ShieldAlert className="warning" /> : running ? <LoaderCircle className="spin" /> : <Check />}
          <div className="execution-step-content">
            <div className="execution-step-title"><strong>{worker ? workerStageLabel(worker.stage) : item.message ?? '准备请求'}</strong>
              {worker && worker.total > 0 && <span>{Math.min(worker.completed, worker.total)} / {worker.total}</span>}
              {item.completedAt && <time>{Math.max(0, Math.round((item.completedAt - item.timestamp) / 1000))} 秒</time>}
            </div>
            {worker && <p>{worker.message}</p>}
            {worker && worker.total > 0 && <progress aria-label={workerStageLabel(worker.stage)} max={worker.total} value={Math.min(worker.completed, worker.total)} />}
            {(!!item.cacheHits || !!item.modelRequests) && <small>
              {!!item.cacheHits && `已复用 ${item.cacheHits} 个结果`}
              {!!item.cacheHits && !!item.modelRequests && ' · '}
              {!!item.modelRequests && `模型请求 ${item.modelRequests} 次`}
            </small>}
            {item.artifacts?.map((name) => <button key={name} type="button" className="artifact-link" onClick={() => open(worker!.jobId, name)}>
              <FileText /><span>{name}</span>
            </button>)}
          </div>
        </li>
      })}
    </ol>}
    {last && <div className="execution-artifacts">
      <FileText /><span>中间产物保存在项目目录</span>
      <button type="button" onClick={() => open(last.jobId, 'worker-checkpoints.json')}>查看产物清单</button>
      <code>.vinkey/analysis/jobs/{last.jobId}/</code>
    </div>}
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
