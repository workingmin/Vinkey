import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Folder, MessageSquareText, FileText, Search, X, CornerDownLeft } from 'lucide-react'
import { useAppStore } from '../store'
import type { ConversationSummary, ProjectSummary, SearchHit } from '../types'
import { listConversations, searchWorkspace } from '../lib/desktop'

type Props = {
  onOpenProject: (id: string) => Promise<boolean>
  onOpenConversation: (projectId: string, conversationId: string) => Promise<void>
  onOpenDocument: (path: string) => Promise<void>
  onChangePage: (page: 'chat' | 'file' | 'logs') => void
}

type ProjectHit = { kind: 'project'; project: ProjectSummary }
type SessionHit = { kind: 'session'; project: ProjectSummary; conversation: ConversationSummary }
type DocumentHit = { kind: 'document'; hit: SearchHit }
type AnyHit = ProjectHit | SessionHit | DocumentHit

const MAX_DOCUMENT_HITS = 100

export function UnifiedSearchPanel({ onOpenProject, onOpenConversation, onOpenDocument, onChangePage }: Props) {
  const open = useAppStore((state) => state.unifiedSearchOpen)
  const setOpen = useAppStore((state) => state.setUnifiedSearchOpen)
  const projects = useAppStore((state) => state.projects)
  const workspace = useAppStore((state) => state.workspace)
  const setError = useAppStore((state) => state.setError)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<Record<string, ConversationSummary[]>>({})
  const [documentHits, setDocumentHits] = useState<SearchHit[]>([])
  const [docSearching, setDocSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const [activating, setActivating] = useState(false)

  // 打开时重置并聚焦；关闭时清空查询避免泄漏到下次
  useEffect(() => {
    if (!open) return
    setQuery('')
    setDocumentHits([])
    setSelected(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  // 打开时加载各项目的会话列表（CF-023：跨项目统一检索）
  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.all(projects.map(async (project) => {
      try {
        const values = await listConversations(project.id)
        if (active) setSessions((previous) => ({ ...previous, [project.id]: values }))
      } catch { /* 单个项目会话读取失败不影响其余分组 */ }
    }))
    return () => { active = false }
  }, [open, projects])

  const value = query.trim().toLocaleLowerCase()

  // 当前项目文档检索（debounce），仅在有查询时执行
  useEffect(() => {
    if (!open || !workspace || !value) { setDocumentHits([]); return }
    let active = true
    setDocSearching(true)
    const timer = window.setTimeout(() => void searchWorkspace(query).then((hits) => {
      if (active) setDocumentHits(hits.slice(0, MAX_DOCUMENT_HITS))
    }).catch((cause) => { if (active) setError(String(cause)) }).finally(() => { if (active) setDocSearching(false) }), 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, workspace, query, value, setError])

  const projectHits: ProjectHit[] = useMemo(
    () => projects.map((project) => ({ kind: 'project' as const, project }))
      .filter(({ project }) => !value || `${project.name} ${project.pathLabel}`.toLocaleLowerCase().includes(value)),
    [projects, value],
  )

  const sessionHits: SessionHit[] = useMemo(
    () => projects.flatMap((project) => (sessions[project.id] ?? [])
      .filter((conversation) => !value || conversation.title.toLocaleLowerCase().includes(value))
      .map((conversation) => ({ kind: 'session' as const, project, conversation }))),
    [projects, sessions, value],
  )

  const documentHitsGroup: DocumentHit[] = useMemo(
    () => documentHits.map((hit) => ({ kind: 'document' as const, hit })),
    [documentHits],
  )

  const groups: Array<{ id: 'projects' | 'sessions' | 'documents'; label: string; icon: typeof Folder; items: AnyHit[] }> = useMemo(() => [
    { id: 'projects', label: '项目', icon: Folder, items: projectHits },
    { id: 'sessions', label: '会话', icon: MessageSquareText, items: sessionHits },
    { id: 'documents', label: '当前项目文档', icon: FileText, items: documentHitsGroup },
  ], [projectHits, sessionHits, documentHitsGroup])

  const flat: AnyHit[] = useMemo(() => groups.flatMap((group) => group.items), [groups])

  // 选择索引越界保护
  useEffect(() => { if (selected >= flat.length) setSelected(Math.max(0, flat.length - 1)) }, [flat.length, selected])

  const close = () => setOpen(false)

  const activate = async (hit: AnyHit) => {
    if (activating) return
    setActivating(true)
    try {
      if (hit.kind === 'project') await onOpenProject(hit.project.id)
      else if (hit.kind === 'session') await onOpenConversation(hit.project.id, hit.conversation.id)
      else { await onOpenDocument(hit.hit.path); onChangePage('file') }
      close()
    } catch (cause) { setError(String(cause)) }
    finally { setActivating(false) }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((index) => Math.min(flat.length - 1, index + 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((index) => Math.max(0, index - 1)); return }
    if (event.key === 'Enter') { event.preventDefault(); const hit = flat[selected]; if (hit) void activate(hit) }
  }

  if (!open) return null

  let runningIndex = -1
  return (
    <div className="unified-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="unified-search-panel" role="dialog" aria-modal="true" aria-label="搜索项目、会话与当前项目文档" data-testid="unified-search-panel">
        <header className="unified-search-header">
          <div className="unified-search-field">
            <Search />
            <input
              id="unified-search-panel-input"
              ref={inputRef}
              type="text"
              className="unified-search-input"
              placeholder="搜索项目、会话或当前项目文档"
              aria-label="搜索项目、会话或当前项目文档"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSelected(0) }}
              onKeyDown={onKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
            {query && <button type="button" className="icon-button" aria-label="清除搜索" onClick={() => { setQuery(''); setSelected(0); inputRef.current?.focus() }}><X /></button>}
          </div>
        </header>
        <div className="unified-search-body">
          {!value && <div className="unified-search-hint">输入关键字以搜索项目、会话与当前项目文档</div>}
          {groups.map((group) => (
            <section className="unified-search-group" key={group.id}>
              <div className="unified-search-group-label"><group.icon /><span>{group.label}</span><small>{group.items.length}</small></div>
              {group.items.length === 0
                ? <div className="unified-search-group-empty">{value ? '无匹配' : '等待输入'}</div>
                : <ul className="unified-search-list">
                  {group.items.map((hit) => {
                    runningIndex += 1
                    const index = runningIndex
                    const active = index === selected
                    const title = hit.kind === 'project' ? hit.project.name
                      : hit.kind === 'session' ? hit.conversation.title
                        : hit.hit.path
                    const subtitle = hit.kind === 'project' ? hit.project.pathLabel
                      : hit.kind === 'session' ? `${hit.project.name} · ${hit.conversation.messageCount} 条消息`
                        : `第 ${hit.hit.line} 行 · ${hit.hit.snippet}`
                    return (
                      <li
                        key={`${hit.kind}:${(hit as { project?: ProjectSummary; conversation?: ConversationSummary; hit?: SearchHit }).project?.id ?? (hit as { conversation?: ConversationSummary }).conversation?.id ?? (hit as { hit?: SearchHit }).hit?.path}`}
                        className={`unified-search-item ${active ? 'active' : ''}`}
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setSelected(index)}
                        onMouseDown={(event) => { event.preventDefault(); void activate(hit) }}
                      >
                        {hit.kind === 'project' ? <Folder /> : hit.kind === 'session' ? <MessageSquareText /> : <FileText />}
                        <span className="unified-search-item-text"><b>{title}</b><small>{subtitle}</small></span>
                        {active && <CornerDownLeft className="unified-search-item-enter" />}
                      </li>
                    )
                  })}
                </ul>}
            </section>
          ))}
          {docSearching && value && <div className="unified-search-minor">正在检索当前项目文档…</div>}
        </div>
        <footer className="unified-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 跳转</span>
          <span><kbd>Esc</kbd> 返回</span>
        </footer>
      </section>
    </div>
  )
}
