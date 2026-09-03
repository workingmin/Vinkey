import {
  Bot, Check, ChevronDown, ChevronRight, CirclePlus, Download, Eye, FileText, Folder, FolderOpen,
  MessageSquareText, PanelLeftClose, PanelLeftOpen, PanelRightClose,
  Save, Search, Send, Settings, Square, X, Minus, Maximize2, Minimize2,
  RotateCcw, RotateCw, Copy, Scissors, Clipboard, Moon, Sun, Keyboard, ListChecks, RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { CodeEditor } from './components/CodeEditor'
import { FilePreview, downloadBytes } from './components/FilePreview'
import { SettingsPage } from './components/SettingsPage'
import { WorkspaceTree, workspaceActions } from './components/WorkspaceTree'
import {
  cancelChat, chooseWorkspace, createDirectory, createDocument, isDesktop, listConversations,
  getWindowDiagnostics, listModelProfiles, loadConversation, readDocument, readFileBytes, refreshWorkspace,
  saveConversationMessage, saveDocument, searchWorkspace, streamChat, syncNativeWindowTheme,
} from './lib/desktop'
import { buildContextMessage, calculateContextBudget, selectRecentMessages } from './lib/context'
import { useAppStore } from './store'
import type { ChatMessage, DocumentSnapshot, ViewMode } from './types'
import { getDocumentKind, getLanguageName, isEditableDocument } from './lib/fileTypes'
import { findNewTextFiles, flattenWorkspaceFiles } from './lib/tree'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import type { PredefinedMenuItemOptions } from '@tauri-apps/api/menu'

type ContentPage = 'chat' | 'file'

const isMacPlatform = () => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

async function installMacMenu(callbacks: {
  newConversation: () => void
  openWorkspace: () => void
  newDocument: () => void
  refreshWorkspace: () => void
  closeDocument: () => void
  save: () => void
  changePage: (page: ContentPage) => void
  toggleTheme: () => void
  openSettings: () => void
  showShortcuts: () => void
  showWindowDiagnostics: () => void
}) {
  const menuItem = (text: string, action: () => void, accelerator?: string) => MenuItem.new({ text, accelerator, action: () => action() })
  const nativeItem = (item: PredefinedMenuItemOptions['item'], text: string) => PredefinedMenuItem.new({ item, text })
  const file = await Submenu.new({ text: '文件', items: [
    await menuItem('新建会话', callbacks.newConversation, 'CmdOrCtrl+N'),
    await menuItem('打开工作区…', callbacks.openWorkspace, 'CmdOrCtrl+O'),
    await menuItem('新建文档…', callbacks.newDocument),
    await menuItem('刷新工作区', callbacks.refreshWorkspace, 'CmdOrCtrl+R'),
    await menuItem('保存文档', callbacks.save, 'CmdOrCtrl+S'),
    await menuItem('关闭文档', callbacks.closeDocument),
  ] })
  const edit = await Submenu.new({ text: '编辑', items: [
    await nativeItem('Undo', '撤销'),
    await nativeItem('Redo', '重做'),
    await nativeItem('Cut', '剪切'),
    await nativeItem('Copy', '复制'),
    await nativeItem('Paste', '粘贴'),
    await nativeItem('SelectAll', '全选'),
  ] })
  const view = await Submenu.new({ text: '查看', items: [
    await menuItem('对话页', () => callbacks.changePage('chat')),
    await menuItem('文件页', () => callbacks.changePage('file')),
    await menuItem('切换浅色/深色主题', callbacks.toggleTheme),
    await menuItem('模型与应用设置', callbacks.openSettings),
  ] })
  const windowMenu = await Submenu.new({ text: '窗口', items: [
    await nativeItem('Minimize', '最小化'),
    await nativeItem('Maximize', '缩放窗口'),
    await nativeItem('Fullscreen', '进入全屏'),
    await nativeItem('CloseWindow', '关闭窗口'),
  ] })
  const help = await Submenu.new({ text: '帮助', items: [
    await menuItem('查看快捷键', callbacks.showShortcuts),
    await menuItem('窗口诊断信息', callbacks.showWindowDiagnostics),
  ] })
  const appMenu = await Submenu.new({ text: 'Vinkey', items: [
    await PredefinedMenuItem.new({ item: { About: { name: 'Vinkey', version: '0.1.0', comments: '本地优先的 AI 文学创作工作台' } }, text: '关于 Vinkey' }),
    await nativeItem('Services', '服务'),
    await nativeItem('Hide', '隐藏 Vinkey'),
    await nativeItem('HideOthers', '隐藏其他'),
    await nativeItem('ShowAll', '显示全部'),
    await nativeItem('Quit', '退出 Vinkey'),
  ] })
  const menu = await Menu.new({ items: [appMenu, file, edit, view, windowMenu, help] })
  await menu.setAsAppMenu()
  await windowMenu.setAsWindowsMenuForNSApp()
  await help.setAsHelpMenuForNSApp()
}

type AppMenuItem = { label: string; shortcut?: string; icon?: React.ComponentType<{ size?: number }>; disabled?: boolean; action: () => void }

function TitleBar({ onPageChange, onOpenWorkspace, onNewDocument, onRefreshWorkspace, onCloseDocument, onSave, onShowShortcuts, onShowAbout, onShowWindowDiagnostics }: {
  onPageChange: (page: ContentPage) => void
  onOpenWorkspace: () => void
  onNewDocument: () => void
  onRefreshWorkspace: () => void
  onCloseDocument: () => void
  onSave: () => void
  onShowShortcuts: () => void
  onShowAbout: () => void
  onShowWindowDiagnostics: () => void
}) {
  const workspace = useAppStore((state) => state.workspace)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const newConversation = useAppStore((state) => state.newConversation)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [maximized, setMaximized] = useState(false)
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId)
  const isMac = isMacPlatform()
  const mod = isMac ? '⌘' : 'Ctrl'
  const startNewConversation = () => {
    newConversation()
    setSettingsOpen(false)
    onPageChange('chat')
  }

  useEffect(() => {
    if (!isDesktop()) return
    void getCurrentWindow().isMaximized().then(setMaximized).catch(() => undefined)
  }, [])

  useEffect(() => {
    const close = () => setOpenMenu(null)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKeyDown) }
  }, [])

  const windowAction = async (action: 'minimize' | 'toggle' | 'close') => {
    if (!isDesktop()) return
    const win = getCurrentWindow()
    if (action === 'minimize') await win.minimize()
    if (action === 'toggle') { await win.toggleMaximize(); setMaximized(await win.isMaximized()) }
    if (action === 'close') await win.close()
  }

  const editAction = (command: string) => { if (typeof document !== 'undefined') document.execCommand(command) }
  const menus: Array<{ label: string; items: AppMenuItem[] }> = [
    { label: '文件', items: [
      { label: '新建会话', shortcut: `${mod} N`, icon: CirclePlus, action: startNewConversation },
      { label: '打开工作区…', shortcut: `${mod} O`, icon: FolderOpen, action: onOpenWorkspace },
      { label: '新建文档…', icon: FileText, action: onNewDocument },
      { label: '刷新工作区', shortcut: `${mod} R`, icon: RefreshCw, action: onRefreshWorkspace },
      { label: '保存文档', shortcut: `${mod} S`, icon: Save, action: onSave },
      { label: '关闭文档', icon: X, action: onCloseDocument },
    ] },
    { label: '编辑', items: [
      { label: '撤销', shortcut: `${mod} Z`, icon: RotateCcw, action: () => editAction('undo') },
      { label: '重做', shortcut: isMac ? '⇧ ⌘ Z' : 'Ctrl Y', icon: RotateCw, action: () => editAction('redo') },
      { label: '剪切', shortcut: `${mod} X`, icon: Scissors, action: () => editAction('cut') },
      { label: '复制', shortcut: `${mod} C`, icon: Copy, action: () => editAction('copy') },
      { label: '粘贴', shortcut: `${mod} V`, icon: Clipboard, action: () => editAction('paste') },
      { label: '全选', shortcut: `${mod} A`, icon: ListChecks, action: () => editAction('selectAll') },
    ] },
    { label: '查看', items: [
      { label: '对话页', icon: MessageSquareText, action: () => onPageChange('chat') },
      { label: '文件页', icon: FileText, action: () => onPageChange('file') },
      { label: theme === 'dark' ? '切换浅色主题' : '切换深色主题', icon: theme === 'dark' ? Sun : Moon, action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
      { label: '模型与应用设置', icon: Settings, action: () => setSettingsOpen(true) },
    ] },
    { label: '窗口', items: [
      { label: '最小化', shortcut: `${mod} M`, icon: Minus, action: () => void windowAction('minimize') },
      { label: maximized ? '还原窗口' : '最大化', icon: maximized ? Minimize2 : Maximize2, action: () => void windowAction('toggle') },
      { label: '关闭窗口', shortcut: `${mod} W`, icon: X, action: () => void windowAction('close') },
    ] },
    { label: '帮助', items: [
      { label: '查看快捷键', icon: Keyboard, action: onShowShortcuts },
      { label: '窗口诊断信息', icon: Settings, action: onShowWindowDiagnostics },
      { label: '关于 Vinkey', icon: Bot, action: onShowAbout },
    ] },
  ]

  if (isMac) return null
  return <header className="title-bar" data-tauri-drag-region onDoubleClick={() => void windowAction('toggle')}>
    <div className="title-bar-brand" data-tauri-drag-region><span className="title-bar-mark">V</span><strong>Vinkey</strong><span className="title-bar-context">{workspace?.name ?? '本地工作台'}{activeModel ? ` · ${activeModel.name}` : ''}</span></div>
    <nav className="app-menus" aria-label="应用菜单" onClick={(event) => event.stopPropagation()}>
      {menus.map((menu) => <div className="app-menu" key={menu.label}>
        <button className={`app-menu-trigger ${openMenu === menu.label ? 'active' : ''}`} aria-expanded={openMenu === menu.label} onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}>{menu.label}</button>
        {openMenu === menu.label && <div className="app-menu-dropdown" role="menu">{menu.items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { item.action(); setOpenMenu(null) }}>{item.icon && <item.icon size={14} />}<span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div>}
      </div>)}
    </nav>
    <div className="title-bar-spacer" data-tauri-drag-region />
    <div className="window-controls" onClick={(event) => event.stopPropagation()}>
      <button aria-label="最小化窗口" title="最小化" onClick={() => void windowAction('minimize')}><Minus /></button>
      <button aria-label={maximized ? '还原窗口' : '最大化窗口'} title={maximized ? '还原' : '最大化'} onClick={() => void windowAction('toggle')}>{maximized ? <Minimize2 /> : <Maximize2 />}</button>
      <button className="close-window" aria-label="关闭窗口" title="关闭" onClick={() => void windowAction('close')}><X /></button>
    </div>
  </header>
}

function IconButton({ label, active = false, children, onClick, disabled = false }: {
  label: string; active?: boolean; children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return <button className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>
}

function ProjectSessionSidebar({ onPageChange, onOpenWorkspace, onRefreshWorkspace, onOpenDocument }: {
  onPageChange: (page: ContentPage) => void
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => void
  onOpenDocument: (path: string) => Promise<void>
}) {
  const workspace = useAppStore((state) => state.workspace)
  const conversations = useAppStore((state) => state.conversations)
  const chatRuns = useAppStore((state) => state.chatRuns)
  const conversationId = useAppStore((state) => state.conversationId)
  const messages = useAppStore((state) => state.messages)
  const newConversation = useAppStore((state) => state.newConversation)
  const setConversation = useAppStore((state) => state.setConversation)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setError = useAppStore((state) => state.setError)
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<Awaited<ReturnType<typeof searchWorkspace>>>([])
  const [searching, setSearching] = useState(false)
  const [projectExpanded, setProjectExpanded] = useState(true)

  useEffect(() => {
    if (!workspace || !query.trim()) { setSearchHits([]); setSearching(false); return }
    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => void searchWorkspace(query).then((hits) => {
      if (active) setSearchHits(hits)
    }).catch((error) => setError(String(error))).finally(() => { if (active) setSearching(false) }), 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, setError, workspace])

  const conversationMatches = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    return value ? conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(value)) : conversations
  }, [conversations, query])

  const selectConversation = async (id: string) => {
    try {
      setConversation(await loadConversation(id))
      setSettingsOpen(false)
      onPageChange('chat')
    } catch (error) { setError(String(error)) }
  }

  const startConversation = () => {
    newConversation()
    setSettingsOpen(false)
    onPageChange('chat')
  }

  const hasQuery = Boolean(query.trim())
  const conversationCount = conversations.length + (!conversationId ? 1 : 0)
  const visibleResultCount = conversationMatches.length + searchHits.length

  return <aside className={`session-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="项目与会话栏">
    <header className="session-sidebar-header" data-tauri-drag-region>
      <div className="session-brand-row" data-tauri-drag-region>
        <div className="session-brand" data-tauri-drag-region><span>V</span><div><strong>Vinkey</strong><small>本地创作工作台</small></div></div>
        <div className="session-header-actions">
          {workspace && <IconButton label="刷新项目" onClick={onRefreshWorkspace}><RefreshCw /></IconButton>}
          <IconButton label={workspace ? '切换项目' : '打开项目'} onClick={onOpenWorkspace}><FolderOpen /></IconButton>
          <button className="icon-button sidebar-collapse-button" title={sidebarCollapsed ? '展开会话栏' : '折叠会话栏'} aria-label={sidebarCollapsed ? '展开会话栏' : '折叠会话栏'} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        </div>
      </div>
      <label className="sidebar-search"><Search /><input aria-label="搜索会话或文档" placeholder="搜索会话或文档" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}><X /></button>}</label>
    </header>
    <div className="session-sidebar-body">
      <div className="sidebar-section-label"><span>{hasQuery ? '搜索结果' : '项目'}</span><small>{hasQuery ? visibleResultCount : workspace ? 1 : 0}</small></div>
      <div className="sidebar-project-list">
        {!workspace ? <div className="sidebar-project-empty"><Folder /><strong>还没有打开项目</strong><span>选择一个本机目录作为创作项目</span><button onClick={onOpenWorkspace}><FolderOpen />打开项目</button></div> : <section className="sidebar-project">
          <div className="sidebar-project-row">
            <button className="sidebar-project-toggle" aria-expanded={hasQuery || projectExpanded} onClick={() => setProjectExpanded(!projectExpanded)} title={workspace.pathLabel}>
              {(hasQuery || projectExpanded) ? <ChevronDown /> : <ChevronRight />}
              {(hasQuery || projectExpanded) ? <FolderOpen /> : <Folder />}
              <span><b>{workspace.name}</b><small>{workspace.pathLabel}</small></span>
            </button>
            <IconButton label="在当前项目中新建会话" onClick={startConversation}><CirclePlus /></IconButton>
          </div>
          {(hasQuery || projectExpanded) && <div className="sidebar-project-content">
            <div className="project-session-label"><span>{hasQuery ? '匹配会话' : '会话'}</span><small>{hasQuery ? conversationMatches.length : conversationCount}</small></div>
            <div className="conversation-list">
              {!hasQuery && <button className="project-new-session" onClick={startConversation}><CirclePlus />新建会话</button>}
              {!hasQuery && !conversationId && <button className="conversation-item active" onClick={startConversation}><MessageSquareText /><span><b>新会话</b><small>{Math.max(0, messages.length - 1)} 条消息 · 尚未保存</small></span></button>}
              {conversationMatches.map((conversation) => <button key={conversation.id} className={`conversation-item ${conversationId === conversation.id ? 'active' : ''}`} onClick={() => void selectConversation(conversation.id)}><MessageSquareText /><span><b>{conversation.title}</b><small>{chatRuns[conversation.id] ? '正在生成 · ' : ''}{conversation.messageCount} 条消息 · {new Date(conversation.updatedAt).toLocaleString()}</small></span></button>)}
              {hasQuery && conversationMatches.length === 0 && <div className="empty-small compact">没有匹配的会话</div>}
              {!hasQuery && conversations.length === 0 && conversationId && <div className="empty-small compact">还没有其他会话</div>}
            </div>
            {hasQuery && <div className="sidebar-document-results">
              <div className="project-session-label"><span>文档内容</span><small>{searchHits.length}</small></div>
              {searchHits.map((hit) => <button className="document-search-item" key={`${hit.path}:${hit.line}:${hit.snippet}`} onClick={() => void onOpenDocument(hit.path)}><FileText /><span><b>{hit.path}</b><small>第 {hit.line} 行 · {hit.snippet}</small></span></button>)}
              {searching && <div className="empty-small compact">正在搜索文档...</div>}
              {!searching && searchHits.length === 0 && <div className="empty-small compact">没有匹配的文档</div>}
            </div>}
          </div>}
        </section>}
      </div>
    </div>
    <footer className="session-sidebar-footer">
      <button className={settingsOpen ? 'active' : ''} onClick={() => setSettingsOpen(true)}><Settings /><span>模型与应用设置</span></button>
    </footer>
  </aside>
}

function FileBrowserPanel({ onOpenDocument, onToggleContext, onOpenWorkspace, onRefreshWorkspace }: {
  onOpenDocument: (path: string) => Promise<void>
  onToggleContext: (path: string) => Promise<void>
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => Promise<void>
}) {
  const workspace = useAppStore((state) => state.workspace)
  const activePath = useAppStore((state) => state.activePath)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const setError = useAppStore((state) => state.setError)
  const [query, setQuery] = useState('')

  const runAction = async (id: typeof workspaceActions[number]['id']) => {
    if (!workspace) { onOpenWorkspace(); return }
    try {
      if (id === 'refresh') { await onRefreshWorkspace(); return }
      const label = id === 'file' ? '文档相对路径（.md / .txt）' : '文件夹相对路径'
      const value = window.prompt(label)?.trim()
      if (!value) return
      if (id === 'file') {
        const path = /\.(md|markdown|txt)$/i.test(value) ? value : `${value}.md`
        await createDocument(path)
        setWorkspace(await refreshWorkspace())
        await onOpenDocument(path)
      } else {
        await createDirectory(value)
        setWorkspace(await refreshWorkspace())
      }
    } catch (error) { setError(String(error)) }
  }

  return <section className="file-browser-panel" aria-label="文件列表">
    <header className="file-browser-header">
      <div className="workspace-title"><span>{workspace?.name ?? '工作区文件'}</span>{workspace && <small title={workspace.pathLabel}>{workspace.pathLabel}</small>}</div>
      <div className="header-actions">{workspaceActions.map(({ id, label, icon: Icon }) => <IconButton key={id} label={label} onClick={() => void runAction(id)}><Icon /></IconButton>)}</div>
    </header>
    {!workspace ? <div className="workspace-empty"><FolderOpen /><p>选择一个本机目录开始创作</p><button className="primary-button" onClick={onOpenWorkspace}><FolderOpen />打开文件夹</button>{!isDesktop() && <small>浏览器中将载入演示工作区</small>}</div> : <>
      <label className="tree-search"><Search /><input aria-label="筛选工作区文件" placeholder="筛选工作区文件" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清除筛选" onClick={() => setQuery('')}><X /></button>}</label>
      <WorkspaceTree entries={workspace.entries} activePath={activePath} query={query} onOpen={(path) => void onOpenDocument(path)} onContext={(path) => void onToggleContext(path)} />
    </>}
  </section>
}

function ChatMessageItem({ message, streaming, onCopyError }: {
  message: ChatMessage
  streaming: boolean
  onCopyError: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
  }, [])

  const copyMessage = async () => {
    if (!message.content.trim()) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch (error) { onCopyError(`复制消息失败：${String(error)}`) }
  }

  const isAssistant = message.role === 'assistant'
  const timestamp = new Date(message.createdAt)
  const formattedTime = timestamp.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })

  return <article className={`message ${message.role}`}>
    {isAssistant && <div className="avatar" aria-hidden="true"><Bot /></div>}
    <div className="message-stack">
      {isAssistant && <div className="message-author">Vinkey</div>}
      <div className="message-bubble">
        {message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{message.content}</ReactMarkdown>
          : streaming ? <div className="typing" aria-label="正在生成"><i /><i /><i /></div> : null}
      </div>
      <div className="message-actions">
        {message.content && <button type="button" onClick={() => void copyMessage()} title={copied ? '已复制' : '复制消息'} aria-label={copied ? '已复制' : '复制消息'}>{copied ? <Check /> : <Copy />}<span>{copied ? '已复制' : '复制'}</span></button>}
        <time dateTime={timestamp.toISOString()}>{formattedTime}</time>
      </div>
    </div>
    {!isAssistant && <div className="avatar user-avatar" aria-hidden="true">你</div>}
  </article>
}

function ChatPanel({ onToggleContext }: { onToggleContext: (path: string) => Promise<void> }) {
  const messages = useAppStore((state) => state.messages)
  const contextDocuments = useAppStore((state) => state.contextDocuments)
  const chatRuns = useAppStore((state) => state.chatRuns)
  const conversationId = useAppStore((state) => state.conversationId)
  const conversationTitle = useAppStore((state) => state.conversationTitle)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const beginChatRun = useAppStore((state) => state.beginChatRun)
  const appendChatRunChunk = useAppStore((state) => state.appendChatRunChunk)
  const endChatRun = useAppStore((state) => state.endChatRun)
  const setConversation = useAppStore((state) => state.setConversation)
  const setActiveModelId = useAppStore((state) => state.setActiveModelId)
  const setConversations = useAppStore((state) => state.setConversations)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const activePath = useAppStore((state) => state.activePath)
  const tabs = useAppStore((state) => state.tabs)
  const addContextDocument = useAppStore((state) => state.toggleContext)
  const setError = useAppStore((state) => state.setError)
  const pendingNewFiles = useAppStore((state) => state.pendingNewFiles)
  const clearPendingNewFiles = useAppStore((state) => state.clearPendingNewFiles)
  const [prompt, setPrompt] = useState('')
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId) ?? null
  const activeChatRun = conversationId ? chatRuns[conversationId] : undefined
  const busy = Boolean(activeChatRun)
  const budget = calculateContextBudget(messages, contextDocuments, prompt, activeModel?.contextWindow ?? 32768)

  const send = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    if (!activeModel) { setSettingsOpen(true); return }
    let requestContextDocuments = contextDocuments
    const explicitFileAnalysis = /(分析(?:当前|这个)?(?:文档|文件|文本)|拆分(?:章节|场景)|故事主线|人物线|章节结构|提取人物)/.test(value)
    const activeDocument = activePath ? tabs.find((tab) => tab.path === activePath) : undefined
    if (explicitFileAnalysis && requestContextDocuments.length === 0 && activeDocument) {
      addContextDocument({ path: activeDocument.path, name: activeDocument.name, content: activeDocument.content, size: activeDocument.content.length })
      requestContextDocuments = useAppStore.getState().contextDocuments
    }
    const requestBudget = calculateContextBudget(messages, requestContextDocuments, value, activeModel.contextWindow)
    if (requestBudget.exceedsLimit) { setError('当前消息和上下文超过模型可用窗口，请移除文档或缩短输入'); return }
    const now = Date.now()
    const nextConversationId = conversationId ?? crypto.randomUUID()
    const nextTitle = conversationId ? conversationTitle : value.replace(/\s+/g, ' ').slice(0, 28)
    if (!conversationId) setConversation({ id: nextConversationId, title: nextTitle, messages, updatedAt: now })
    setPrompt('')
    const userMessage = { id: crypto.randomUUID(), role: 'user' as const, content: value, createdAt: now }
    const assistantMessage = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', createdAt: now + 1 }
    const nextRequestId = crypto.randomUUID()
    beginChatRun({
      conversationId: nextConversationId,
      conversationTitle: nextTitle,
      requestId: nextRequestId,
      userMessage,
      assistantMessage,
    })
    try {
      await saveConversationMessage(nextConversationId, nextTitle, userMessage)
      setConversations(await listConversations())
      const recent = selectRecentMessages([...messages.filter((message) => message.id !== 'welcome'), userMessage], requestContextDocuments, value, activeModel.contextWindow)
      const context = buildContextMessage(requestContextDocuments)
      await streamChat({
        requestId: nextRequestId,
        profileId: activeModel.id,
        messages: [...(context ? [{ role: 'user' as const, content: context }] : []), ...recent.map(({ role, content }) => ({ role, content }))],
      }, (event) => {
        if (event.type === 'chunk') appendChatRunChunk(nextConversationId, event.content)
        if (event.type === 'error') setError(event.message)
      })
    } catch (error) {
      const message = String(error)
      if (!message.includes('请求已停止')) setError(message)
    } finally {
      const completed = useAppStore.getState().chatRuns[nextConversationId]?.assistantMessage
      if (completed?.content) {
        try {
          await saveConversationMessage(nextConversationId, nextTitle, completed)
          setConversations(await listConversations())
        } catch (error) { setError(String(error)) }
      }
      endChatRun(nextConversationId, !completed?.content)
    }
  }

  const stop = async () => { if (activeChatRun) await cancelChat(activeChatRun.requestId) }

  const prepareAnalysis = async (paths: string[], instruction: string) => {
    try {
      for (const path of paths) {
        if (!useAppStore.getState().contextDocuments.some((document) => document.path === path)) {
          await onToggleContext(path)
        }
      }
      const names = paths.map((path) => path.split('/').at(-1) ?? path).join('、')
      setPrompt(`${instruction}\n\n目标文档：${names}`)
      clearPendingNewFiles()
      window.setTimeout(() => promptRef.current?.focus(), 0)
    } catch (error) { setError(`准备文档分析失败：${String(error)}`) }
  }

  return <main className="chat-panel">
    {pendingNewFiles.length > 0 && <aside className="new-files-notice" role="status">
      <div className="new-files-notice-copy"><FileText /><span><strong>检测到 {pendingNewFiles.length} 个新增文本文件</strong><small>是否要让 AI 分析其中某个文件？</small></span></div>
      <div className="new-files-notice-actions">
        {pendingNewFiles.slice(0, 3).map((path) => <button key={path} onClick={() => void prepareAnalysis([path], '请分析这个文本文件的类型、概要、故事主线、人物线和结构。')} title={`分析 ${path}`}>{path.split('/').at(-1) ?? path}</button>)}
        {pendingNewFiles.length > 1 && <button onClick={() => void prepareAnalysis(pendingNewFiles, '请分析这些文本文件的类型、概要、故事主线、人物线、章节结构和伏笔。')}>全部分析</button>}
        <button className="notice-dismiss" aria-label="忽略新增文件提示" title="忽略" onClick={clearPendingNewFiles}><X /></button>
      </div>
    </aside>}
    <div className="message-stream">
      <div className="message-inner">
        {messages.map((message) => <ChatMessageItem
          key={message.id}
          message={message}
          streaming={Boolean(activeChatRun?.assistantMessage.id === message.id && !message.content)}
          onCopyError={setError}
        />)}
      </div>
    </div>
    <div className="composer-wrap">
      <div className="composer">
        {contextDocuments.length > 0 && <div className="composer-context-list" aria-label="已引用文档">
          {contextDocuments.map((document) => <button className="composer-context-chip" key={document.path} title={`移除引用：${document.path}`} onClick={() => void onToggleContext(document.path)}><FileText /><span>{document.name}</span><X /></button>)}
        </div>}
        {contextDocuments.length > 0 && <div className="composer-analysis-actions" aria-label="文档分析快捷入口">
          <button onClick={() => setPrompt('请分析已选文档的类型、概要、结构、故事主线和人物线。')}><FileText />分析文本</button>
          <button onClick={() => setPrompt('请根据已选文档识别章节和场景边界，给出章节拆分建议。')}><ListChecks />拆分章节</button>
          <button onClick={() => setPrompt('请从已选文档中提取人物卡、人物关系和主要人物线。')}><Bot />提取人物线</button>
        </div>}
        <textarea ref={promptRef} aria-label="对话输入" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
        }} placeholder="描述你想续写、修改或梳理的内容..." />
        <div className="composer-tools">
          {modelProfiles.length > 0 ? <label className="composer-model-selector" title="切换模型"><Bot /><select aria-label="当前模型" value={activeModelId ?? ''} onChange={(event) => setActiveModelId(event.target.value)}>{modelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select><ChevronDown /></label>
            : <button className="composer-model-selector missing" onClick={() => setSettingsOpen(true)}><Bot /><span>添加模型</span></button>}
          <span className={`composer-hint ${budget.exceedsLimit ? 'over-limit' : ''}`} title={`预计 ${budget.estimatedTokens} / ${budget.limit} tokens`}>上下文 {budget.usedPercent}% · Enter 发送</span>
          <button className="send-button" aria-label={busy ? '停止生成' : '发送'} disabled={!prompt.trim() && !busy} onClick={busy ? () => void stop() : () => void send()}>{busy ? <Square /> : <Send />}</button>
        </div>
      </div>
    </div>
  </main>
}

function EditorPanel({ onSave, onClose }: { onSave: () => Promise<void>; onClose: () => void }) {
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const viewMode = useAppStore((state) => state.viewMode)
  const closeTab = useAppStore((state) => state.closeTab)
  const updateContent = useAppStore((state) => state.updateContent)
  const setViewMode = useAppStore((state) => state.setViewMode)
  const theme = useAppStore((state) => state.theme)
  const setError = useAppStore((state) => state.setError)
  const document = tabs.find((tab) => tab.path === activePath)
  if (!document) return null
  const editable = isEditableDocument(document.kind)
  const dirty = editable && document.content !== document.savedContent
  const modes: ViewMode[] = ['edit', 'split', 'preview']
  const modeLabels: Record<ViewMode, string> = { edit: '编辑', split: '分栏', preview: '预览' }
  const lines = document.content.split('\n').length
  const words = document.content.trim() ? document.content.trim().split(/\s+/).length : 0
  const markdown = document.kind === 'markdown'
  const html = getLanguageName(document.name) === 'html'

  const download = async () => {
    try {
      if (editable) {
        downloadBytes(new TextEncoder().encode(document.content), document.name, 'text/plain;charset=utf-8')
      } else {
        downloadBytes(await readFileBytes(document.path), document.name, document.mimeType ?? 'application/octet-stream')
      }
    } catch (error) { setError(`下载文件失败：${String(error)}`) }
  }

  const openHtmlPreview = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([document.content], { type: 'text/html' }))
    const previewWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (!previewWindow) URL.revokeObjectURL(url)
    else window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return <aside className="editor-panel">
    <div className="document-tabs">
      <div className="document-tab active"><FileText /><span>{document.name}</span>{dirty && <i title="未保存" />}<IconButton label="关闭文档" onClick={() => closeTab(document.path)}><X /></IconButton></div>
    </div>
    <div className="editor-toolbar">
      <span className="document-path" title={document.path}>{document.path}</span>
      {editable && <IconButton label="保存文档" onClick={() => void onSave()} disabled={!dirty}><Save /></IconButton>}
      {editable && markdown && <div className="segmented" aria-label="文档视图">
        {modes.map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => setViewMode(mode)}>{modeLabels[mode]}</button>)}
      </div>}
      <IconButton label="下载文件" onClick={() => void download()}><Download /></IconButton>
      {html && <IconButton label="在新窗口预览 HTML" onClick={openHtmlPreview}><Eye /></IconButton>}
      <IconButton label="收起编辑器" onClick={onClose}><PanelRightClose /></IconButton>
    </div>
    <div className={`editor-content mode-${viewMode}`}>
      {editable && (viewMode !== 'preview' || !markdown) && <CodeEditor key={`${document.path}:${theme}:${document.kind}`} value={document.content} filename={document.name} editable themeMode={theme} onChange={(content) => updateContent(document.path, content)} />}
      {editable && viewMode !== 'edit' && markdown && <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{document.content}</ReactMarkdown></div>}
      {!editable && <FilePreview document={document} onError={setError} />}
    </div>
    <footer className="editor-status">{editable ? <><span>语言 {getLanguageName(document.name)}</span><span>行 {lines}</span><span>{document.content.length} 字符</span><span>{words} 词</span><span>UTF-8</span><span>{document.lineEnding.toUpperCase()}</span><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '未保存' : <><Check />已保存</>}</span></> : <><span>{document.kind === 'binary' ? '不可编辑' : '仅预览'}</span><span>{document.sizeBytes ? `${Math.ceil(document.sizeBytes / 1024)} KB` : ''}</span></>}</footer>
  </aside>
}

function FileWorkspace({ showEditor, onOpenDocument, onToggleContext, onOpenWorkspace, onRefreshWorkspace, onSave, onCloseEditor }: {
  showEditor: boolean
  onOpenDocument: (path: string) => Promise<void>
  onToggleContext: (path: string) => Promise<void>
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => Promise<void>
  onSave: () => Promise<void>
  onCloseEditor: () => void
}) {
  return <div className={`file-workspace ${showEditor ? 'with-editor' : 'list-only'}`}>
    <FileBrowserPanel onOpenDocument={onOpenDocument} onToggleContext={onToggleContext} onOpenWorkspace={onOpenWorkspace} onRefreshWorkspace={onRefreshWorkspace} />
    {showEditor && <EditorPanel onSave={onSave} onClose={onCloseEditor} />}
  </div>
}

function ContentPanel({ page, onPageChange, showFileEditor, onOpenDocument, onOpenWorkspace, onRefreshWorkspace, onSave, onCloseEditor, onToggleContext }: {
  page: ContentPage
  onPageChange: (page: ContentPage) => void
  showFileEditor: boolean
  onOpenDocument: (path: string) => Promise<void>
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => Promise<void>
  onSave: () => Promise<void>
  onCloseEditor: () => void
  onToggleContext: (path: string) => Promise<void>
}) {
  const workspace = useAppStore((state) => state.workspace)
  const conversationTitle = useAppStore((state) => state.conversationTitle)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId)

  return <section className="content-panel" aria-label="内容区">
    <header className="content-panel-header">
      <div className="content-panel-summary">
        <strong title={conversationTitle}>{conversationTitle || '新会话'}</strong>
        <span title={`${workspace?.name ?? '未打开项目'} · ${activeModel?.model ?? '未选择模型'}`}>{workspace?.name ?? '未打开项目'} · {activeModel?.model ?? '未选择模型'}</span>
      </div>
      <div className="content-switcher" role="tablist" aria-label="内容页面">
        <button role="tab" aria-selected={page === 'chat'} className={page === 'chat' ? 'active' : ''} onClick={() => onPageChange('chat')}><MessageSquareText />对话</button>
        <button role="tab" aria-selected={page === 'file'} className={page === 'file' ? 'active' : ''} onClick={() => onPageChange('file')}><FileText />文件</button>
      </div>
    </header>
    <div className="content-panel-body">
      {page === 'chat' ? <ChatPanel onToggleContext={onToggleContext} /> : <FileWorkspace showEditor={showFileEditor} onOpenDocument={onOpenDocument} onToggleContext={onToggleContext} onOpenWorkspace={onOpenWorkspace} onRefreshWorkspace={onRefreshWorkspace} onSave={onSave} onCloseEditor={onCloseEditor} />}
    </div>
  </section>
}

export function App() {
  const workspace = useAppStore((state) => state.workspace)
  const activePath = useAppStore((state) => state.activePath)
  const tabs = useAppStore((state) => state.tabs)
  const error = useAppStore((state) => state.error)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const theme = useAppStore((state) => state.theme)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const openTab = useAppStore((state) => state.openTab)
  const closeTab = useAppStore((state) => state.closeTab)
  const toggleContext = useAppStore((state) => state.toggleContext)
  const markSaved = useAppStore((state) => state.markSaved)
  const setError = useAppStore((state) => state.setError)
  const setModelProfiles = useAppStore((state) => state.setModelProfiles)
  const setConversations = useAppStore((state) => state.setConversations)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setPendingNewFiles = useAppStore((state) => state.setPendingNewFiles)
  const [contentPage, setContentPage] = useState<ContentPage>('chat')
  const [fileEditorVisible, setFileEditorVisible] = useState(false)
  const macMenuInstalled = useRef(false)

  const applyWorkspaceSnapshot = useCallback((next: Awaited<ReturnType<typeof refreshWorkspace>>, discover = true) => {
    const previous = useAppStore.getState().workspace
    let added: string[] = []
    if (discover) {
      const textFiles = flattenWorkspaceFiles(next.entries)
        .filter((entry) => ['markdown', 'text'].includes(entry.documentKind ?? getDocumentKind(entry.name)))
      if (previous?.id === next.id) {
        added = findNewTextFiles(previous, next)
      } else if (!previous) {
        const seenKey = `vinkey.workspace-seen.${next.id}`
        if (!localStorage.getItem(seenKey)) {
          added = textFiles.slice(0, 3).map((entry) => entry.path)
          localStorage.setItem(seenKey, 'true')
        }
      }
    }
    if (added.length > 0 || previous?.id !== next.id) setPendingNewFiles(added)
    setWorkspace(next)
  }, [setPendingNewFiles, setWorkspace])

  const changeContentPage = useCallback((page: ContentPage) => {
    setContentPage(page)
    setSettingsOpen(false)
    if (page === 'file') setFileEditorVisible(false)
  }, [setSettingsOpen])

  useEffect(() => {
    if (!isDesktop() || !isMacPlatform()) return
    void syncNativeWindowTheme(theme)
      .then((diagnostic) => { if (diagnostic) console.info(`[Vinkey window] ${diagnostic}`) })
      .catch((cause) => setError(`macOS 原生窗口主题同步失败：${String(cause)}`))
  }, [setError, theme])

  const openWorkspaceFromMenu = useCallback(async () => {
    try {
      const next = await chooseWorkspace()
      if (next) {
        useAppStore.getState().newConversation()
        setConversations([])
        applyWorkspaceSnapshot(next)
      }
    } catch (cause) { setError(String(cause)) }
  }, [applyWorkspaceSnapshot, setConversations, setError])

  const newDocumentFromMenu = useCallback(async () => {
    if (!workspace) return openWorkspaceFromMenu()
    const value = window.prompt('文档相对路径（.md / .txt）')?.trim()
    if (!value) return
    try {
      const path = /\.(md|markdown|txt)$/i.test(value) ? value : `${value}.md`
      const document = await createDocument(path)
      setWorkspace(await refreshWorkspace())
      openTab({ ...document, savedContent: document.content })
      setContentPage('file')
      setFileEditorVisible(true)
      setSettingsOpen(false)
    } catch (cause) { setError(String(cause)) }
  }, [openWorkspaceFromMenu, openTab, setError, setSettingsOpen, setWorkspace, workspace])

  const showShortcuts = useCallback(() => {
    window.alert('快捷键\n\n⌘/Ctrl + S  保存文档\n⌘/Ctrl + N  新建会话\n⌘/Ctrl + O  打开工作区\n⌘/Ctrl + W  关闭窗口\nEnter  发送消息\nShift + Enter  换行')
  }, [])

  const showAbout = useCallback(() => {
    window.alert('Vinkey 0.1.0\n\n本地优先的 AI 文学创作工作台\n文档和会话数据保存在本机。')
  }, [])

  const showWindowDiagnostics = useCallback(() => {
    void getWindowDiagnostics().then((diagnostics) => window.alert(diagnostics)).catch((cause) => setError(`读取窗口诊断失败：${String(cause)}`))
  }, [setError])

  const refreshWorkspaceFromMenu = useCallback(async () => {
    if (!workspace) return openWorkspaceFromMenu()
    try { applyWorkspaceSnapshot(await refreshWorkspace()) } catch (cause) { setError(`刷新工作区失败：${String(cause)}`) }
  }, [applyWorkspaceSnapshot, openWorkspaceFromMenu, setError, workspace])

  const closeDocumentFromMenu = useCallback(() => {
    const path = useAppStore.getState().activePath
    if (path) closeTab(path)
    setFileEditorVisible(false)
  }, [closeTab])

  useEffect(() => {
    if (!workspace) {
      if (!isDesktop()) void chooseWorkspace().then((next) => next && applyWorkspaceSnapshot(next))
      else void refreshWorkspace().then((next) => applyWorkspaceSnapshot(next)).catch((cause) => {
        if (!String(cause).includes('请先选择工作目录')) setError(`恢复上次工作区失败：${String(cause)}`)
      })
    }
  }, [applyWorkspaceSnapshot, setError, workspace])

  useEffect(() => {
    void listModelProfiles().then(setModelProfiles).catch((cause) => setError(String(cause)))
  }, [setError, setModelProfiles])

  useEffect(() => {
    if (!workspace) {
      setConversations([])
      return
    }
    void listConversations().then(setConversations).catch((cause) => setError(String(cause)))
  }, [setConversations, setError, workspace])

  const openDocument = useCallback(async (path: string) => {
    try {
      const existing = useAppStore.getState().tabs.find((tab) => tab.path === path)
      if (existing) { openTab(existing); setContentPage('file'); setFileEditorVisible(true); setSettingsOpen(false); return }
      const document = await readDocument(path)
      openTab({ ...document, savedContent: document.content })
      setContentPage('file')
      setFileEditorVisible(true)
      setSettingsOpen(false)
    } catch (cause) { setError(String(cause)) }
  }, [openTab, setError, setSettingsOpen])

  const toggleDocumentContext = useCallback(async (path: string) => {
    try {
      const existing = useAppStore.getState().contextDocuments.find((item) => item.path === path)
      if (existing) return toggleContext(existing)
      const document = await readDocument(path)
      toggleContext({ path, name: document.name, content: document.content, size: document.content.length })
    } catch (cause) { setError(String(cause)) }
  }, [setError, toggleContext])

  const saveActive = useCallback(async () => {
    const document = useAppStore.getState().tabs.find((tab) => tab.path === useAppStore.getState().activePath)
    if (!document || document.content === document.savedContent) return
    try {
      const saved = await saveDocument(document as DocumentSnapshot)
      markSaved(document.path, saved.content, saved.modifiedMs)
    } catch (cause) { setError(`保存失败：${String(cause)}`) }
  }, [markSaved, setError])

  useEffect(() => {
    if (!isDesktop() || !isMacPlatform() || macMenuInstalled.current) return
    macMenuInstalled.current = true
    void installMacMenu({
      newConversation: () => { useAppStore.getState().newConversation(); changeContentPage('chat') },
      openWorkspace: () => void openWorkspaceFromMenu(),
      newDocument: () => void newDocumentFromMenu(),
      refreshWorkspace: () => void refreshWorkspaceFromMenu(),
      closeDocument: closeDocumentFromMenu,
      save: () => void saveActive(),
      changePage: changeContentPage,
      toggleTheme: () => { const current = useAppStore.getState().theme; useAppStore.getState().setTheme(current === 'dark' ? 'light' : 'dark') },
      openSettings: () => useAppStore.getState().setSettingsOpen(true),
      showShortcuts,
      showWindowDiagnostics,
    }).catch((cause) => { macMenuInstalled.current = false; setError(`macOS 菜单初始化失败：${String(cause)}`) })
  }, [changeContentPage, closeDocumentFromMenu, newDocumentFromMenu, openWorkspaceFromMenu, refreshWorkspaceFromMenu, saveActive, setError, showShortcuts, showWindowDiagnostics])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveActive() }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [saveActive])

  const hasActiveDocument = useMemo(() => tabs.some((tab) => tab.path === activePath), [activePath, tabs])

  return <div className="app-frame" data-theme={theme} data-platform={isMacPlatform() ? 'mac' : 'desktop'}>
    <TitleBar onPageChange={changeContentPage} onOpenWorkspace={() => void openWorkspaceFromMenu()} onNewDocument={() => void newDocumentFromMenu()} onRefreshWorkspace={() => void refreshWorkspaceFromMenu()} onCloseDocument={closeDocumentFromMenu} onSave={() => void saveActive()} onShowShortcuts={showShortcuts} onShowAbout={showAbout} onShowWindowDiagnostics={showWindowDiagnostics} />
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} data-theme={theme}>
      <ProjectSessionSidebar onPageChange={changeContentPage} onOpenWorkspace={() => void openWorkspaceFromMenu()} onRefreshWorkspace={() => void refreshWorkspaceFromMenu()} onOpenDocument={openDocument} />
      {settingsOpen ? <SettingsPage /> : <ContentPanel page={contentPage} onPageChange={changeContentPage} showFileEditor={fileEditorVisible && hasActiveDocument} onOpenDocument={openDocument} onOpenWorkspace={() => void openWorkspaceFromMenu()} onRefreshWorkspace={refreshWorkspaceFromMenu} onSave={saveActive} onCloseEditor={() => setFileEditorVisible(false)} onToggleContext={toggleDocumentContext} />}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError(null)}><X /></button></div>}
    </div>
  </div>
}
