import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import type { ConversationSummary, ProjectSummary } from '../types'

export function RecordDeletionDialog({ project, conversation, sessionCount, onCancel, onConfirm }: {
  project: ProjectSummary
  conversation?: ConversationSummary
  sessionCount?: number
  onCancel: () => void
  onConfirm: (confirmation: string) => Promise<void>
}) {
  const [step, setStep] = useState(1)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const submitLock = useRef(false)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { previous?.focus() }
  }, [])

  const submit = async () => {
    if (submitLock.current || (!conversation && (step !== 2 || confirmation !== project.name))) return
    submitLock.current = true
    setBusy(true)
    setError(null)
    try { await onConfirm(confirmation) }
    catch (cause) { setError(String(cause)) }
    finally { submitLock.current = false; setBusy(false) }
  }

  return createPortal(<dialog ref={dialog} className="record-deletion-dialog" aria-labelledby="record-deletion-title" aria-describedby="record-deletion-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); if (!conversation && step === 1) setStep(2); else void submit() }}>
      <header><Trash2 /><h2 id="record-deletion-title">{conversation ? '删除会话记录' : step === 1 ? '删除项目记录' : '确认删除项目'}</h2><button className="icon-button" type="button" title="关闭" aria-label="关闭删除确认" disabled={busy} onClick={onCancel}><X /></button></header>
      <div className="record-deletion-body">
        <strong>{conversation?.title ?? project.name}</strong><p className="deletion-project-path">{project.pathLabel}</p>
        <p id="record-deletion-description">{conversation ? `将删除此会话及其 ${conversation.messageCount} 条消息记录。` : `将从项目列表移除此项目，并删除${sessionCount === undefined ? '其全部' : `其 ${sessionCount} 个`}已保存会话及消息记录。`}此操作无法撤销。项目目录中的文件、附件和旧数据库均保留。</p>
        {!conversation && step === 2 && <label className="deletion-confirmation-label">输入项目名称 <b>{project.name}</b> 以确认删除<input autoFocus aria-label="确认项目名称" autoComplete="off" spellCheck={false} disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
        {error && <p className="deletion-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" disabled={busy} onClick={onCancel}>取消</button>{!conversation && step === 1 ? <button className="danger-button" type="submit">继续删除</button> : <button className="danger-button" type="submit" disabled={busy || (!conversation && confirmation !== project.name)}>{busy ? '正在删除...' : conversation ? '删除会话记录' : '确认删除此项目'}</button>}</footer>
    </form>
  </dialog>, document.querySelector('.app-shell') ?? document.body)
}
