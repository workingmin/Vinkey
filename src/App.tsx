import {
  Bot, Check, ChevronDown, CirclePlus, FileText, Files, FolderOpen, History,
  MessageSquareText, PanelRightClose, Paperclip,
  Save, Search, Send, Settings, Square, X, Minus, Maximize2, Minimize2,
  RotateCcw, RotateCw, Copy, Scissors, Clipboard, Moon, Sun, Keyboard,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { CodeEditor } from './components/CodeEditor'
import { SettingsPage } from './components/SettingsPage'
import { WorkspaceTree, workspaceActions } from './components/WorkspaceTree'
import {
  cancelChat, chooseWorkspace, createDirectory, createDocument, isDesktop, listConversations,
  listModelProfiles, loadConversation, readDocument, refreshWorkspace, saveConversationMessage,
  saveDocument, searchWorkspace, streamChat,
} from './lib/desktop'
import { buildContextMessage, calculateContextBudget, selectRecentMessages } from './lib/context'
import { flattenWorkspaceFiles } from './lib/tree'
import { useAppStore } from './store'
import type { DocumentSnapshot, ViewMode } from './types'
import { getCurrentWindow } from '@tauri-apps/api/window'

type ContentPage = 'chat' | 'file'

type MenuItem = { label: string; shortcut?: string; icon?: React.ComponentType<{ size?: number }>; disabled?: boolean; action: () => void }

function TitleBar({ onPageChange, onOpenWorkspace, onNewDocument, onSave, onShowShortcuts, onShowAbout }: {
  onPageChange: (page: ContentPage) => void
  onOpenWorkspace: () => void
  onNewDocument: () => void
  onSave: () => void
  onShowShortcuts: () => void
  onShowAbout: () => void
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
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl'

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
  const menus: Array<{ label: string; items: MenuItem[] }> = [
    { label: '文件', items: [
      { label: '新建会话', shortcut: `${mod} N`, icon: CirclePlus, action: newConversation },
      { label: '打开工作区…', shortcut: `${mod} O`, icon: FolderOpen, action: onOpenWorkspace },
      { label: '新建文档…', icon: FileText, action: onNewDocument },
      { label: '保存文档', shortcut: `${mod} S`, icon: Save, action: onSave },
    ] },
    { label: '编辑', items: [
      { label: '撤销', shortcut: `${mod} Z`, icon: RotateCcw, action: () => editAction('undo') },
      { label: '重做', shortcut: isMac ? '⇧ ⌘ Z' : 'Ctrl Y', icon: RotateCw, action: () => editAction('redo') },
      { label: '剪切', shortcut: `${mod} X`, icon: Scissors, action: () => editAction('cut') },
      { label: '复制', shortcut: `${mod} C`, icon: Copy, action: () => editAction('copy') },
      { label: '粘贴', shortcut: `${mod} V`, icon: Clipboard, action: () => editAction('paste') },
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
      { label: '关于 Vinkey', icon: Bot, action: onShowAbout },
    ] },
  ]

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

function ActivityRail() {
  const mode = useAppStore((state) => state.leftMode)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const setMode = useAppStore((state) => state.setLeftMode)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const openMode = (next: typeof mode) => { setSettingsOpen(false); setMode(next) }
  return <nav className="activity-rail" aria-label="主要功能">
    <div className="rail-logo" title="Vinkey">V</div>
    <IconButton label="工作区文件" active={!settingsOpen && mode === 'files'} onClick={() => openMode('files')}><Files /></IconButton>
    <IconButton label="全局搜索" active={!settingsOpen && mode === 'search'} onClick={() => openMode('search')}><Search /></IconButton>
    <IconButton label="历史会话" active={!settingsOpen && mode === 'conversations'} onClick={() => openMode('conversations')}><History /></IconButton>
    <div className="rail-spacer" />
    <IconButton label="设置" active={settingsOpen} onClick={() => setSettingsOpen(true)}><Settings /></IconButton>
  </nav>
}

function WorkspacePanel({ onOpenDocument, onToggleContext }: {
  onOpenDocument: (path: string) => Promise<void>
  onToggleContext: (path: string) => Promise<void>
}) {
  const workspace = useAppStore((state) => state.workspace)
  const mode = useAppStore((state) => state.leftMode)
  const activePath = useAppStore((state) => state.activePath)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const conversations = useAppStore((state) => state.conversations)
  const conversationId = useAppStore((state) => state.conversationId)
  const setConversation = useAppStore((state) => state.setConversation)
  const setError = useAppStore((state) => state.setError)
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<Awaited<ReturnType<typeof searchWorkspace>>>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (mode !== 'search' || !workspace || !query.trim()) { setSearchHits([]); setSearching(false); return }
    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => void searchWorkspace(query).then((hits) => {
      if (active) setSearchHits(hits)
    }).catch((error) => setError(String(error))).finally(() => { if (active) setSearching(false) }), 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [mode, query, setError, workspace])

  const openWorkspace = async () => {
    try {
      const next = await chooseWorkspace()
      if (next) setWorkspace(next)
    } catch (error) { setError(String(error)) }
  }

  const runAction = async (id: typeof workspaceActions[number]['id']) => {
    if (!workspace) return openWorkspace()
    try {
      if (id === 'refresh') return setWorkspace(await refreshWorkspace())
      const label = id === 'file' ? '文档相对路径（.md / .txt）' : '文件夹相对路径'
      const value = window.prompt(label)?.trim()
      if (!value) return
      if (id === 'file') {
        const path = /\.(md|markdown|txt)$/i.test(value) ? value : `${value}.md`
        const document = await createDocument(path)
        setWorkspace(await refreshWorkspace())
        useAppStore.getState().openTab({ ...document, savedContent: document.content })
      } else {
        await createDirectory(value)
        setWorkspace(await refreshWorkspace())
      }
    } catch (error) { setError(String(error)) }
  }

  return <aside className="workspace-panel">
    <header className="panel-header">
      <div className="workspace-title">
        <span>{mode === 'files' ? workspace?.name ?? '本地工作区' : mode === 'search' ? '搜索' : '历史会话'}</span>
        {workspace && mode === 'files' && <small title={workspace.pathLabel}>{workspace.pathLabel}</small>}
      </div>
      {mode === 'files' && <div className="header-actions">
        {workspaceActions.map(({ id, label, icon: Icon }) => <IconButton key={id} label={label} onClick={() => void runAction(id)}><Icon /></IconButton>)}
      </div>}
    </header>
    {!workspace ? <div className="workspace-empty">
      <FolderOpen />
      <p>选择一个本机目录开始创作</p>
      <button className="primary-button" onClick={() => void openWorkspace()}><FolderOpen />打开文件夹</button>
      {!isDesktop() && <small>浏览器中将载入演示工作区</small>}
    </div> : mode === 'conversations' ? <div className="conversation-list">
      {conversations.map((conversation) => <button key={conversation.id} className={`conversation-item ${conversationId === conversation.id ? 'active' : ''}`} onClick={() => void loadConversation(conversation.id).then(setConversation).catch((error) => setError(String(error)))}><MessageSquareText /><span><b>{conversation.title}</b><small>{conversation.messageCount} 条消息 · {new Date(conversation.updatedAt).toLocaleString()}</small></span></button>)}
      {conversations.length === 0 && <div className="empty-small">还没有保存的会话</div>}
    </div> : <>
      <div className="tree-search"><Search /><input aria-label={mode === 'search' ? '搜索工作区内容' : '筛选工作区文件'} placeholder={mode === 'search' ? '搜索所有 Markdown / TXT' : '筛选文件'} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {mode === 'search' ? <div className="search-results">{searching && <div className="empty-small">正在搜索...</div>}{!searching && query.trim() && searchHits.map((hit) => <button key={`${hit.path}:${hit.line}:${hit.snippet}`} onClick={() => void onOpenDocument(hit.path)}><FileText /><span><b>{hit.path}</b><small>第 {hit.line} 行 · {hit.snippet}</small></span></button>)}{!searching && query.trim() && searchHits.length === 0 && <div className="empty-small">没有匹配内容</div>}{!query.trim() && <div className="empty-small">输入关键词搜索授权工作区</div>}</div>
        : <WorkspaceTree entries={workspace.entries} activePath={activePath} query={query} onOpen={(path) => void onOpenDocument(path)} onContext={(path) => void onToggleContext(path)} />}
    </>}
  </aside>
}

function ChatPanel({ onToggleContext }: { onToggleContext: (path: string) => Promise<void> }) {
  const messages = useAppStore((state) => state.messages)
  const contextDocuments = useAppStore((state) => state.contextDocuments)
  const busy = useAppStore((state) => state.busy)
  const workspace = useAppStore((state) => state.workspace)
  const conversationId = useAppStore((state) => state.conversationId)
  const conversationTitle = useAppStore((state) => state.conversationTitle)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const addMessage = useAppStore((state) => state.addMessage)
  const removeMessage = useAppStore((state) => state.removeMessage)
  const appendAssistantChunk = useAppStore((state) => state.appendAssistantChunk)
  const setConversation = useAppStore((state) => state.setConversation)
  const newConversation = useAppStore((state) => state.newConversation)
  const setActiveModelId = useAppStore((state) => state.setActiveModelId)
  const setConversations = useAppStore((state) => state.setConversations)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setError = useAppStore((state) => state.setError)
  const setBusy = useAppStore((state) => state.setBusy)
  const [prompt, setPrompt] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [contextPickerOpen, setContextPickerOpen] = useState(false)
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId) ?? null
  const budget = calculateContextBudget(messages, contextDocuments, prompt, activeModel?.contextWindow ?? 32768)
  const workspaceFiles = workspace ? flattenWorkspaceFiles(workspace.entries) : []

  const send = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    if (!activeModel) { setSettingsOpen(true); return }
    if (budget.exceedsLimit) { setError('当前消息和上下文超过模型可用窗口，请移除文档或缩短输入'); return }
    const now = Date.now()
    const nextConversationId = conversationId ?? crypto.randomUUID()
    const nextTitle = conversationId ? conversationTitle : value.replace(/\s+/g, ' ').slice(0, 28)
    if (!conversationId) setConversation({ id: nextConversationId, title: nextTitle, messages, updatedAt: now })
    setPrompt('')
    const userMessage = { id: crypto.randomUUID(), role: 'user' as const, content: value, createdAt: now }
    const assistantMessage = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', createdAt: now + 1 }
    addMessage(userMessage)
    addMessage(assistantMessage)
    setBusy(true)
    const nextRequestId = crypto.randomUUID()
    setRequestId(nextRequestId)
    try {
      await saveConversationMessage(nextConversationId, nextTitle, userMessage)
      const recent = selectRecentMessages([...messages.filter((message) => message.id !== 'welcome'), userMessage], contextDocuments, value, activeModel.contextWindow)
      const context = buildContextMessage(contextDocuments)
      await streamChat({
        requestId: nextRequestId,
        profileId: activeModel.id,
        messages: [...(context ? [{ role: 'user' as const, content: context }] : []), ...recent.map(({ role, content }) => ({ role, content }))],
      }, (event) => {
        if (event.type === 'chunk') appendAssistantChunk(assistantMessage.id, event.content)
        if (event.type === 'error') setError(event.message)
      })
      const completed = useAppStore.getState().messages.find((message) => message.id === assistantMessage.id)
      if (completed?.content) await saveConversationMessage(nextConversationId, nextTitle, completed)
      setConversations(await listConversations())
    } catch (error) {
      const message = String(error)
      if (!useAppStore.getState().messages.find((item) => item.id === assistantMessage.id)?.content) {
        removeMessage(assistantMessage.id)
      }
      if (!message.includes('请求已停止')) setError(message)
    } finally {
      setBusy(false)
      setRequestId(null)
    }
  }

  const stop = async () => { if (requestId) await cancelChat(requestId) }

  return <main className="chat-panel">
    <header className="chat-header">
      <div><h1>AI 对话区</h1><span>{conversationTitle}</span></div>
      {modelProfiles.length > 0 ? <label className="model-selector" title="选择模型"><span className="status-dot" /><select aria-label="当前模型" value={activeModelId ?? ''} onChange={(event) => setActiveModelId(event.target.value)}>{modelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select><ChevronDown /></label>
        : <button className="model-selector missing" onClick={() => setSettingsOpen(true)}>添加模型</button>}
      <IconButton label="新建会话" onClick={newConversation}><CirclePlus /></IconButton>
    </header>
    <div className="context-strip">
      <span className="context-label">上下文</span>
      {contextDocuments.length === 0 ? <span className="context-empty">右键左侧文档，或点击回形针添加</span> : contextDocuments.map((document) =>
        <button className="context-chip" key={document.path} title={`${document.path} · ${document.size} 字符`} onClick={() => void onToggleContext(document.path)}><FileText />{document.name}<X /></button>)}
    </div>
    <div className="message-stream">
      <div className="message-inner">
        {messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
          <div className="avatar">{message.role === 'assistant' ? <Bot /> : '你'}</div>
          <div className="message-body">
            <div className="message-meta">{message.role === 'assistant' ? 'Vinkey' : '你'}</div>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{message.content}</ReactMarkdown>
          </div>
        </article>)}
        {busy && <article className="message assistant"><div className="avatar"><Bot /></div><div className="message-body"><div className="message-meta">Vinkey</div><div className="typing"><i /><i /><i /></div></div></article>}
      </div>
    </div>
    <div className="composer-wrap">
      <div className="composer">
        <textarea aria-label="对话输入" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
        }} placeholder="描述你想续写、修改或梳理的内容..." />
        <div className="composer-tools">
          <div className="context-picker-anchor"><IconButton label="添加上下文文档" onClick={() => setContextPickerOpen(!contextPickerOpen)}><Paperclip /></IconButton>{contextPickerOpen && <div className="context-picker">{workspaceFiles.map((file) => <button key={file.path} onClick={() => { void onToggleContext(file.path); setContextPickerOpen(false) }}><FileText /><span>{file.path}</span>{contextDocuments.some((item) => item.path === file.path) && <Check />}</button>)}{workspaceFiles.length === 0 && <div className="empty-small">请先打开工作区</div>}</div>}</div>
          <button className="mode-button">创作模式<ChevronDown /></button>
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
  const document = tabs.find((tab) => tab.path === activePath)
  if (!document) return null
  const dirty = document.content !== document.savedContent
  const modes: ViewMode[] = ['edit', 'split', 'preview']
  const modeLabels: Record<ViewMode, string> = { edit: '编辑', split: '分栏', preview: '预览' }
  const lines = document.content.split('\n').length
  const words = document.content.trim() ? document.content.trim().split(/\s+/).length : 0

  return <aside className="editor-panel">
    <div className="document-tabs">
      <div className="document-tab active"><FileText /><span>{document.name}</span>{dirty && <i title="未保存" />}<IconButton label="关闭文档" onClick={() => closeTab(document.path)}><X /></IconButton></div>
    </div>
    <div className="editor-toolbar">
      <span className="document-path" title={document.path}>{document.path}</span>
      <IconButton label="保存文档" onClick={() => void onSave()} disabled={!dirty}><Save /></IconButton>
      <div className="segmented" aria-label="文档视图">
        {modes.map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} disabled={document.kind === 'text' && mode !== 'edit'} onClick={() => setViewMode(mode)}>{modeLabels[mode]}</button>)}
      </div>
      <IconButton label="返回对话" onClick={onClose}><PanelRightClose /></IconButton>
    </div>
    <div className={`editor-content mode-${viewMode}`}>
      {viewMode !== 'preview' && <CodeEditor key={`${document.path}:${theme}`} value={document.content} markdownEnabled={document.kind === 'markdown'} themeMode={theme} onChange={(content) => updateContent(document.path, content)} />}
      {viewMode !== 'edit' && document.kind === 'markdown' && <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{document.content}</ReactMarkdown></div>}
    </div>
    <footer className="editor-status"><span>行 {lines}</span><span>{document.content.length} 字符</span><span>{words} 词</span><span>UTF-8</span><span>{document.lineEnding.toUpperCase()}</span><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '未保存' : <><Check />已保存</>}</span></footer>
  </aside>
}

function FilePageEmpty() {
  return <div className="file-page-empty">
    <FileText />
    <strong>文件</strong>
    <p>从左侧工作区选择文档，在这里查看和编辑。</p>
  </div>
}

function ContentPanel({ page, onPageChange, hasDocument, onSave, onClose, onToggleContext }: {
  page: ContentPage
  onPageChange: (page: ContentPage) => void
  hasDocument: boolean
  onSave: () => Promise<void>
  onClose: () => void
  onToggleContext: (path: string) => Promise<void>
}) {
  return <section className="content-panel" aria-label="内容区">
    <header className="content-panel-header">
      <span className="content-panel-title">工作台</span>
      <div className="content-switcher" role="tablist" aria-label="内容页面">
        <button role="tab" aria-selected={page === 'chat'} className={page === 'chat' ? 'active' : ''} onClick={() => onPageChange('chat')}><MessageSquareText />对话</button>
        <button role="tab" aria-selected={page === 'file'} className={page === 'file' ? 'active' : ''} onClick={() => onPageChange('file')}><FileText />文件</button>
      </div>
    </header>
    <div className="content-panel-body">
      {page === 'chat' ? <ChatPanel onToggleContext={onToggleContext} /> : hasDocument ? <EditorPanel onSave={onSave} onClose={onClose} /> : <FilePageEmpty />}
    </div>
  </section>
}

export function App() {
  const workspace = useAppStore((state) => state.workspace)
  const activePath = useAppStore((state) => state.activePath)
  const tabs = useAppStore((state) => state.tabs)
  const error = useAppStore((state) => state.error)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const theme = useAppStore((state) => state.theme)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const openTab = useAppStore((state) => state.openTab)
  const toggleContext = useAppStore((state) => state.toggleContext)
  const markSaved = useAppStore((state) => state.markSaved)
  const setError = useAppStore((state) => state.setError)
  const setModelProfiles = useAppStore((state) => state.setModelProfiles)
  const setConversations = useAppStore((state) => state.setConversations)
  const [contentPage, setContentPage] = useState<ContentPage>('chat')

  const openWorkspaceFromMenu = useCallback(async () => {
    try {
      const next = await chooseWorkspace()
      if (next) setWorkspace(next)
    } catch (cause) { setError(String(cause)) }
  }, [setError, setWorkspace])

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
    } catch (cause) { setError(String(cause)) }
  }, [openWorkspaceFromMenu, setError, setWorkspace, workspace, openTab])

  const showShortcuts = useCallback(() => {
    window.alert('快捷键\n\n⌘/Ctrl + S  保存文档\n⌘/Ctrl + N  新建会话\n⌘/Ctrl + O  打开工作区\n⌘/Ctrl + W  关闭窗口\nEnter  发送消息\nShift + Enter  换行')
  }, [])

  const showAbout = useCallback(() => {
    window.alert('Vinkey 0.1.0\n\n本地优先的 AI 文学创作工作台\n文档和会话数据保存在本机。')
  }, [])

  useEffect(() => {
    if (!isDesktop() && !workspace) void chooseWorkspace().then((next) => next && setWorkspace(next))
  }, [setWorkspace, workspace])

  useEffect(() => {
    void Promise.all([listModelProfiles(), listConversations()]).then(([profiles, history]) => {
      setModelProfiles(profiles)
      setConversations(history)
    }).catch((cause) => setError(String(cause)))
  }, [setConversations, setError, setModelProfiles])

  const openDocument = useCallback(async (path: string) => {
    try {
      const existing = useAppStore.getState().tabs.find((tab) => tab.path === path)
      if (existing) { openTab(existing); setContentPage('file'); return }
      const document = await readDocument(path)
      openTab({ ...document, savedContent: document.content })
      setContentPage('file')
    } catch (cause) { setError(String(cause)) }
  }, [openTab, setError])

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
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveActive() }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [saveActive])

  const hasActiveDocument = useMemo(() => tabs.some((tab) => tab.path === activePath), [activePath, tabs])

  return <div className="app-frame" data-theme={theme}>
    <TitleBar onPageChange={setContentPage} onOpenWorkspace={() => void openWorkspaceFromMenu()} onNewDocument={() => void newDocumentFromMenu()} onSave={() => void saveActive()} onShowShortcuts={showShortcuts} onShowAbout={showAbout} />
    <div className="app-shell" data-theme={theme}>
      <ActivityRail />
      {settingsOpen ? <SettingsPage /> : <>
        <WorkspacePanel onOpenDocument={openDocument} onToggleContext={toggleDocumentContext} />
        <ContentPanel page={contentPage} onPageChange={setContentPage} hasDocument={hasActiveDocument} onSave={saveActive} onClose={() => setContentPage('chat')} onToggleContext={toggleDocumentContext} />
      </>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError(null)}><X /></button></div>}
    </div>
  </div>
}
