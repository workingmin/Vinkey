import {
  Bot, Check, ChevronDown, CirclePlus, FileText, Files, FolderOpen, History,
  MessageSquareText, PanelRightClose, PanelRightOpen, Paperclip, RefreshCw,
  Save, Search, Send, Settings, Square, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { CodeEditor } from './components/CodeEditor'
import { WorkspaceTree, workspaceActions } from './components/WorkspaceTree'
import {
  chooseWorkspace, createDirectory, createDocument, isDesktop, readDocument,
  refreshWorkspace, saveDocument,
} from './lib/desktop'
import { useAppStore } from './store'
import type { DocumentSnapshot, ViewMode } from './types'

function IconButton({ label, active = false, children, onClick, disabled = false }: {
  label: string; active?: boolean; children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return <button className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>
}

function ActivityRail() {
  const mode = useAppStore((state) => state.leftMode)
  const setMode = useAppStore((state) => state.setLeftMode)
  return <nav className="activity-rail" aria-label="主要功能">
    <div className="rail-logo" title="Vinkey">V</div>
    <IconButton label="工作区文件" active={mode === 'files'} onClick={() => setMode('files')}><Files /></IconButton>
    <IconButton label="全局搜索" active={mode === 'search'} onClick={() => setMode('search')}><Search /></IconButton>
    <IconButton label="历史会话" active={mode === 'conversations'} onClick={() => setMode('conversations')}><History /></IconButton>
    <div className="rail-spacer" />
    <IconButton label="设置"><Settings /></IconButton>
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
  const setError = useAppStore((state) => state.setError)
  const [query, setQuery] = useState('')

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
      <button className="conversation-item active"><MessageSquareText /><span><b>雾港来信 · 第一章</b><small>刚刚</small></span></button>
      <button className="conversation-item"><MessageSquareText /><span><b>人物动机梳理</b><small>昨天</small></span></button>
    </div> : <>
      <div className="tree-search"><Search /><input aria-label="筛选工作区文件" placeholder={mode === 'search' ? '搜索文件内容（即将支持）' : '筛选文件'} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <WorkspaceTree entries={workspace.entries} activePath={activePath} query={query} onOpen={(path) => void onOpenDocument(path)} onContext={(path) => void onToggleContext(path)} />
    </>}
  </aside>
}

function ChatPanel({ onToggleContext }: { onToggleContext: (path: string) => Promise<void> }) {
  const messages = useAppStore((state) => state.messages)
  const contextDocuments = useAppStore((state) => state.contextDocuments)
  const busy = useAppStore((state) => state.busy)
  const addMessage = useAppStore((state) => state.addMessage)
  const setBusy = useAppStore((state) => state.setBusy)
  const [prompt, setPrompt] = useState('')

  const send = () => {
    const value = prompt.trim()
    if (!value || busy) return
    setPrompt('')
    addMessage({ id: crypto.randomUUID(), role: 'user', content: value, createdAt: Date.now() })
    setBusy(true)
    window.setTimeout(() => {
      const contextNote = contextDocuments.length > 0 ? `我参考了你附加的 ${contextDocuments.map((item) => `《${item.name}》`).join('、')}。` : ''
      addMessage({
        id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(),
        content: `${contextNote}\n\n当前是界面演示模式。模型适配层接入后，这里会流式显示 Ollama 或 OpenAI 兼容模型的回答，并将改稿建议送到右侧审核。`,
      })
      setBusy(false)
    }, 700)
  }

  return <main className="chat-panel">
    <header className="chat-header">
      <div><h1>AI 对话区</h1><span>雾港来信 · 第一章</span></div>
      <button className="model-selector" title="选择模型"><span className="status-dot" />Qwen 2.5 · Ollama<ChevronDown /></button>
      <IconButton label="新建会话"><CirclePlus /></IconButton>
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
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{message.content}</ReactMarkdown>
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
          <IconButton label="添加上下文文档"><Paperclip /></IconButton>
          <button className="mode-button">创作模式<ChevronDown /></button>
          <span className="composer-hint">Enter 发送 · Shift+Enter 换行</span>
          <button className="send-button" aria-label={busy ? '停止生成' : '发送'} onClick={busy ? () => setBusy(false) : send}>{busy ? <Square /> : <Send />}</button>
        </div>
      </div>
    </div>
  </main>
}

function EditorPanel({ onSave }: { onSave: () => Promise<void> }) {
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const viewMode = useAppStore((state) => state.viewMode)
  const closeTab = useAppStore((state) => state.closeTab)
  const updateContent = useAppStore((state) => state.updateContent)
  const setViewMode = useAppStore((state) => state.setViewMode)
  const setEditorVisible = useAppStore((state) => state.setEditorVisible)
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
      <IconButton label="收起编辑器" onClick={() => setEditorVisible(false)}><PanelRightClose /></IconButton>
    </div>
    <div className={`editor-content mode-${viewMode}`}>
      {viewMode !== 'preview' && <CodeEditor key={document.path} value={document.content} markdownEnabled={document.kind === 'markdown'} onChange={(content) => updateContent(document.path, content)} />}
      {viewMode !== 'edit' && document.kind === 'markdown' && <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{document.content}</ReactMarkdown></div>}
    </div>
    <footer className="editor-status"><span>行 {lines}</span><span>{document.content.length} 字符</span><span>{words} 词</span><span>UTF-8</span><span>{document.lineEnding.toUpperCase()}</span><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '未保存' : <><Check />已保存</>}</span></footer>
  </aside>
}

export function App() {
  const workspace = useAppStore((state) => state.workspace)
  const editorVisible = useAppStore((state) => state.editorVisible)
  const activePath = useAppStore((state) => state.activePath)
  const tabs = useAppStore((state) => state.tabs)
  const error = useAppStore((state) => state.error)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const openTab = useAppStore((state) => state.openTab)
  const toggleContext = useAppStore((state) => state.toggleContext)
  const markSaved = useAppStore((state) => state.markSaved)
  const setEditorVisible = useAppStore((state) => state.setEditorVisible)
  const setError = useAppStore((state) => state.setError)

  useEffect(() => {
    if (!isDesktop() && !workspace) void chooseWorkspace().then((next) => next && setWorkspace(next))
  }, [setWorkspace, workspace])

  const openDocument = useCallback(async (path: string) => {
    try {
      const existing = useAppStore.getState().tabs.find((tab) => tab.path === path)
      if (existing) return openTab(existing)
      const document = await readDocument(path)
      openTab({ ...document, savedContent: document.content })
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

  return <div className="app-shell">
    <ActivityRail />
    <WorkspacePanel onOpenDocument={openDocument} onToggleContext={toggleDocumentContext} />
    <ChatPanel onToggleContext={toggleDocumentContext} />
    {editorVisible && hasActiveDocument && <EditorPanel onSave={saveActive} />}
    {!editorVisible && hasActiveDocument && <button className="reopen-editor" title="展开编辑器" aria-label="展开编辑器" onClick={() => setEditorVisible(true)}><PanelRightOpen /></button>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError(null)}><X /></button></div>}
  </div>
}
