import { ChevronDown, ChevronRight, CirclePlus, FileText, Folder, FolderOpen, MessageSquareText, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { ConversationSummary, ProjectSummary } from '../types'
import { deleteConversation, isDesktop, listConversations, loadConversation, searchWorkspace } from '../lib/desktop'
import { formatConversationAge } from '../lib/conversationTime'
import { observeNativeWindowControls } from '../lib/nativeWindowControls'
import { RecordDeletionDialog } from './RecordDeletionDialog'

type Props = {
  onPageChange: (page: 'chat' | 'file' | 'tasks') => void
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => void
  onOpenDocument: (path: string) => Promise<void>
  onSelectProject: (id: string) => Promise<boolean>
  onDeleteProject: (project: ProjectSummary, confirmation: string) => Promise<void>
}

type Deletion = { project: ProjectSummary; conversation?: ConversationSummary }

function readExpanded(): string[] {
  try { return JSON.parse(localStorage.getItem('vinkey.expandedProjects') ?? '[]') as string[] } catch { return [] }
}

export function ProjectSessionSidebar({ onPageChange, onOpenWorkspace, onRefreshWorkspace, onOpenDocument, onSelectProject, onDeleteProject }: Props) {
  const { projects, workspace, conversations, conversationId, messages, chatRuns, settingsOpen, sidebarCollapsed, projectTransition,
    setSidebarCollapsed, setSettingsOpen, setError, setConversation, newConversation, removeConversation } = useAppStore()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string[]>(readExpanded)
  const [sessions, setSessions] = useState<Record<string, ConversationSummary[]>>({})
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const [searchHits, setSearchHits] = useState<Awaited<ReturnType<typeof searchWorkspace>>>([])
  const [searching, setSearching] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now)
  const [deletion, setDeletion] = useState<Deletion | null>(null)
  const [selecting, setSelecting] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const selectingRef = useRef(false)

  useEffect(() => {
    if (!isDesktop() || !/mac/i.test(navigator.platform) || !sidebarRef.current) return
    return observeNativeWindowControls(sidebarRef.current, (cause) => setError(`macOS 窗口按钮布局同步失败：${String(cause)}`))
  }, [setError])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const id = workspace?.id
    if (id) setExpanded((previous) => previous.includes(id) ? previous : [...previous, id])
  }, [workspace?.id])

  useEffect(() => { localStorage.setItem('vinkey.expandedProjects', JSON.stringify(expanded)) }, [expanded])

  useEffect(() => {
    let active = true
    void Promise.all(projects.map(async (project) => {
      try {
        const values = await listConversations(project.id)
        if (active) {
          setSessions((previous) => ({ ...previous, [project.id]: values }))
          setSessionErrors((previous) => ({ ...previous, [project.id]: '' }))
        }
      } catch (cause) {
        if (active) setSessionErrors((previous) => ({ ...previous, [project.id]: String(cause) }))
      }
    }))
    return () => { active = false }
  }, [projects, conversations, revision])

  useEffect(() => {
    setSearchHits([])
    if (!workspace || !query.trim()) { setSearching(false); return }
    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => void searchWorkspace(query).then((hits) => {
      if (active) setSearchHits(hits)
    }).catch((cause) => { if (active) setError(String(cause)) }).finally(() => { if (active) setSearching(false) }), 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, setError, workspace])

  const openSession = async (project: ProjectSummary, id?: string) => {
    if (selectingRef.current || useAppStore.getState().projectTransition) return
    selectingRef.current = true
    setSelecting(true)
    try {
      if (!await onSelectProject(project.id)) return
      if (id) {
        const conversation = await loadConversation(id, project.id)
        if (useAppStore.getState().workspace?.id !== project.id) return
        setConversation(conversation)
      } else newConversation()
      setSettingsOpen(false)
      onPageChange('chat')
    } catch (cause) { setError(String(cause)) }
    finally { selectingRef.current = false; setSelecting(false) }
  }

  const confirmDeletion = async (confirmation: string) => {
    if (!deletion) return
    const { project, conversation } = deletion
    if (useAppStore.getState().projectTransition) throw new Error('项目切换中，请稍后重试')
    if (conversation) {
      if (useAppStore.getState().pendingChatRequests) throw new Error('请先等待当前任务结束，再删除会话记录')
      if (useAppStore.getState().chatRuns[conversation.id]) throw new Error('会话正在运行，请先停止任务')
      await deleteConversation(conversation.id, project.id)
      if (useAppStore.getState().workspace?.id === project.id) removeConversation(conversation.id)
      setSessions((previous) => ({ ...previous, [project.id]: (previous[project.id] ?? []).filter((item) => item.id !== conversation.id) }))
      setRevision((value) => value + 1)
    } else {
      await onDeleteProject(project, confirmation)
      setExpanded((previous) => previous.filter((id) => id !== project.id))
    }
    setDeletion(null)
  }

  const value = query.trim().toLocaleLowerCase()
  const visibleProjects = projects.filter((project) => !value || `${project.name} ${project.pathLabel}`.toLocaleLowerCase().includes(value)
    || (sessions[project.id] ?? []).some((session) => session.title.toLocaleLowerCase().includes(value))
    || Boolean(sessionErrors[project.id]) || !sessions[project.id]
    || (workspace?.id === project.id && (searching || searchHits.length > 0)))
  const busy = projectTransition || selecting

  return <>
    <aside ref={sidebarRef} className={`session-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="项目与会话栏">
      <header className="session-sidebar-header" data-tauri-drag-region>
        <div className="session-brand-row" data-tauri-drag-region>
          <div className="session-brand" data-tauri-drag-region><span>V</span><div><strong>Vinkey</strong><small>本地创作工作台</small></div></div>
          <button className="icon-button sidebar-collapse-button" title={sidebarCollapsed ? '展开会话栏' : '折叠会话栏'} aria-label={sidebarCollapsed ? '展开会话栏' : '折叠会话栏'} aria-expanded={!sidebarCollapsed} aria-controls="session-sidebar-body" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        </div>
        <div className="session-header-actions">
          <button className="icon-button" title="添加项目" aria-label="添加项目" disabled={busy} onClick={onOpenWorkspace}><FolderOpen /></button>
          <button className="icon-button" title="刷新项目列表" aria-label="刷新项目列表" disabled={busy} onClick={() => { setRevision((n) => n + 1); onRefreshWorkspace() }}><RefreshCw /></button>
        </div>
        <label className="sidebar-search"><Search /><input aria-label="搜索项目、会话或当前项目文档" placeholder="搜索项目或会话" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}><X /></button>}</label>
      </header>
      <div className="session-sidebar-body" id="session-sidebar-body">
        <div className="sidebar-section-label"><span>{value ? '匹配项目' : '项目'}</span><small>{visibleProjects.length}</small></div>
        <div className="sidebar-project-list">
          {projects.length === 0 && <div className="sidebar-project-empty"><Folder /><strong>还没有添加项目</strong><button disabled={busy} onClick={onOpenWorkspace}><FolderOpen />添加项目</button></div>}
          {projects.length > 0 && visibleProjects.length === 0 && <div className="empty-small">没有匹配的项目或会话</div>}
          {visibleProjects.map((project) => {
            const current = workspace?.id === project.id
            const isExpanded = Boolean(value) || expanded.includes(project.id)
            const allSessions = sessions[project.id]
            const projectMatches = `${project.name} ${project.pathLabel}`.toLocaleLowerCase().includes(value)
            const matches = (allSessions ?? []).filter((session) => !value || projectMatches || session.title.toLocaleLowerCase().includes(value))
            return <section className="sidebar-project" key={project.id} aria-label={`项目 ${project.name}`}>
              <div className={`sidebar-project-row ${current ? 'selected' : ''}`}>
                <button className="icon-button project-expand" title={isExpanded ? '收起项目' : '展开项目'} aria-label={`${isExpanded ? '收起' : '展开'}项目 ${project.name}`} aria-expanded={isExpanded} onClick={() => setExpanded((previous) => previous.includes(project.id) ? previous.filter((id) => id !== project.id) : [...previous, project.id])}>{isExpanded ? <ChevronDown /> : <ChevronRight />}</button>
                <button className="sidebar-project-toggle" aria-current={current ? 'true' : undefined} disabled={busy} title={project.pathLabel} onClick={() => { if (!selectingRef.current) void onSelectProject(project.id) }}>
                  {current ? <FolderOpen /> : <Folder />}<span><b>{project.name}</b><small>{project.pathLabel}</small></span>
                </button>
                <div className="project-row-actions">
                  <button className="icon-button" title="新建会话" aria-label={`在 ${project.name} 中新建会话`} disabled={busy} onClick={() => void openSession(project)}><CirclePlus /></button>
                  <button className="icon-button danger-icon" title="删除项目记录" aria-label={`删除项目 ${project.name}`} disabled={busy} onClick={() => setDeletion({ project })}><Trash2 /></button>
                </div>
              </div>
              {isExpanded && <div className="sidebar-project-content">
                <div className="project-session-label"><span>会话</span><small>{allSessions ? matches.length : ''}</small></div>
                {sessionErrors[project.id] ? <div className="project-load-error" role="alert"><span>{sessionErrors[project.id]}</span><button title="重试加载会话" aria-label={`重试 ${project.name} 的会话`} onClick={() => setRevision((n) => n + 1)}><RefreshCw /></button></div>
                  : !allSessions ? <div className="empty-small compact" role="status">正在加载会话...</div> : <div className="conversation-list">
                    {!value && <button className="project-new-session" disabled={busy} onClick={() => void openSession(project)}><CirclePlus />新建会话</button>}
                    {!value && current && !conversationId && <button className="conversation-item active" disabled={busy} onClick={() => onPageChange('chat')}><MessageSquareText /><span><b>新会话</b><small>{Math.max(0, messages.length - 1)} 条消息 · 尚未保存</small></span></button>}
                    {matches.map((conversation) => {
                      const running = current && Boolean(chatRuns[conversation.id])
                      const age = formatConversationAge(conversation.updatedAt, currentTime)
                      return <div className={`conversation-item ${current && conversationId === conversation.id ? 'active' : ''}`} key={conversation.id}>
                        <button className="conversation-item-select" disabled={busy} onClick={() => void openSession(project, conversation.id)}><MessageSquareText /><span><b title={conversation.title}>{conversation.title}</b><small className="conversation-item-meta">{conversation.messageCount} 条消息{running ? ' · 运行中' : ''}</small></span></button>
                        <div className="conversation-item-action">{age && <time className="conversation-item-age" dateTime={new Date(conversation.updatedAt).toISOString()} title={new Date(conversation.updatedAt).toLocaleString()}>{age}</time>}<button className="conversation-item-delete" title={running ? '会话正在运行' : '删除会话记录'} aria-label={`删除会话“${conversation.title}”`} disabled={busy || running} onClick={() => setDeletion({ project, conversation })}><Trash2 /></button></div>
                      </div>
                    })}
                    {matches.length === 0 && (value || !current) && <div className="empty-small compact">{value ? '没有匹配的会话' : '暂无会话'}</div>}
                  </div>}
                {value && current && <div className="sidebar-document-results"><div className="project-session-label"><span>当前项目文档</span><small>{searchHits.length}</small></div>{searchHits.map((hit) => <button className="document-search-item" disabled={busy} key={`${hit.path}:${hit.line}:${hit.snippet}`} onClick={() => void onOpenDocument(hit.path)}><FileText /><span><b>{hit.path}</b><small>第 {hit.line} 行 · {hit.snippet}</small></span></button>)}{searching && <div className="empty-small compact">正在搜索文档...</div>}</div>}
              </div>}
            </section>
          })}
        </div>
      </div>
      <footer className="session-sidebar-footer"><button className={settingsOpen ? 'active' : ''} title="模型与应用设置" aria-label="模型与应用设置" onClick={() => setSettingsOpen(true)}><Settings /><span>模型与应用设置</span></button></footer>
    </aside>
    {deletion && <RecordDeletionDialog key={`${deletion.project.id}:${deletion.conversation?.id ?? 'project'}`} project={deletion.project} conversation={deletion.conversation} sessionCount={sessions[deletion.project.id]?.length} onCancel={() => setDeletion(null)} onConfirm={confirmDeletion} />}
  </>
}
