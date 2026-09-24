import {
  Bot, Check, ChevronDown, CirclePlus, Download, Eye, FileText, Folder, FolderOpen,
  MessageSquareText, PanelLeftClose, PanelLeftOpen, PanelRightClose,
  Save, Search, Send, Settings, Square, X, Minus, Maximize2, Minimize2,
  RotateCcw, RotateCw, Copy, Scissors, Clipboard, Moon, Sun, Keyboard, ListChecks, RefreshCw,
  ScrollText, Trash2, WandSparkles,
} from 'lucide-react'
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { CodeEditor } from './components/CodeEditor'
import { FilePreview, downloadBytes } from './components/FilePreview'
import { SettingsPage } from './components/SettingsPage'
import { LogCenter } from './components/LogCenter'
import { ConversationTaskControls } from './components/ConversationTaskControls'
import { MessageActivity } from './components/MessageActivity'
import { TaskRequestSummary } from './components/TaskRequestSummary'
import { MarkdownContent } from './components/MarkdownContent'
import { ProjectSessionSidebar } from './components/ProjectSessionSidebar'
import { WorkspaceTree, workspaceActions } from './components/WorkspaceTree'
import {
  activateProject, deleteProject, listProjects,
  cancelChat, cancelTaskJob, chooseWorkspace, createDirectory, createDocument, executeTask, isDesktop, listConversations,
  getActiveModelId, getWindowDiagnostics, getRuntimeDiagnostics, listModelProfiles, loadConversation, persistActiveModelId, readDocument, readFileBytes, refreshWorkspace,
  recordRuntimeEvent, writeStructureOutputs,
  saveConversationMessage, saveDocument, streamChat, syncNativeWindowTheme,
  confirmProjectMemory, listProjectMemory, proposeProjectMemory, rejectProjectMemory, searchProjectMemory,
} from './lib/desktop'
import { buildRevisionContextMessage, calculateContextBudget, selectRecentMessages } from './lib/context'
import { analyzeLongText, buildTaskDisplayTitle, cancelLongTextAnalysis } from './lib/longTextAnalysis'
import { buildConversationReference, createTaskMessageRef, createTaskRequest, refineTaskForDocuments, routeTask } from './lib/taskRuntime'
import type { TaskExecutionDispatch } from './lib/taskRuntime'
import { extractDocumentMentionPaths } from './lib/intent'
import { createToolGateway } from './lib/runtimePolicy'
import { isContextRecoveryResponse } from './lib/contextRecovery'
import { buildMemoryCandidates, buildProjectMemoryContext, selectRelevantMemory } from './lib/projectMemory'
import { formatStructureResult, segmentDocument } from './lib/structureSegmentation'
import { useAppStore, type ChatRun } from './store'
import type { ChatActivity, ChatMessage, ChatRunResult, ChatRunStatus, DiffProposal, DocumentSnapshot, ProjectMemoryItem, ProjectSummary, ViewMode, WorkspaceEntry } from './types'
import { getDocumentKind, getLanguageName, isEditableDocument } from './lib/fileTypes'
import { findNewTextFiles, flattenWorkspaceFiles } from './lib/tree'
import { readWorkspaceDocuments } from './lib/workspaceAnalysis'
import { buildSelectedDocumentsOverviewMessage, formatWorkspaceOverview } from './lib/workspaceOverview'
import { normalizeServiceError } from './lib/serviceError'
import { buildDocumentIndexMessage } from './lib/documentMetadata'
import { buildFocusedWorkspaceMessage } from './lib/focusedAnalysis'
import { isLoopbackModelEndpoint } from './lib/modelPrivacy'

import {
  buildMultiFileRevisionContract, buildMultiFileRevisionTargets, buildSelectionRevisionContract,
  createDiffProposal, createMultiFileDiffProposals, fingerprintDocument,
  formatDiffProposalMessage, formatMultiFileDiffProposalMessage,
} from './lib/diffProposal'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import type { PredefinedMenuItemOptions } from '@tauri-apps/api/menu'
import {
  TITLE_BAR_MENU_CONTRACT_VERSION,
  TITLE_BAR_MENU_ITEM_LABELS,
  TITLE_BAR_MENU_LABELS,
  type TitleBarMenuId,
  type TitleBarMenuItemId,
} from './lib/titleBarMenu'
import {
  canExecuteEditCommand,
  EDIT_STATE_CHANGE_EVENT,
  executeEditCommand,
  recordEditTarget,
  rememberEditTarget,
  resolveEditCommandTarget,
  type EditCommand,
  type EditCommandTarget,
} from './lib/editCommands'

function formatError(error: unknown): string {
  return normalizeServiceError(error).message
}

const RESPONSE_BATCH_MARKER = '\n\n<!-- vinkey-response-batch -->\n\n'

async function appendMarkdownBatches(
  conversationId: string,
  content: string,
  append: (conversationId: string, chunk: string) => void,
  setStatus: (conversationId: string, status: ChatRunStatus, message?: string | null) => void,
): Promise<void> {
  const blocks = content.trim().split(/\n{2,}/u).filter(Boolean)
  if (blocks.length === 0) return
  for (const [index, block] of blocks.entries()) {
    setStatus(conversationId, 'streaming', `已生成第 ${index + 1} / ${blocks.length} 段结果`)
    append(conversationId, `${index === 0 ? '' : RESPONSE_BATCH_MARKER}${block}`)
    // Yield between Markdown blocks so the message stream can paint progress without
    // exposing hidden model reasoning or creating one activity row per token.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }
}

type ContentPage = 'chat' | 'file' | 'logs'

const isMacPlatform = () => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

async function installMacMenu(callbacks: {
  newConversation: () => void
  openWorkspace: () => void
  refreshWorkspace: () => void
  changePage: (page: ContentPage) => void
  toggleTheme: () => void
  openSettings: () => void
  showShortcuts: () => void
  showWindowDiagnostics: () => void
  showRuntimeDiagnostics: () => void
}, hasWorkspace: boolean) {
  const menuItem = (text: string, action: () => void, accelerator?: string, enabled = true) => MenuItem.new({ text, accelerator, enabled, action: () => action() })
  const nativeItem = (item: PredefinedMenuItemOptions['item'], text: string) => PredefinedMenuItem.new({ item, text })
  const refreshProjectItem = await menuItem(TITLE_BAR_MENU_ITEM_LABELS.refreshProject, callbacks.refreshWorkspace, 'CmdOrCtrl+R', hasWorkspace)
  const project = await Submenu.new({ text: TITLE_BAR_MENU_LABELS.project, items: [
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.addProject, callbacks.openWorkspace, 'CmdOrCtrl+O'),
    refreshProjectItem,
  ] })
  const conversation = await Submenu.new({ text: TITLE_BAR_MENU_LABELS.conversation, items: [
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.newConversation, callbacks.newConversation, 'CmdOrCtrl+N'),
  ] })
  const edit = await Submenu.new({ text: TITLE_BAR_MENU_LABELS.edit, items: [
    await nativeItem('Undo', TITLE_BAR_MENU_ITEM_LABELS.undo),
    await nativeItem('Redo', TITLE_BAR_MENU_ITEM_LABELS.redo),
    await nativeItem('Cut', TITLE_BAR_MENU_ITEM_LABELS.cut),
    await nativeItem('Copy', TITLE_BAR_MENU_ITEM_LABELS.copy),
    await nativeItem('Paste', TITLE_BAR_MENU_ITEM_LABELS.paste),
    await nativeItem('SelectAll', TITLE_BAR_MENU_ITEM_LABELS.selectAll),
  ] })
  const view = await Submenu.new({ text: TITLE_BAR_MENU_LABELS.view, items: [
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.chat, () => callbacks.changePage('chat')),
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.files, () => callbacks.changePage('file')),
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.logs, () => callbacks.changePage('logs')),
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.toggleTheme, callbacks.toggleTheme),
  ] })
  const windowMenu = await Submenu.new({ text: TITLE_BAR_MENU_LABELS.window, items: [
    await nativeItem('Minimize', TITLE_BAR_MENU_ITEM_LABELS.minimize),
    await nativeItem('Maximize', TITLE_BAR_MENU_ITEM_LABELS.zoom),
    await nativeItem('Fullscreen', TITLE_BAR_MENU_ITEM_LABELS.fullscreen),
    await nativeItem('CloseWindow', TITLE_BAR_MENU_ITEM_LABELS.closeWindow),
  ] })
  const help = await Submenu.new({ text: TITLE_BAR_MENU_LABELS.help, items: [
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.shortcuts, callbacks.showShortcuts),
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.windowDiagnostics, callbacks.showWindowDiagnostics),
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.runtimeDiagnostics, callbacks.showRuntimeDiagnostics),
  ] })
  let version = '0.1.0'
  try { version = (await getRuntimeDiagnostics()).version } catch { /* package metadata remains the fallback */ }
  const appMenu = await Submenu.new({ text: 'Vinkey', items: [
    await PredefinedMenuItem.new({ item: { About: { name: 'Vinkey', version, comments: '本地优先的 AI 文学创作工作台' } }, text: TITLE_BAR_MENU_ITEM_LABELS.about }),
    await menuItem(TITLE_BAR_MENU_ITEM_LABELS.settings, callbacks.openSettings, 'CmdOrCtrl+,'),
    await nativeItem('Services', '服务'),
    await nativeItem('Hide', '隐藏 Vinkey'),
    await nativeItem('HideOthers', '隐藏其他'),
    await nativeItem('ShowAll', '显示全部'),
    await nativeItem('Quit', '退出 Vinkey'),
  ] })
  const menu = await Menu.new({ items: [appMenu, project, conversation, edit, view, windowMenu, help] })
  await menu.setAsAppMenu()
  await windowMenu.setAsWindowsMenuForNSApp()
  await help.setAsHelpMenuForNSApp()
  return { refreshProjectItem }
}

type AppMenuItem = {
  id: TitleBarMenuItemId
  label: string
  shortcut?: string
  icon?: React.ComponentType<{ size?: number }>
  disabled?: boolean
  action: () => void
}

type AppMenuGroup = { id: TitleBarMenuId; label: string; items: AppMenuItem[] }

export function TitleBar({ onPageChange, onOpenWorkspace, onNewConversation, onRefreshWorkspace, onShowShortcuts, onShowAbout, onShowWindowDiagnostics, onShowRuntimeDiagnostics }: {
  onPageChange: (page: ContentPage) => void
  onOpenWorkspace: () => void
  onNewConversation: () => void
  onRefreshWorkspace: () => void
  onShowShortcuts: () => void
  onShowAbout: () => void
  onShowWindowDiagnostics: () => void
  onShowRuntimeDiagnostics: () => void
}) {
  const workspace = useAppStore((state) => state.workspace)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const setError = useAppStore((state) => state.setError)
  const [openMenu, setOpenMenu] = useState<TitleBarMenuId | null>(null)
  const [editTarget, setEditTarget] = useState<EditCommandTarget | null>(null)
  const [, setEditStateRevision] = useState(0)
  const [maximized, setMaximized] = useState(false)
  const editTargetRef = useRef<EditCommandTarget | null>(null)
  const triggerRefs = useRef<Partial<Record<TitleBarMenuId, HTMLButtonElement | null>>>({})
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId)
  const isMac = isMacPlatform()
  const mod = isMac ? '⌘' : 'Ctrl'

  useEffect(() => {
    if (!isDesktop()) return
    void getCurrentWindow().isMaximized().then(setMaximized).catch(() => undefined)
  }, [])

  useEffect(() => {
    const close = () => setOpenMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !openMenu) return
      event.preventDefault()
      const trigger = triggerRefs.current[openMenu]
      close()
      trigger?.focus()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKeyDown) }
  }, [openMenu])

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = resolveEditCommandTarget(event.target)
      if (!target) {
        if (event.target instanceof Element && event.target.closest('.app-menus')) return
        editTargetRef.current = null
        setEditTarget(null)
        return
      }
      rememberEditTarget(target)
      editTargetRef.current = target
      setEditTarget(target)
      setEditStateRevision((value) => value + 1)
    }
    const record = (event: Event) => {
      recordEditTarget(event.target)
      if (resolveEditCommandTarget(event.target) === editTargetRef.current) setEditStateRevision((value) => value + 1)
    }
    const refreshState = () => setEditStateRevision((value) => value + 1)
    window.addEventListener('focusin', remember)
    window.addEventListener('input', record)
    window.addEventListener('selectionchange', refreshState)
    window.addEventListener(EDIT_STATE_CHANGE_EVENT, refreshState)
    return () => {
      window.removeEventListener('focusin', remember)
      window.removeEventListener('input', record)
      window.removeEventListener('selectionchange', refreshState)
      window.removeEventListener(EDIT_STATE_CHANGE_EVENT, refreshState)
    }
  }, [])

  const windowAction = async (action: 'minimize' | 'toggle' | 'close') => {
    if (!isDesktop()) return
    const win = getCurrentWindow()
    if (action === 'minimize') await win.minimize()
    if (action === 'toggle') { await win.toggleMaximize(); setMaximized(await win.isMaximized()) }
    if (action === 'close') await win.close()
  }

  const editAction = (command: EditCommand) => {
    void executeEditCommand(editTargetRef.current, command).catch((cause) => setError(`编辑命令执行失败：${String(cause)}`))
  }
  const menus: AppMenuGroup[] = [
    { id: 'project', label: TITLE_BAR_MENU_LABELS.project, items: [
      { id: 'addProject', label: TITLE_BAR_MENU_ITEM_LABELS.addProject, shortcut: `${mod} O`, icon: FolderOpen, action: onOpenWorkspace },
      { id: 'refreshProject', label: TITLE_BAR_MENU_ITEM_LABELS.refreshProject, shortcut: `${mod} R`, icon: RefreshCw, disabled: !workspace, action: onRefreshWorkspace },
    ] },
    { id: 'conversation', label: TITLE_BAR_MENU_LABELS.conversation, items: [
      { id: 'newConversation', label: TITLE_BAR_MENU_ITEM_LABELS.newConversation, shortcut: `${mod} N`, icon: CirclePlus, action: onNewConversation },
    ] },
    { id: 'edit', label: TITLE_BAR_MENU_LABELS.edit, items: [
      { id: 'undo', label: TITLE_BAR_MENU_ITEM_LABELS.undo, shortcut: `${mod} Z`, icon: RotateCcw, disabled: !canExecuteEditCommand(editTarget, 'undo'), action: () => editAction('undo') },
      { id: 'redo', label: TITLE_BAR_MENU_ITEM_LABELS.redo, shortcut: isMac ? '⇧ ⌘ Z' : 'Ctrl Y', icon: RotateCw, disabled: !canExecuteEditCommand(editTarget, 'redo'), action: () => editAction('redo') },
      { id: 'cut', label: TITLE_BAR_MENU_ITEM_LABELS.cut, shortcut: `${mod} X`, icon: Scissors, disabled: !canExecuteEditCommand(editTarget, 'cut'), action: () => editAction('cut') },
      { id: 'copy', label: TITLE_BAR_MENU_ITEM_LABELS.copy, shortcut: `${mod} C`, icon: Copy, disabled: !canExecuteEditCommand(editTarget, 'copy'), action: () => editAction('copy') },
      { id: 'paste', label: TITLE_BAR_MENU_ITEM_LABELS.paste, shortcut: `${mod} V`, icon: Clipboard, disabled: !canExecuteEditCommand(editTarget, 'paste'), action: () => editAction('paste') },
      { id: 'selectAll', label: TITLE_BAR_MENU_ITEM_LABELS.selectAll, shortcut: `${mod} A`, icon: ListChecks, disabled: !canExecuteEditCommand(editTarget, 'selectAll'), action: () => editAction('selectAll') },
    ] },
    { id: 'view', label: TITLE_BAR_MENU_LABELS.view, items: [
      { id: 'chat', label: TITLE_BAR_MENU_ITEM_LABELS.chat, icon: MessageSquareText, action: () => onPageChange('chat') },
      { id: 'files', label: TITLE_BAR_MENU_ITEM_LABELS.files, icon: FileText, action: () => onPageChange('file') },
      { id: 'logs', label: TITLE_BAR_MENU_ITEM_LABELS.logs, icon: ScrollText, action: () => onPageChange('logs') },
      { id: 'toggleTheme', label: TITLE_BAR_MENU_ITEM_LABELS.toggleTheme, icon: theme === 'dark' ? Sun : Moon, action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    ] },
    { id: 'window', label: TITLE_BAR_MENU_LABELS.window, items: [
      { id: 'minimize', label: TITLE_BAR_MENU_ITEM_LABELS.minimize, shortcut: `${mod} M`, icon: Minus, action: () => void windowAction('minimize') },
      { id: maximized ? 'restore' : 'maximize', label: maximized ? TITLE_BAR_MENU_ITEM_LABELS.restore : TITLE_BAR_MENU_ITEM_LABELS.maximize, icon: maximized ? Minimize2 : Maximize2, action: () => void windowAction('toggle') },
      { id: 'closeWindow', label: TITLE_BAR_MENU_ITEM_LABELS.closeWindow, shortcut: `${mod} W`, icon: X, action: () => void windowAction('close') },
    ] },
    { id: 'help', label: TITLE_BAR_MENU_LABELS.help, items: [
      { id: 'shortcuts', label: TITLE_BAR_MENU_ITEM_LABELS.shortcuts, icon: Keyboard, action: onShowShortcuts },
      { id: 'windowDiagnostics', label: TITLE_BAR_MENU_ITEM_LABELS.windowDiagnostics, icon: Settings, action: onShowWindowDiagnostics },
      { id: 'runtimeDiagnostics', label: TITLE_BAR_MENU_ITEM_LABELS.runtimeDiagnostics, icon: ScrollText, action: onShowRuntimeDiagnostics },
      { id: 'about', label: TITLE_BAR_MENU_ITEM_LABELS.about, icon: Bot, action: onShowAbout },
    ] },
  ]

  const focusMenuItem = (menuId: TitleBarMenuId, position: 'first' | 'last') => {
    window.requestAnimationFrame(() => {
      const items = Array.from(document.querySelectorAll<HTMLButtonElement>(`#title-bar-menu-${menuId} [role="menuitem"]:not(:disabled)`))
      items[position === 'first' ? 0 : items.length - 1]?.focus()
    })
  }

  const handleMenuKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
    else if (event.key === 'ArrowUp') next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next === null) return
    event.preventDefault()
    items[next].focus()
  }

  if (isMac) return null
  return <header className="title-bar" data-tauri-drag-region onDoubleClick={() => void windowAction('toggle')}>
    <div className="title-bar-brand" data-tauri-drag-region><span className="title-bar-mark">V</span><strong>Vinkey</strong><span className="title-bar-context">{workspace?.name ?? '本地工作台'}{activeModel ? ` · ${activeModel.name}` : ''}</span></div>
    <nav className="app-menus" aria-label="应用菜单" data-menu-contract={TITLE_BAR_MENU_CONTRACT_VERSION} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      {menus.map((menu) => <div className="app-menu" key={menu.id} data-menu-id={menu.id}>
        <button
          ref={(node) => { triggerRefs.current[menu.id] = node }}
          className={`app-menu-trigger ${openMenu === menu.id ? 'active' : ''}`}
          aria-expanded={openMenu === menu.id}
          aria-haspopup="menu"
          aria-controls={`title-bar-menu-${menu.id}`}
          data-testid={`title-bar-menu-${menu.id}`}
          onMouseDown={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
            event.preventDefault()
            setOpenMenu(menu.id)
            focusMenuItem(menu.id, event.key === 'ArrowUp' ? 'last' : 'first')
          }}
          onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
        >{menu.label}</button>
        {openMenu === menu.id && <div id={`title-bar-menu-${menu.id}`} className="app-menu-dropdown" role="menu" aria-label={`${menu.label}菜单`} onKeyDown={handleMenuKeys}>{menu.items.map((item) => <button
          key={item.id}
          role="menuitem"
          data-menu-item-id={item.id}
          data-testid={`title-bar-menu-item-${item.id}`}
          disabled={item.disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { item.action(); setOpenMenu(null) }}
        >{item.icon && <item.icon size={14} />}<span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div>}
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

const chatStatusMeta: Record<ChatRunStatus, { label: string; title: string }> = {
  sending: { label: '发送中', title: 'sending · 正在提交消息' },
  thinking: { label: '思考中', title: 'thinking · 正在理解你的请求' },
  fetching: { label: '读取资料', title: 'fetching · 正在准备文档和上下文' },
  tool_calling: { label: '执行分析', title: 'tool_calling · 正在执行分析流程' },
  streaming: { label: '生成中', title: 'streaming · 正在返回内容' },
  stopping: { label: '停止中', title: 'stopping · 正在等待请求结束' },
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

function ChatMessageItem({ message, activity, taskDescription, onCopyError }: {
  message: ChatMessage
  activity?: { status: ChatRunStatus; statusMessage: string | null; activityLog: ChatActivity[] }
  taskDescription?: string | null
  onCopyError: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const copyTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
  }, [])


  useEffect(() => {
    if (!activity) return
    setClock(Date.now())
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activity])

  const copyMessage = async () => {
    if (!message.content.trim()) return
    try {
      await navigator.clipboard.writeText(message.content.replaceAll(RESPONSE_BATCH_MARKER, '\n\n'))
      setCopied(true)
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch (error) { onCopyError(`复制消息失败：${String(error)}`) }
  }

  const isAssistant = message.role === 'assistant'
  const activityLog = activity?.activityLog ?? message.activityLog ?? []
  const displayTimestamp = activity ? clock : (message.completedAt ?? message.createdAt)
  const timestamp = new Date(displayTimestamp)
  const formattedTime = timestamp.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  return <article id={`message-${message.id}`} data-message-id={message.id} tabIndex={-1} aria-label={isAssistant ? '助手消息' : '用户消息'} className={`message ${message.role}`}>
    <div className="message-stack">
      {isAssistant && <MessageActivity items={activityLog} active={Boolean(activity)} taskDescription={taskDescription} />}
      {!isAssistant && <TaskRequestSummary task={message.taskRef} />}
      {isAssistant && taskDescription && activityLog.length > 0 && message.content && <div className="message-result-label">详细结果</div>}
      <div className="message-bubble">
        {message.content ? message.content.split(RESPONSE_BATCH_MARKER).map((batch, index) => <section className="message-result-batch" key={`${message.id}-result-${index}`}><MarkdownContent content={batch} /></section>)
          : activity ? <div className="typing" aria-label={activity.statusMessage ?? chatStatusMeta[activity.status].label}><i /><i /><i /></div> : null}
      </div>
      <div className="message-actions">
        {message.content && <button type="button" onClick={() => void copyMessage()} title={copied ? '已复制' : '复制消息'} aria-label={copied ? '已复制' : '复制消息'}>{copied ? <Check /> : <Copy />}<span>{copied ? '已复制' : '复制'}</span></button>}
        <time dateTime={timestamp.toISOString()}>{formattedTime}</time>
      </div>
    </div>
  </article>
}

type PendingMemory = { items: ProjectMemoryItem[]; sourceMessageId: string | null }

interface ChatMessageStreamProps {
  messages: ChatMessage[]
  activeChatRun?: ChatRun
  pendingDiffSourceMessageId: string | null
  diffProposals: DiffProposal[]
  pendingMemory: PendingMemory | null
  onCopyError: (message: string) => void
  onApplyPendingDiff: () => void
  onRejectDiffProposal: (proposalId: string) => void
  onReviewDiff: () => void
  onApprovePendingMemory: () => void
  onRejectPendingMemory: () => void
}

const ChatMessageStream = memo(function ChatMessageStream({
  messages,
  activeChatRun,
  pendingDiffSourceMessageId,
  diffProposals,
  pendingMemory,
  onCopyError,
  onApplyPendingDiff,
  onRejectDiffProposal,
  onReviewDiff,
  onApprovePendingMemory,
  onRejectPendingMemory,
}: ChatMessageStreamProps) {
  return <div className="message-stream">
    <div className="message-inner">
      {messages.map((message, index) => <Fragment key={message.id}>
        <ChatMessageItem
          message={message}
          activity={activeChatRun?.assistantMessage.id === message.id ? activeChatRun : undefined}
          taskDescription={message.role === 'assistant'
            && messages[index - 1]?.role === 'user'
            && messages[index - 1]?.taskRef
            && messages[index - 1]?.taskRef?.intent !== 'general-chat'
            ? messages[index - 1]?.content
            : null}
          onCopyError={onCopyError}
        />
        {message.role === 'assistant' && pendingDiffSourceMessageId === message.id && diffProposals.some((proposal) => proposal.status === 'proposed') && (() => {
          const proposal = diffProposals.find((item) => item.status === 'proposed')!
          const pendingCount = diffProposals.filter((item) => item.status === 'proposed').length
          return <aside className="new-files-notice turn-action-panel diff-proposal-notice" role="status">
            <div className="new-files-notice-copy"><WandSparkles /><span><strong>{pendingCount} 个修改提案待审核</strong><small>{proposal.path} · {proposal.chunkCount ? `${(proposal.chunkIndex ?? 0) + 1}/${proposal.chunkCount} 块` : `${proposal.from}-${proposal.to}`}</small></span></div>
            <div className="new-files-notice-actions"><button onClick={onApplyPendingDiff}>接受此块</button><button onClick={() => onRejectDiffProposal(proposal.id)}>拒绝此块</button><button onClick={() => { const tab = useAppStore.getState().tabs.find((item) => item.path === proposal.path); if (tab) useAppStore.getState().openTab(tab); onReviewDiff() }}>查看文档</button></div>
          </aside>
        })()}
        {message.role === 'assistant' && pendingMemory?.sourceMessageId === message.id && pendingMemory.items.length > 0 && <aside className="new-files-notice turn-action-panel memory-notice" role="status">
          <div className="new-files-notice-copy"><Check /><span><strong>发现 {pendingMemory.items.length} 条项目记忆候选</strong><small>{pendingMemory.items[0].title} · 仅确认后写入本项目</small></span></div>
          <div className="new-files-notice-actions"><button onClick={onApprovePendingMemory}>确认写入</button><button onClick={onRejectPendingMemory}>忽略</button></div>
        </aside>}
      </Fragment>)}
      {pendingMemory?.sourceMessageId === null && pendingMemory.items.length > 0 && <aside className="new-files-notice history-action-panel memory-notice" role="status">
        <div className="new-files-notice-copy"><Check /><span><strong>{pendingMemory.items.length} 条项目记忆候选待处理</strong><small>{pendingMemory.items[0].title} · 历史来源任务未记录消息归属</small></span></div>
        <div className="new-files-notice-actions"><button onClick={onApprovePendingMemory}>确认写入</button><button onClick={onRejectPendingMemory}>忽略</button></div>
      </aside>}
    </div>
  </div>
})

function ChatPanel({ onToggleContext, onReviewDiff }: { onToggleContext: (path: string) => Promise<void>; onReviewDiff: () => void }) {
  const workspace = useAppStore((state) => state.workspace)
  const projectTransition = useAppStore((state) => state.projectTransition)
  const pendingChatRequests = useAppStore((state) => state.pendingChatRequests)
  const messages = useAppStore((state) => state.messages)
  const contextDocuments = useAppStore((state) => state.contextDocuments)
  const chatRuns = useAppStore((state) => state.chatRuns)
  const conversationId = useAppStore((state) => state.conversationId)
  const conversationTitle = useAppStore((state) => state.conversationTitle)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const beginChatRun = useAppStore((state) => state.beginChatRun)
  const setChatRunStatus = useAppStore((state) => state.setChatRunStatus)
  const recordWorkerEvent = useAppStore((state) => state.recordWorkerEvent)
  const appendChatRunChunk = useAppStore((state) => state.appendChatRunChunk)
  const resetChatRunResponse = useAppStore((state) => state.resetChatRunResponse)
  const endChatRun = useAppStore((state) => state.endChatRun)
  const setConversation = useAppStore((state) => state.setConversation)
  const setConversations = useAppStore((state) => state.setConversations)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const activePath = useAppStore((state) => state.activePath)
  const tabs = useAppStore((state) => state.tabs)
  const addContextDocument = useAppStore((state) => state.toggleContext)
  const setError = useAppStore((state) => state.setError)
  const pendingNewFiles = useAppStore((state) => state.pendingNewFiles)
  const clearPendingNewFiles = useAppStore((state) => state.clearPendingNewFiles)
  const pendingEditorRevision = useAppStore((state) => state.pendingEditorRevision)
  const clearPendingEditorRevision = useAppStore((state) => state.clearPendingEditorRevision)
  const diffProposals = useAppStore((state) => state.diffProposals)
  const setDiffProposals = useAppStore((state) => state.setDiffProposals)
  const applyDiffProposal = useAppStore((state) => state.applyDiffProposal)
  const rejectDiffProposal = useAppStore((state) => state.rejectDiffProposal)
  const [prompt, setPrompt] = useState('')
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)
  const [pendingMemory, setPendingMemory] = useState<{ items: ProjectMemoryItem[]; sourceMessageId: string | null } | null>(null)
  const [pendingDiffSourceMessageId, setPendingDiffSourceMessageId] = useState<string | null>(null)
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId) ?? null
  const activeChatRun = conversationId ? chatRuns[conversationId] : undefined
  const busy = Boolean(activeChatRun)
  const activeStatus = activeChatRun ? chatStatusMeta[activeChatRun.status] : null
  const isNewConversation = conversationId === null
    && pendingChatRequests === 0
    && messages.length === 0

  useEffect(() => {
    if (!pendingEditorRevision) return
    setPendingActionId('document-revision')
    setPrompt(pendingEditorRevision.instruction)
    window.setTimeout(() => promptRef.current?.focus(), 0)
  }, [pendingEditorRevision])

  useEffect(() => {
    if (!workspace) { setPendingMemory(null); return }
    void listProjectMemory('proposed')
      .then((items) => setPendingMemory(items.length > 0 ? { items, sourceMessageId: null } : null))
      .catch((error) => setError(String(error)))
  }, [setError, workspace])

  const workspaceFiles = useMemo(() => {
    if (!workspace) return []
    return flattenWorkspaceFiles(workspace.entries)
  }, [workspace])

  const mentionFiles = useMemo(() => {
    if (!mention) return []
    const query = mention.query.trim().toLocaleLowerCase()
    return workspaceFiles
      .filter((entry) => !query || entry.name.toLocaleLowerCase().includes(query) || entry.path.toLocaleLowerCase().includes(query))
      .slice(0, 40)
  }, [mention, workspaceFiles])

  const updateMention = useCallback((value: string, caret: number) => {
    if (!workspace) { setMention(null); return }
    const beforeCaret = value.slice(0, caret)
    const match = beforeCaret.match(/(^|[^\w@])@([^\s@]*)$/u)
    if (!match) { setMention(null); return }
    const start = caret - match[2].length - 1
    setMention({ start, end: caret, query: match[2] })
    setMentionIndex(0)
  }, [workspace])

  useEffect(() => {
    if (mentionIndex >= mentionFiles.length && mentionFiles.length > 0) setMentionIndex(mentionFiles.length - 1)
  }, [mentionFiles.length, mentionIndex])

  const selectMention = (entry: WorkspaceEntry) => {
    if (!mention) return
    const value = `${prompt.slice(0, mention.start)}@${entry.path}${prompt.slice(mention.end)}`
    setPrompt(value)
    setMention(null)
    const caret = mention.start + entry.path.length + 1
    window.setTimeout(() => {
      promptRef.current?.focus()
      promptRef.current?.setSelectionRange(caret, caret)
    }, 0)
  }

  const send = async () => {
    const state = useAppStore.getState()
    if (state.projectTransition) return
    if (!state.workspace) { setError('请先选择项目'); return }
    useAppStore.setState((current) => ({ pendingChatRequests: current.pendingChatRequests + 1 }))
    try { await sendMessage() }
    finally { useAppStore.setState((current) => ({ pendingChatRequests: current.pendingChatRequests - 1 })) }
  }

  const sendMessage = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    const editorRevision = pendingActionId === 'document-revision' ? pendingEditorRevision : null
    let selectedContextDocuments = editorRevision
      ? [{ path: editorRevision.path, name: editorRevision.documentName, content: editorRevision.text, size: editorRevision.text.length, kind: getDocumentKind(editorRevision.documentName) }]
      : contextDocuments
    if (!editorRevision) {
      const mentionedPaths = extractDocumentMentionPaths(value)
      const missingMentionedPaths = mentionedPaths.filter((path) => !selectedContextDocuments.some((document) => document.path === path))
      try {
        for (const path of missingMentionedPaths) await onToggleContext(path)
        if (missingMentionedPaths.length > 0) selectedContextDocuments = useAppStore.getState().contextDocuments
      } catch (error) {
        setError(`读取引用文档失败：${formatError(error)}`)
        return
      }
    }
    const activeDocument = activePath ? tabs.find((tab) => tab.path === activePath) : undefined
    const nextRequestId = crypto.randomUUID()
    const conversationRef = buildConversationReference(messages)
    const explicitTargets = editorRevision
      ? [{ id: `${editorRevision.path}#${editorRevision.from}:${editorRevision.to}`, kind: 'selection' as const }]
      : selectedContextDocuments.length > 0
      ? selectedContextDocuments.map((document) => ({ id: document.path, kind: 'document' as const }))
      : []
    const taskRequest = createTaskRequest({
      entryPoint: editorRevision ? 'editor-selection' : 'chat',
      actionId: pendingActionId,
      instruction: value,
      targets: explicitTargets,
      conversationRef: { ...conversationRef, conversationId },
    })
    let taskPlan = routeTask(taskRequest, selectedContextDocuments.length > 0 || Boolean(activeDocument))
    const needsSelectedDocument = taskPlan.documentAccess === 'selected' || taskPlan.documentAccess === 'selected-metadata'
    if (needsSelectedDocument && selectedContextDocuments.length === 0 && activeDocument) {
      if (taskRequest.targets.length === 0) taskRequest.targets = [{ id: activeDocument.path, kind: 'document' }]
      taskPlan = routeTask(taskRequest, true)
    }
    let taskDispatch: TaskExecutionDispatch
    try {
      taskDispatch = await executeTask({ taskId: nextRequestId, stage: 'preflight', resumeJobId: null, request: taskRequest, plan: taskPlan })
      taskPlan = taskDispatch.plan
    } catch (error) {
      setAnalysisStatus(null)
      setError(`任务策略校验失败：${formatError(error)}`)
      return
    }
    if (taskDispatch.executionPhase === 'clarification-required') {
      const question = taskDispatch.clarification?.question ?? '请补充本次请求需要处理的具体范围。'
      const now = Date.now()
      const nextConversationId = conversationId ?? crypto.randomUUID()
      const nextTitle = conversationId ? conversationTitle : value.replace(/\s+/g, ' ').slice(0, 28)
      const userMessage = {
        id: crypto.randomUUID(), role: 'user' as const, content: value, createdAt: now,
        taskRef: createTaskMessageRef(taskRequest, taskPlan, nextRequestId),
      }
      const assistantMessage = { id: crypto.randomUUID(), role: 'assistant' as const, content: question, createdAt: now + 1 }
      if (!conversationId) setConversation({ id: nextConversationId, title: nextTitle, messages, updatedAt: now })
      setPrompt('')
      setPendingActionId(null)
      setMention(null)
      beginChatRun({
        conversationId: nextConversationId,
        conversationTitle: nextTitle,
        requestId: nextRequestId,
        status: 'thinking',
        statusMessage: null,
        activityLog: [],
        userMessage,
        assistantMessage,
      })
      endChatRun(nextConversationId, false)
      try {
        await saveConversationMessage(nextConversationId, nextTitle, userMessage, workspace?.id)
        const completed = useAppStore.getState().completedChatMessages[nextConversationId]
        if (completed) await saveConversationMessage(nextConversationId, nextTitle, completed, workspace?.id)
        setConversations(await listConversations(workspace?.id))
      } catch (error) { setError(String(error)) }
      return
    }
    if (needsSelectedDocument && selectedContextDocuments.length === 0) {
      const inheritedPaths = taskRequest.targets.filter((target) => target.kind === 'document').map((target) => target.id)
      try {
        if (taskPlan.documentAccess === 'selected-metadata') {
          const workspaceFiles = workspace ? flattenWorkspaceFiles(workspace.entries) : []
          selectedContextDocuments = inheritedPaths.map((path) => {
            const open = tabs.find((tab) => tab.path === path)
            const entry = workspaceFiles.find((candidate) => candidate.path === path)
            return {
              path,
              name: open?.name ?? entry?.name ?? path.split('/').at(-1) ?? path,
              content: '',
              size: open?.content.length ?? 0,
              sizeBytes: open?.sizeBytes,
              kind: open?.kind ?? entry?.documentKind ?? getDocumentKind(path),
            }
          })
        } else {
          const gateway = createToolGateway(taskPlan)
          for (const path of inheritedPaths) {
            const document = await gateway.call('read_document', { path }, () => readDocument(path))
            addContextDocument({ path, name: document.name, content: document.content, size: document.content.length, sizeBytes: document.sizeBytes, kind: document.kind })
          }
          selectedContextDocuments = useAppStore.getState().contextDocuments
          taskPlan = routeTask(taskRequest, selectedContextDocuments.length > 0)
        }
      } catch (error) {
        setError(`恢复上一任务文档失败：${String(error)}`)
        return
      }
    }

    const selectedModel = activeModel
    if (taskPlan.requiresModel && !selectedModel) { setSettingsOpen(true); return }
    if (taskPlan.requiresModel && taskPlan.sourcePolicy !== 'metadata-only' && selectedModel && !isLoopbackModelEndpoint(selectedModel.baseUrl)) {
      setError(`${taskPlan.analysisMode === 'focused' ? '聚焦分析会读取少量正文摘录' : '深度分析会逐块读取正文'}，当前仅允许使用 localhost 或 127.0.0.1 的本机模型。远程正文授权尚未启用。`)
      return
    }

    let requestContextDocuments = taskPlan.documentAccess === 'selected' ? selectedContextDocuments : []
    let overviewContext: string | null = null
    let excludedWorkspaceDocuments: Awaited<ReturnType<typeof readWorkspaceDocuments>>['excluded'] = []
    if (taskPlan.documentAccess === 'workspace-metadata') {
      if (!workspace) {
        setError('项目概览需要先打开工作区。')
        return
      }
    }
    if (taskPlan.documentAccess === 'workspace-focused') {
      if (!workspace) {
        setError('项目聚焦分析需要先打开工作区。')
        return
      }
      setAnalysisStatus('正在定位项目关键文件…')
      let loaded: Awaited<ReturnType<typeof readWorkspaceDocuments>>
      try {
        loaded = await readWorkspaceDocuments(workspace, (path) => {
          const gateway = createToolGateway(taskPlan)
          return gateway.call('read_document', { path }, () => readDocument(path))
        }, {
          coverage: 'targeted',
          prompt: value,
          strategy: 'focused',
        })
      } catch (error) {
        setAnalysisStatus(null)
        setError(`读取项目关键文件失败：${String(error)}`)
        return
      }
      requestContextDocuments = loaded.documents
      excludedWorkspaceDocuments = loaded.excluded
      overviewContext = buildFocusedWorkspaceMessage(workspace, requestContextDocuments, selectedModel?.contextWindow ?? 32768)
    }
    if (taskPlan.documentAccess === 'selected-metadata') {
      overviewContext = buildSelectedDocumentsOverviewMessage(selectedContextDocuments)
    }
    if (taskPlan.documentAccess === 'workspace') {
      if (!workspace) {
        setError('项目级分析需要先打开工作区。')
        return
      }
      setAnalysisStatus('正在扫描项目文件…')
      let loaded: Awaited<ReturnType<typeof readWorkspaceDocuments>>
      try {
        loaded = await readWorkspaceDocuments(workspace, (path) => {
          const gateway = createToolGateway(taskPlan)
          return gateway.call('read_document', { path }, () => readDocument(path))
        }, {
          coverage: taskPlan.analysisCoverage === 'exhaustive' ? 'exhaustive' : 'targeted',
          prompt: value,
        })
      } catch (error) {
        setAnalysisStatus(null)
        setError(`扫描项目文件失败：${String(error)}`)
        return
      }
      requestContextDocuments = loaded.documents
      excludedWorkspaceDocuments = loaded.excluded
      if (requestContextDocuments.length === 0) {
        setAnalysisStatus(null)
        setError('当前项目没有可分析的文本文件。')
        return
      }
    }

    if (needsSelectedDocument && selectedContextDocuments.length === 0) {
      setError(taskPlan.intent === 'structure-segmentation'
        ? '章节和场景拆分需要先选择或打开文档。'
        : '文档分析需要先选择或打开文档。')
      return
    }
    const revisionSourceBudget = Math.min(12_000, Math.max(512, Math.floor((selectedModel?.contextWindow ?? 32_768) * 0.55)))
    taskPlan = refineTaskForDocuments(taskPlan, requestContextDocuments, revisionSourceBudget)
    let runResult: ChatRunResult = { status: 'completed' }
    try {
      taskDispatch = await executeTask({ taskId: nextRequestId, stage: 'final', resumeJobId: null, request: taskRequest, plan: taskPlan })
      taskPlan = taskDispatch.plan
    } catch (error) {
      setAnalysisStatus(null)
      setError(`任务策略校验失败：${formatError(error)}`)
      return
    }
    const toolGateway = createToolGateway(taskPlan)
    const multiRevisionTargets = !editorRevision && taskPlan.intent === 'document-revision' && taskPlan.revisionStrategy === 'bounded'
      ? buildMultiFileRevisionTargets(requestContextDocuments, value)
      : []
    const multiRevisionContract = multiRevisionTargets.length > 0
      ? buildMultiFileRevisionContract(multiRevisionTargets)
      : null
    const revisionContext = taskPlan.revisionStrategy === 'bounded' && !multiRevisionContract
      ? buildRevisionContextMessage(requestContextDocuments, revisionSourceBudget)
      : null
    let memoryContext: string | null = null
    if (workspace && taskPlan.requiresModel && taskPlan.allowedTools.includes('search_project_memory')) {
      try {
        const memory = await toolGateway.call('search_project_memory', { query: value, maxResults: 12 }, () => searchProjectMemory(value))
        memoryContext = buildProjectMemoryContext(selectRelevantMemory(memory, value))
      } catch (error) { setError(`读取项目记忆失败：${String(error)}`) }
    }
    const selectionContract = editorRevision ? buildSelectionRevisionContract({ ...editorRevision, instruction: value }) : null
    const referencedDocumentContext = taskPlan.documentAccess === 'selected'
      ? buildDocumentIndexMessage(requestContextDocuments)
      : null
    const contextDraft = [referencedDocumentContext, overviewContext, memoryContext, revisionContext, selectionContract, multiRevisionContract].filter(Boolean).join('\n\n')
    const budgetDraft = [value, contextDraft].filter(Boolean).join('\n\n')
    const requestBudget = taskPlan.requiresModel
      ? calculateContextBudget(messages, [], budgetDraft, selectedModel?.contextWindow ?? 32768)
      : null
    const useLongTextPipeline = taskDispatch.serviceId === 'long-text-analysis'
      && requestContextDocuments.length > 0
    void recordRuntimeEvent(
      'task.routed',
      `intent=${taskPlan.intent}, operation=${taskPlan.operation}, scope=${taskPlan.scope}, documentAccess=${taskPlan.documentAccess}, analysisMode=${taskPlan.analysisMode ?? 'none'}, coverage=${taskPlan.analysisCoverage}, sourcePolicy=${taskPlan.sourcePolicy}, service=${taskDispatch.serviceId ?? 'none'}, owner=${taskDispatch.executionOwner}, backgroundEligible=${taskDispatch.backgroundEligible}, executionMode=${taskPlan.execution.currentMode}, targetMode=${taskPlan.execution.targetMode}, workflow=${taskPlan.execution.workflow ?? 'none'}, agentUpgrade=${taskPlan.execution.agentUpgrade}, requiresModel=${taskPlan.requiresModel}, contextDocuments=${requestContextDocuments.length}, estimatedTokens=${requestBudget?.estimatedTokens ?? 0}, limit=${requestBudget?.limit ?? 0}`,
    )
    if (requestBudget?.exceedsLimit && !useLongTextPipeline) {
      setError('当前消息和上下文超过模型可用窗口。请缩短输入，或分批提交分析请求。')
      return
    }
    const now = Date.now()
    const nextConversationId = conversationId ?? crypto.randomUUID()
    const nextTitle = conversationId ? conversationTitle : value.replace(/\s+/g, ' ').slice(0, 28)
    if (!conversationId) setConversation({ id: nextConversationId, title: nextTitle, messages, updatedAt: now })
    setPrompt('')
    setPendingActionId(null)
    if (editorRevision) clearPendingEditorRevision()
    setMention(null)
    const userMessage = {
      id: crypto.randomUUID(), role: 'user' as const, content: value, createdAt: now,
      taskRef: createTaskMessageRef(taskRequest, taskPlan, nextRequestId),
    }
    const assistantMessage = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', createdAt: now + 1 }
    beginChatRun({
      conversationId: nextConversationId,
      conversationTitle: nextTitle,
      requestId: nextRequestId,
      status: 'sending',
      statusMessage: null,
      activityLog: [],
      userMessage,
      assistantMessage,
      taskJobId: useLongTextPipeline ? taskDispatch.jobId : null,
    })
    try {
      await saveConversationMessage(nextConversationId, nextTitle, userMessage, workspace?.id)
      setConversations(await listConversations(workspace?.id))
      setChatRunStatus(nextConversationId, 'thinking', null)
      if (taskDispatch.serviceId === 'structure-segmentation') {
        setChatRunStatus(nextConversationId, 'fetching', '正在读取文档结构…')
        const structureDocuments = requestContextDocuments.filter((document) => document.content.trim().length > 0)
        if (structureDocuments.length === 0) throw new Error('当前选择的文件没有可解析的文本内容。')
        const proposals = structureDocuments.map((document) => segmentDocument(document))
        const outputPaths = await writeStructureOutputs(structureDocuments, proposals)
        setWorkspace(await refreshWorkspace())
        appendChatRunChunk(nextConversationId, formatStructureResult(proposals, outputPaths))
        await recordRuntimeEvent(
          'structure.segmented',
          `documents=${proposals.length}, outputs=${outputPaths.length}, segments=${proposals.reduce((sum, proposal) => sum + proposal.segments.length, 0)}, model=none`,
        )
      } else if (taskDispatch.serviceId === 'workspace-overview' && workspace) {
        setChatRunStatus(nextConversationId, 'tool_calling', '正在整理项目结构…')
        appendChatRunChunk(nextConversationId, formatWorkspaceOverview(workspace))
      } else if (useLongTextPipeline) {
        if (!selectedModel) throw new Error('未配置模型')
        setChatRunStatus(nextConversationId, 'fetching', '正在准备长文本分析…')
        setAnalysisStatus('正在准备长文本分析…')
        const result = await analyzeLongText(requestContextDocuments, value, selectedModel, nextRequestId, (progress) => {
          const message = `${progress.message} · ${progress.completed}/${progress.total}`
          if (progress.event) recordWorkerEvent(nextConversationId, progress.event)
          else setChatRunStatus(nextConversationId, progress.stage === 'chunking' ? 'fetching' : 'tool_calling', message)
          setAnalysisStatus(message)
        }, workspace?.id ?? 'workspace', excludedWorkspaceDocuments, undefined, (toolName, input, output) => {
          if (output) toolGateway.assertResult(toolName, output.value)
          else toolGateway.assert(toolName, input)
        }, taskDispatch, {
          displayTitle: buildTaskDisplayTitle(value),
          conversationId: nextConversationId,
          sourceMessageId: userMessage.id,
          workspaceNameSnapshot: workspace?.name ?? null,
          conversationTitleSnapshot: nextTitle,
          modelProfileId: selectedModel.id,
          modelNameSnapshot: selectedModel.model,
          connectionNameSnapshot: selectedModel.name,
        })
        const excludedNote = taskPlan.documentAccess === 'workspace'
          ? `\n\n---\n**分析覆盖**\n模式：深度分析；覆盖：${taskPlan.analysisCoverage}；数据策略：local-chunks。纳入 ${requestContextDocuments.length} 个文本文件，未纳入 ${excludedWorkspaceDocuments.length} 个文件。${excludedWorkspaceDocuments.length > 0 ? `\n\n未纳入：${excludedWorkspaceDocuments.map((item) => `${item.path}（${item.reason === 'sensitive' ? '敏感文件' : item.reason === 'not-targeted' ? '不在本次目标集' : item.reason === 'too-large' ? '超过大小上限' : item.reason === 'read-error' ? '读取失败' : '不支持的文件类型'}）`).join('、')}` : ''}`
          : `\n\n---\n**分析覆盖**\n模式：深度分析；覆盖：${taskPlan.analysisCoverage}；数据策略：local-chunks。纳入 ${requestContextDocuments.length} 个文档。`
        const evidenceNote = result.evidence.length > 0
          ? `\n\n> 证据校验：发现 ${result.evidence.length} 条来源引用，其中 ${result.evidence.filter((item) => item.verified).length} 条已通过行号和原文校验。`
          : '\n\n> 证据校验：最终回答没有生成可解析的来源引用。'
        await appendMarkdownBatches(nextConversationId, result.content, appendChatRunChunk, setChatRunStatus)
        appendChatRunChunk(nextConversationId, `${excludedNote}${evidenceNote}`)
        const candidates = taskPlan.intent === 'continuity-review' || taskPlan.intent === 'document-revision'
          ? []
          : buildMemoryCandidates(result.content, requestContextDocuments.map((document) => document.path), value)
        if (candidates.length > 0) {
          try {
            setPendingMemory({ items: await proposeProjectMemory(candidates), sourceMessageId: assistantMessage.id })
          } catch (error) { setError(`创建项目记忆提案失败：${String(error)}`) }
        }
      } else {
        if (!selectedModel) throw new Error('未配置模型')
        const recent = selectRecentMessages([...messages, userMessage], [], contextDraft, selectedModel.contextWindow)
        const context = [overviewContext, memoryContext, revisionContext, selectionContract, multiRevisionContract].filter(Boolean).join('\n\n') || null
        const modelMessages = [...(context ? [{ role: 'user' as const, content: context }] : []), ...recent.map(({ role, content }) => ({ role, content }))]
        const modelRequest = {
          requestId: nextRequestId,
          profileId: selectedModel.id,
          sourcePolicy: taskPlan.sourcePolicy,
          messages: modelMessages,
        }
        let firstResponse = ''
        await toolGateway.call('stream_chat', modelRequest, () => streamChat(modelRequest, (event) => {
          if (event.type === 'chunk') {
            firstResponse += event.content
            setChatRunStatus(nextConversationId, 'streaming', null)
            if (!editorRevision && multiRevisionTargets.length === 0) appendChatRunChunk(nextConversationId, event.content)
          }
          if (event.type === 'error') setError(event.message)
        }))
        if (editorRevision) {
          const proposal = createDiffProposal(firstResponse, { ...editorRevision, instruction: value })
          setDiffProposals([proposal])
          setPendingDiffSourceMessageId(assistantMessage.id)
          appendChatRunChunk(nextConversationId, formatDiffProposalMessage(proposal))
        } else if (multiRevisionTargets.length > 0) {
          const proposals = createMultiFileDiffProposals(firstResponse, multiRevisionTargets)
          for (const path of new Set(proposals.map((proposal) => proposal.path))) {
            if (!useAppStore.getState().tabs.some((tab) => tab.path === path)) {
              const document = await readDocument(path)
              useAppStore.getState().openTab({ ...document, savedContent: document.content })
            }
          }
          setDiffProposals(proposals)
          setPendingDiffSourceMessageId(assistantMessage.id)
          appendChatRunChunk(nextConversationId, formatMultiFileDiffProposalMessage(proposals))
        }

        // Recovery may add a body-free profile, but it never escalates to raw document access.
        const recoveryDocuments = requestContextDocuments.length > 0
          ? []
          : (contextDocuments.length > 0 ? contextDocuments : (activeDocument ? [{
            path: activeDocument.path,
            name: activeDocument.name,
            content: activeDocument.content,
            size: activeDocument.content.length,
            sizeBytes: activeDocument.sizeBytes,
            kind: activeDocument.kind,
          }] : []))
        if (recoveryDocuments.length > 0 && isContextRecoveryResponse(firstResponse)) {
          const recoveryContext = buildSelectedDocumentsOverviewMessage(recoveryDocuments)
          const recoveryBudget = calculateContextBudget(messages, [], [budgetDraft, recoveryContext].filter(Boolean).join('\n\n'), selectedModel.contextWindow)
          resetChatRunResponse(nextConversationId)
          setChatRunStatus(nextConversationId, 'fetching', '正在补充文档画像…')
          await recordRuntimeEvent(
            'context.recovery',
            `reason=model-context-refusal, documents=${recoveryDocuments.length}, sourcePolicy=metadata-only, estimatedTokens=${recoveryBudget.estimatedTokens}, limit=${recoveryBudget.limit}`,
          )
          const recoveryRecent = selectRecentMessages([...messages, userMessage], [], [contextDraft, recoveryContext].filter(Boolean).join('\n\n'), selectedModel.contextWindow)
          const recoveryRequest = {
            requestId: nextRequestId,
            profileId: selectedModel.id,
            sourcePolicy: 'metadata-only' as const,
            messages: [...(recoveryContext ? [{ role: 'user' as const, content: recoveryContext }] : []), ...recoveryRecent.map(({ role, content }) => ({ role, content }))],
          }
          await toolGateway.call('stream_chat', recoveryRequest, () => streamChat(recoveryRequest, (event) => {
            if (event.type === 'chunk') {
              setChatRunStatus(nextConversationId, 'streaming', null)
              appendChatRunChunk(nextConversationId, event.content)
            }
            if (event.type === 'error') setError(event.message)
          }))
        }
        if (taskPlan.analysisMode === 'overview') {
          appendChatRunChunk(nextConversationId, '\n\n> 分析范围：概览分析 · index-only · metadata-only。本次未读取文件正文。')
        } else if (taskPlan.analysisMode === 'focused') {
          const sources = requestContextDocuments.map((document) => `\`${document.path}\``).join('、') || '仅项目画像和已有项目记忆'
          appendChatRunChunk(nextConversationId, `\n\n> 分析范围：聚焦分析 · targeted · local-excerpts。依据：${sources}。本次未启动全项目分块分析。`)
        }
      }
    } catch (error) {
      const message = formatError(error)
      const cancelled = message.includes('请求已停止')
      runResult = cancelled
        ? { status: 'cancelled' }
        : { status: 'failed', error: normalizeServiceError(message) }
      if (!message.includes('请求已停止')) setError(message)
      appendChatRunChunk(nextConversationId, `\n\n> ${cancelled ? '任务已停止，已完成的产物仍保留。' : `任务未完成：${message}`}`)
    } finally {
      setAnalysisStatus(null)
      const completedBeforeEnd = useAppStore.getState().chatRuns[nextConversationId]?.assistantMessage
      endChatRun(nextConversationId, !completedBeforeEnd?.content, runResult)
      const completed = useAppStore.getState().completedChatMessages[nextConversationId]
      if (completed?.content) {
        try {
          await saveConversationMessage(nextConversationId, nextTitle, completed, workspace?.id)
          setConversations(await listConversations(workspace?.id))
        } catch (error) { setError(String(error)) }
      }
    }
  }

  const stop = async () => {
    if (!activeChatRun || activeChatRun.status === 'stopping') return
    setChatRunStatus(activeChatRun.conversationId, 'stopping', null)
    if (activeChatRun.taskJobId) {
      cancelLongTextAnalysis(activeChatRun.requestId)
      try { await cancelTaskJob(activeChatRun.taskJobId) } catch (cause) { setError(formatError(cause)) }
    }
    await cancelChat(activeChatRun.requestId)
  }

  const approvePendingMemory = useCallback(async () => {
    if (!pendingMemory) return
    try {
      await confirmProjectMemory(pendingMemory.items.map((item) => item.id))
      setPendingMemory(null)
    } catch (error) { setError(`确认项目记忆失败：${String(error)}`) }
  }, [pendingMemory, setError])

  const rejectPendingMemory = useCallback(async () => {
    if (!pendingMemory) return
    try {
      await rejectProjectMemory(pendingMemory.items.map((item) => item.id))
      setPendingMemory(null)
    } catch (error) { setError(`拒绝项目记忆失败：${String(error)}`) }
  }, [pendingMemory, setError])

  const applyPendingDiff = useCallback(() => {
    const proposal = diffProposals.find((item) => item.status === 'proposed')
    if (!proposal) return
    try {
      applyDiffProposal(proposal.id)
      onReviewDiff()
    } catch (error) { setError(String(error)) }
  }, [applyDiffProposal, diffProposals, onReviewDiff, setError])

  const approvePendingMemoryAction = useCallback(() => { void approvePendingMemory() }, [approvePendingMemory])
  const rejectPendingMemoryAction = useCallback(() => { void rejectPendingMemory() }, [rejectPendingMemory])

  const prepareAnalysis = async (paths: string[], instruction: string) => {
    try {
      for (const path of paths) {
        if (!useAppStore.getState().contextDocuments.some((document) => document.path === path)) {
          await onToggleContext(path)
        }
      }
      // Programmatic file analysis must replace any previous shortcut action.
      setPendingActionId('document-analysis')
      setPrompt(instruction)
      setMention(null)
      clearPendingNewFiles()
      window.setTimeout(() => promptRef.current?.focus(), 0)
    } catch (error) { setError(`准备文档分析失败：${formatError(error)}`) }
  }

  return <main className={`chat-panel${isNewConversation ? ' new-conversation' : ''}`}>
    {pendingNewFiles.length > 0 && <aside className="new-files-notice" role="status">
      <div className="new-files-notice-copy"><FileText /><span><strong>检测到 {pendingNewFiles.length} 个新增文本文件</strong><small>是否要让 AI 分析其中某个文件？</small></span></div>
      <div className="new-files-notice-actions">
        {pendingNewFiles.slice(0, 3).map((path) => <button key={path} onClick={() => void prepareAnalysis([path], '请分析已选文本，输出文档类型、内容概要、结构、故事主线和人物线报告。')} title={`分析 ${path}`}>{path.split('/').at(-1) ?? path}</button>)}
        {pendingNewFiles.length > 1 && <button onClick={() => void prepareAnalysis(pendingNewFiles, '请分析已选文本，输出文档类型、内容概要、结构、故事主线、人物线、章节结构和伏笔报告。')}>全部分析</button>}
        <button className="notice-dismiss" aria-label="忽略新增文件提示" title="忽略" onClick={clearPendingNewFiles}><X /></button>
      </div>
    </aside>}
    {!isNewConversation && <ChatMessageStream
      messages={messages}
      activeChatRun={activeChatRun}
      pendingDiffSourceMessageId={pendingDiffSourceMessageId}
      diffProposals={diffProposals}
      pendingMemory={pendingMemory}
      onCopyError={setError}
      onApplyPendingDiff={applyPendingDiff}
      onRejectDiffProposal={rejectDiffProposal}
      onReviewDiff={onReviewDiff}
      onApprovePendingMemory={approvePendingMemoryAction}
      onRejectPendingMemory={rejectPendingMemoryAction}
    />}
    <div className="composer-wrap">
      {isNewConversation && <div className="new-conversation-prompt" aria-label="Vinkey 新会话">
        <span className="new-conversation-prompt-icon" aria-hidden="true"><WandSparkles /></span>
        <span className="new-conversation-prompt-copy"><strong>Vinkey</strong><span>今天，和 Vinkey 一起把灵感写成故事。</span></span>
      </div>}
      <ConversationTaskControls conversationId={conversationId} />
      <div className="composer">
        {contextDocuments.length > 0 && <div className="composer-context-list" aria-label="已引用文档">
          {contextDocuments.map((document) => <button className="composer-context-chip" key={document.path} title={`移除引用：${document.path}`} onClick={() => void onToggleContext(document.path)}><FileText /><span>{document.name}</span><X /></button>)}
        </div>}
        {mention && <div id="mention-menu" className="mention-menu" role="listbox" aria-label="引用工作区文件">
          {mentionFiles.length > 0 ? mentionFiles.map((entry, index) => {
            const selected = contextDocuments.some((document) => document.path === entry.path)
            return <button
              type="button"
              key={entry.path}
              id={`mention-option-${index}`}
              role="option"
              aria-selected={index === mentionIndex}
              className={index === mentionIndex ? 'active' : ''}
              onMouseEnter={() => setMentionIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void selectMention(entry)}
            ><FileText /><span><strong>{entry.name}</strong><small>{entry.path}</small></span>{selected && <Check aria-label="已引用" />}</button>
          }) : <div className="mention-empty">没有匹配的文件</div>}
        </div>}
        <textarea
          ref={promptRef}
          aria-label="对话输入"
          aria-autocomplete="list"
          aria-controls={mention ? 'mention-menu' : undefined}
          aria-activedescendant={mention && mentionFiles.length > 0 ? `mention-option-${mentionIndex}` : undefined}
          value={prompt}
          onChange={(event) => { setPrompt(event.target.value); updateMention(event.target.value, event.target.selectionStart) }}
          onClick={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart)}
          onBlur={(event) => {
            const nextFocus = event.relatedTarget
            if (!(nextFocus instanceof Node) || !event.currentTarget.closest('.composer')?.contains(nextFocus)) setMention(null)
          }}
          onKeyDown={(event) => {
            if (mention) {
              if (event.key === 'ArrowDown' && mentionFiles.length > 0) { event.preventDefault(); setMentionIndex((index) => (index + 1) % mentionFiles.length); return }
              if (event.key === 'ArrowUp' && mentionFiles.length > 0) { event.preventDefault(); setMentionIndex((index) => (index - 1 + mentionFiles.length) % mentionFiles.length); return }
              if ((event.key === 'Enter' || event.key === 'Tab') && mentionFiles.length > 0) { event.preventDefault(); void selectMention(mentionFiles[mentionIndex]); return }
              if (event.key === 'Escape') { event.preventDefault(); setMention(null); return }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
          }}
          placeholder="描述你想续写、修改或梳理的内容..."
        />
        <div className="composer-tools">
          {activeModel ? <span className="composer-model-indicator" title={`${activeModel.model} · ${activeModel.baseUrl}`}><Bot /><span>{activeModel.model}</span></span>
            : <button className="composer-model-indicator missing" onClick={() => setSettingsOpen(true)}><Bot /><span>添加模型</span></button>}
          <span className="composer-hint" title={activeStatus?.title ?? '发送后评估上下文预算'}>{analysisStatus ?? activeStatus?.label ?? 'Enter 发送'}</span>
          <button className="send-button" aria-label={activeChatRun?.status === 'stopping' ? '正在停止' : busy ? '停止生成' : '发送'} disabled={projectTransition || !workspace || activeChatRun?.status === 'stopping' || (!prompt.trim() && !busy)} onClick={busy ? () => void stop() : () => void send()}>{busy ? <Square /> : <Send />}</button>
        </div>
      </div>
    </div>
  </main>
}

function EditorPanel({ onSave, onClose, onOpenChat }: { onSave: () => Promise<void>; onClose: () => void; onOpenChat: () => void }) {
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const viewMode = useAppStore((state) => state.viewMode)
  const closeTab = useAppStore((state) => state.closeTab)
  const updateContent = useAppStore((state) => state.updateContent)
  const setViewMode = useAppStore((state) => state.setViewMode)
  const theme = useAppStore((state) => state.theme)
  const setError = useAppStore((state) => state.setError)
  const editorSelection = useAppStore((state) => state.editorSelection)
  const setEditorSelection = useAppStore((state) => state.setEditorSelection)
  const prepareEditorRevision = useAppStore((state) => state.prepareEditorRevision)
  const diffProposals = useAppStore((state) => state.diffProposals)
  const applyDiffProposal = useAppStore((state) => state.applyDiffProposal)
  const rejectDiffProposal = useAppStore((state) => state.rejectDiffProposal)
  const document = tabs.find((tab) => tab.path === activePath)
  useEffect(() => setEditorSelection(null), [activePath, setEditorSelection])
  if (!document) return null
  const editable = isEditableDocument(document.kind)
  const dirty = editable && document.content !== document.savedContent
  const modes: ViewMode[] = ['edit', 'split', 'preview']
  const modeLabels: Record<ViewMode, string> = { edit: '编辑', split: '分栏', preview: '预览' }
  const lines = document.content.split('\n').length
  const words = document.content.trim() ? document.content.trim().split(/\s+/).length : 0
  const markdown = document.kind === 'markdown'
  const html = getLanguageName(document.name) === 'html'
  const documentProposals = diffProposals.filter((proposal) => proposal.path === document.path && proposal.status === 'proposed')
  const diffProposal = documentProposals[0]

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

  const reviseSelection = () => {
    if (!editorSelection || editorSelection.path !== document.path || !editorSelection.text) return
    prepareEditorRevision({
      ...editorSelection, documentName: document.name, sourceModifiedMs: document.modifiedMs,
      sourceFingerprint: fingerprintDocument(document.content),
      instruction: '请润色选中内容，保持原意、人物语气和上下文连续性。',
    })
    onOpenChat()
  }

  const applyPendingDiff = () => {
    if (!diffProposal) return
    try { applyDiffProposal(diffProposal.id) } catch (error) { setError(String(error)) }
  }

  return <aside className="editor-panel">
    <div className="document-tabs">
      <div className="document-tab active"><FileText /><span>{document.name}</span>{dirty && <i title="未保存" />}<IconButton label="关闭文档" onClick={() => closeTab(document.path)}><X /></IconButton></div>
    </div>
    <div className="editor-toolbar">
      <span className="document-path" title={document.path}>{document.path}</span>
      {editable && <IconButton label="保存文档" onClick={() => void onSave()} disabled={!dirty}><Save /></IconButton>}
      {editable && <IconButton label="用 AI 修改选区" onClick={reviseSelection} disabled={!editorSelection || editorSelection.path !== document.path || !editorSelection.text}><WandSparkles /></IconButton>}
      {editable && markdown && <div className="segmented" aria-label="文档视图">
        {modes.map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => setViewMode(mode)}>{modeLabels[mode]}</button>)}
      </div>}
      <IconButton label="下载文件" onClick={() => void download()}><Download /></IconButton>
      {html && <IconButton label="在新窗口预览 HTML" onClick={openHtmlPreview}><Eye /></IconButton>}
      <IconButton label="收起编辑器" onClick={onClose}><PanelRightClose /></IconButton>
    </div>
    <div className={`editor-content mode-${viewMode}`}>
      {editable && (viewMode !== 'preview' || !markdown) && <CodeEditor key={`${document.path}:${theme}:${document.kind}`} value={document.content} filename={document.name} editable themeMode={theme} onChange={(content) => updateContent(document.path, content)} onSelectionChange={(selection) => setEditorSelection(selection ? { ...selection, path: document.path } : null)} />}
      {editable && viewMode !== 'edit' && markdown && <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{document.content}</ReactMarkdown></div>}
      {!editable && <FilePreview document={document} onError={setError} />}
    </div>
    {diffProposal?.path === document.path && diffProposal.status === 'proposed' && <aside className="editor-diff-proposal" aria-label="选区修改提案">
      <div><WandSparkles /><span><strong>修改提案 · {documentProposals.length} 块待审核</strong><small>字符 {diffProposal.from}-{diffProposal.to} · 应用后仍需保存文档</small></span></div>
      <p>{diffProposal.replacementText || '（删除选区内容）'}</p>
      <div><button className="primary-button" onClick={applyPendingDiff}><Check />接受</button><button onClick={() => rejectDiffProposal(diffProposal.id)}><X />拒绝</button></div>
    </aside>}
    <footer className="editor-status">{editable ? <><span>语言 {getLanguageName(document.name)}</span><span>行 {lines}</span><span>{document.content.length} 字符</span><span>{words} 词</span><span>UTF-8</span><span>{document.lineEnding.toUpperCase()}</span><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '未保存' : <><Check />已保存</>}</span></> : <><span>{document.kind === 'binary' ? '不可编辑' : '仅预览'}</span><span>{document.sizeBytes ? `${Math.ceil(document.sizeBytes / 1024)} KB` : ''}</span></>}</footer>
  </aside>
}

function FileWorkspace({ showEditor, onOpenDocument, onToggleContext, onOpenWorkspace, onRefreshWorkspace, onSave, onCloseEditor, onOpenChat }: {
  showEditor: boolean
  onOpenDocument: (path: string) => Promise<void>
  onToggleContext: (path: string) => Promise<void>
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => Promise<void>
  onSave: () => Promise<void>
  onCloseEditor: () => void
  onOpenChat: () => void
}) {
  return <div className={`file-workspace ${showEditor ? 'with-editor' : 'list-only'}`}>
    <FileBrowserPanel onOpenDocument={onOpenDocument} onToggleContext={onToggleContext} onOpenWorkspace={onOpenWorkspace} onRefreshWorkspace={onRefreshWorkspace} />
    {showEditor && <EditorPanel onSave={onSave} onClose={onCloseEditor} onOpenChat={onOpenChat} />}
  </div>
}

function ContentPanel({ page, onPageChange, showFileEditor, onOpenDocument, onOpenWorkspace, onRefreshWorkspace, onSave, onCloseEditor, onToggleContext, onReviewDiff, onOpenLogSource }: {
  page: ContentPage
  onPageChange: (page: ContentPage) => void
  showFileEditor: boolean
  onOpenDocument: (path: string) => Promise<void>
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => Promise<void>
  onSave: () => Promise<void>
  onCloseEditor: () => void
  onToggleContext: (path: string) => Promise<void>
  onReviewDiff: () => void
  onOpenLogSource: (conversationId: string, sourceMessageId?: string | null) => Promise<void>
}) {
  const workspace = useAppStore((state) => state.workspace)
  const conversationTitle = useAppStore((state) => state.conversationTitle)
  const modelProfiles = useAppStore((state) => state.modelProfiles)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const activeModel = modelProfiles.find((profile) => profile.id === activeModelId)
  const pageTitle = page === 'logs' ? '日志中心' : conversationTitle || '新会话'

  return <section className="content-panel" aria-label="内容区">
    <header className="content-panel-header">
      <div className="content-panel-summary">
        <strong title={pageTitle}>{pageTitle}</strong>
        <span title={page === 'logs' ? `当前项目范围：${workspace?.name ?? '未打开项目'}` : `${workspace?.name ?? '未打开项目'} · ${activeModel?.model ?? '未选择模型'}`}>{page === 'logs' ? `当前项目范围：${workspace?.name ?? '未打开项目'}` : `${workspace?.name ?? '未打开项目'} · ${activeModel?.model ?? '未选择模型'}`}</span>
      </div>
      <div className="content-switcher" role="tablist" aria-label="内容页面">
        <button role="tab" aria-selected={page === 'chat'} className={page === 'chat' ? 'active' : ''} onClick={() => onPageChange('chat')}><MessageSquareText />对话</button>
        <button role="tab" aria-selected={page === 'file'} className={page === 'file' ? 'active' : ''} onClick={() => onPageChange('file')}><FileText />文件</button>
        <button role="tab" aria-selected={page === 'logs'} className={page === 'logs' ? 'active' : ''} onClick={() => onPageChange('logs')}><ScrollText />日志</button>
      </div>
    </header>
    <div className="content-panel-body">
      {page === 'chat' && <ChatPanel onToggleContext={onToggleContext} onReviewDiff={onReviewDiff} />}
      {page === 'file' && <FileWorkspace showEditor={showFileEditor} onOpenDocument={onOpenDocument} onToggleContext={onToggleContext} onOpenWorkspace={onOpenWorkspace} onRefreshWorkspace={onRefreshWorkspace} onSave={onSave} onCloseEditor={onCloseEditor} onOpenChat={() => onPageChange('chat')} />}
      {page === 'logs' && <LogCenter onOpenSource={onOpenLogSource} />}
    </div>
  </section>
}

function canLeaveProject(): boolean {
  const state = useAppStore.getState()
  if (state.pendingChatRequests || Object.keys(state.chatRuns).length) throw new Error('请先停止正在运行的任务，再切换项目')
  if (state.tabs.some((tab) => tab.content !== tab.savedContent)) return window.confirm('当前项目有未保存的文档。放弃这些修改并切换项目？')
  return true
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
  const setProjects = useAppStore((state) => state.setProjects)
  const setProjectTransition = useAppStore((state) => state.setProjectTransition)
  const openTab = useAppStore((state) => state.openTab)
  const toggleContext = useAppStore((state) => state.toggleContext)
  const markSaved = useAppStore((state) => state.markSaved)
  const setError = useAppStore((state) => state.setError)
  const setModelProfiles = useAppStore((state) => state.setModelProfiles)
  const setActiveModelId = useAppStore((state) => state.setActiveModelId)
  const setConversations = useAppStore((state) => state.setConversations)
  const setConversation = useAppStore((state) => state.setConversation)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setPendingNewFiles = useAppStore((state) => state.setPendingNewFiles)
  const [contentPage, setContentPage] = useState<ContentPage>('chat')
  const [fileEditorVisible, setFileEditorVisible] = useState(false)
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<Awaited<ReturnType<typeof getRuntimeDiagnostics>> | null>(null)
  const [runtimeDiagnosticsOpen, setRuntimeDiagnosticsOpen] = useState(false)
  const [runtimeDiagnosticsLoading, setRuntimeDiagnosticsLoading] = useState(false)
  const [runtimeCopyState, setRuntimeCopyState] = useState<'idle' | 'copied'>('idle')
  const macMenuInstalled = useRef(false)
  const macRefreshProjectItem = useRef<MenuItem | null>(null)

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
    setWorkspace(next)
    if (added.length > 0 || previous?.id !== next.id) setPendingNewFiles(added)
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
    if (useAppStore.getState().projectTransition) return
    setProjectTransition(true)
    try {
      if (!canLeaveProject()) return
      const next = await chooseWorkspace()
      if (next) {
        applyWorkspaceSnapshot(next)
        setProjects(await listProjects())
        setFileEditorVisible(false)
      }
    } catch (cause) { setError(String(cause)) }
    finally { setProjectTransition(false) }
  }, [applyWorkspaceSnapshot, setProjects, setProjectTransition, setError])

  const selectProject = useCallback(async (id: string) => {
    const state = useAppStore.getState()
    if (state.projectTransition) return false
    if (state.workspace?.id === id) { setSettingsOpen(false); return true }
    setProjectTransition(true)
    try {
      if (!canLeaveProject()) return false
      applyWorkspaceSnapshot(await activateProject(id), false)
      setProjects(await listProjects())
      setFileEditorVisible(false)
      setContentPage('chat')
      setSettingsOpen(false)
      return true
    } catch (cause) { setError(String(cause)); return false }
    finally { setProjectTransition(false) }
  }, [applyWorkspaceSnapshot, setProjects, setProjectTransition, setSettingsOpen, setError])

  const removeProject = useCallback(async (project: ProjectSummary, confirmation: string) => {
    const state = useAppStore.getState()
    if (state.projectTransition) throw new Error('项目切换中，请稍后重试')
    if (state.pendingChatRequests || Object.keys(state.chatRuns).length) throw new Error('请先停止正在运行的任务，再删除项目')
    if (state.workspace?.id === project.id && state.tabs.some((tab) => tab.content !== tab.savedContent)) throw new Error('当前项目有未保存文档，请先保存或关闭文档')
    setProjectTransition(true)
    try {
      await deleteProject(project.id, confirmation)
      if (useAppStore.getState().workspace?.id === project.id) {
        setWorkspace(null)
        setFileEditorVisible(false)
        setContentPage('chat')
      }
      setProjects(useAppStore.getState().projects.filter((item) => item.id !== project.id))
    } finally { setProjectTransition(false) }
  }, [setWorkspace, setProjects, setProjectTransition])

  const newConversationFromMenu = useCallback(() => {
    if (!useAppStore.getState().workspace) {
      setError('请先添加本地项目，再新建会话')
      return
    }
    useAppStore.getState().newConversation()
    changeContentPage('chat')
  }, [changeContentPage, setError])

  const showShortcuts = useCallback(() => {
    window.alert('快捷键\n\n⌘/Ctrl + O  添加本地项目\n⌘/Ctrl + N  新建会话\n⌘/Ctrl + R  刷新当前项目\n⌘/Ctrl + ,  打开设置\n⌘/Ctrl + S  保存当前文档\n⌘/Ctrl + W  关闭窗口\nEnter  发送消息\nShift + Enter  换行')
  }, [])

  const showAbout = useCallback(() => {
    void getRuntimeDiagnostics()
      .then(({ version }) => window.alert(`Vinkey ${version}\n\n本地优先的 AI 文学创作工作台\n文档和会话数据保存在本机。`))
      .catch(() => window.alert('Vinkey\n\n本地优先的 AI 文学创作工作台\n文档和会话数据保存在本机。'))
  }, [])

  const showWindowDiagnostics = useCallback(() => {
    void getWindowDiagnostics().then((diagnostics) => window.alert(diagnostics)).catch((cause) => setError(`读取窗口诊断失败：${String(cause)}`))
  }, [setError])

  const showRuntimeDiagnostics = useCallback(async () => {
    setRuntimeDiagnosticsOpen(true)
    setRuntimeDiagnosticsLoading(true)
    setRuntimeCopyState('idle')
    try {
      setRuntimeDiagnostics(await getRuntimeDiagnostics())
    } catch (cause) {
      setError(`读取运行日志失败：${String(cause)}`)
      setRuntimeDiagnosticsOpen(false)
    } finally {
      setRuntimeDiagnosticsLoading(false)
    }
  }, [setError])

  const copyRuntimeDiagnostics = useCallback(async () => {
    if (!runtimeDiagnostics) return
    const text = [`日志路径：${runtimeDiagnostics.path}`, `平台：${runtimeDiagnostics.platform}`, `版本：${runtimeDiagnostics.version}`, '', ...runtimeDiagnostics.lines].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setRuntimeCopyState('copied')
      window.setTimeout(() => setRuntimeCopyState('idle'), 1800)
    } catch (cause) {
      setError(`复制运行日志失败：${String(cause)}`)
    }
  }, [runtimeDiagnostics, setError])

  useEffect(() => {
    if (!error || !isDesktop()) return
    void recordRuntimeEvent('frontend.error', error).catch(() => undefined)
  }, [error])

  useEffect(() => {
    if (import.meta.env.VITE_UI_ACCEPTANCE !== '1') return
    const injectError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      if (typeof message === 'string' && message.trim()) setError(message)
    }
    window.addEventListener('vinkey:ui-acceptance-error', injectError)
    return () => window.removeEventListener('vinkey:ui-acceptance-error', injectError)
  }, [setError])

  const refreshWorkspaceFromMenu = useCallback(async () => {
    if (useAppStore.getState().projectTransition) return
    setProjectTransition(true)
    try {
      setProjects(await listProjects())
      if (useAppStore.getState().workspace) applyWorkspaceSnapshot(await refreshWorkspace())
    } catch (cause) { setError(`刷新项目失败：${String(cause)}`) }
    finally { setProjectTransition(false) }
  }, [applyWorkspaceSnapshot, setProjects, setProjectTransition, setError])

  useEffect(() => {
    let active = true
    setProjectTransition(true)
    void (async () => {
      try {
        const projects = await listProjects()
        if (!active) return
        setProjects(projects)
        const next = await refreshWorkspace()
        if (active) applyWorkspaceSnapshot(next)
      } catch (cause) {
        if (active && !String(cause).includes('请先选择工作目录')) setError(`恢复项目失败：${String(cause)}`)
      } finally { if (active) setProjectTransition(false) }
    })()
    return () => { active = false }
  }, [applyWorkspaceSnapshot, setProjects, setProjectTransition, setError])

  useEffect(() => {
    let active = true
    void Promise.all([listModelProfiles(), getActiveModelId()]).then(async ([profiles, storedActiveId]) => {
      if (!active) return
      const currentId = useAppStore.getState().activeModelId
      const legacyActiveId = localStorage.getItem('vinkey.activeModelId')
      const selectedId = profiles.some((profile) => profile.id === storedActiveId)
        ? storedActiveId
        : profiles.some((profile) => profile.id === legacyActiveId)
          ? legacyActiveId
          : profiles.some((profile) => profile.id === currentId)
            ? currentId
          : profiles[0]?.id ?? null
      setModelProfiles(profiles)
      setActiveModelId(selectedId)
      if (selectedId !== storedActiveId) await persistActiveModelId(selectedId)
      if (isDesktop()) localStorage.removeItem('vinkey.activeModelId')
    }).catch((cause) => { if (active) setError(String(cause)) })
    return () => { active = false }
  }, [setError, setModelProfiles, setActiveModelId])

  useEffect(() => {
    if (!workspace) {
      setConversations([])
      return
    }
    let active = true
    void listConversations(workspace.id).then((values) => { if (active) setConversations(values) }).catch((cause) => { if (active) setError(String(cause)) })
    return () => { active = false }
  }, [setConversations, setError, workspace])

  const openDocument = useCallback(async (path: string) => {
    const state = useAppStore.getState()
    if (state.projectTransition || !state.workspace) return
    const workspaceId = state.workspace.id
    try {
      const existing = useAppStore.getState().tabs.find((tab) => tab.path === path)
      if (existing) { openTab(existing); setContentPage('file'); setFileEditorVisible(true); setSettingsOpen(false); return }
      const document = await readDocument(path)
      if (useAppStore.getState().workspace?.id !== workspaceId || useAppStore.getState().projectTransition) return
      openTab({ ...document, savedContent: document.content })
      setContentPage('file')
      setFileEditorVisible(true)
      setSettingsOpen(false)
    } catch (cause) { setError(String(cause)) }
  }, [openTab, setError, setSettingsOpen])

  const toggleDocumentContext = useCallback(async (path: string) => {
    const state = useAppStore.getState()
    if (state.projectTransition || !state.workspace) return
    const workspaceId = state.workspace.id
    try {
      const existing = useAppStore.getState().contextDocuments.find((item) => item.path === path)
      if (existing) return toggleContext(existing)
      const document = await readDocument(path)
      if (useAppStore.getState().workspace?.id !== workspaceId || useAppStore.getState().projectTransition) return
      toggleContext({ path, name: document.name, content: document.content, size: document.content.length, sizeBytes: document.sizeBytes, kind: document.kind })
    } catch (cause) { setError(String(cause)) }
  }, [setError, toggleContext])

  const openLogSource = useCallback(async (conversationId: string, sourceMessageId?: string | null) => {
    const currentWorkspace = useAppStore.getState().workspace
    if (!currentWorkspace) return
    try {
      const conversation = await loadConversation(conversationId, currentWorkspace.id)
      if (useAppStore.getState().workspace?.id !== currentWorkspace.id) return
      setConversation(conversation)
      setContentPage('chat')
      setSettingsOpen(false)
      if (sourceMessageId) window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const target = document.getElementById(`message-${sourceMessageId}`)
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target?.focus({ preventScroll: true })
      }))
    } catch (cause) { setError(`无法打开日志来源对话：${formatError(cause)}`) }
  }, [setConversation, setError, setSettingsOpen])

  const saveActive = useCallback(async () => {
    if (useAppStore.getState().projectTransition) return
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
      newConversation: newConversationFromMenu,
      openWorkspace: () => void openWorkspaceFromMenu(),
      refreshWorkspace: () => void refreshWorkspaceFromMenu(),
      changePage: changeContentPage,
      toggleTheme: () => { const current = useAppStore.getState().theme; useAppStore.getState().setTheme(current === 'dark' ? 'light' : 'dark') },
      openSettings: () => useAppStore.getState().setSettingsOpen(true),
      showShortcuts,
      showWindowDiagnostics,
      showRuntimeDiagnostics: () => void showRuntimeDiagnostics(),
    }, Boolean(workspace)).then(({ refreshProjectItem }) => {
      macRefreshProjectItem.current = refreshProjectItem
    }).catch((cause) => { macMenuInstalled.current = false; setError(`macOS 菜单初始化失败：${String(cause)}`) })
  }, [changeContentPage, newConversationFromMenu, openWorkspaceFromMenu, refreshWorkspaceFromMenu, setError, showRuntimeDiagnostics, showShortcuts, showWindowDiagnostics, workspace])

  useEffect(() => {
    if (!isDesktop() || !isMacPlatform() || !macRefreshProjectItem.current) return
    void macRefreshProjectItem.current.setEnabled(Boolean(workspace)).catch((cause) => setError(`macOS 项目菜单状态同步失败：${String(cause)}`))
  }, [setError, workspace])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (key === 's') { event.preventDefault(); void saveActive(); return }
      if (isMacPlatform()) return
      if (key === 'o') { event.preventDefault(); void openWorkspaceFromMenu() }
      else if (key === 'n') { event.preventDefault(); newConversationFromMenu() }
      else if (key === 'r') { event.preventDefault(); if (useAppStore.getState().workspace) void refreshWorkspaceFromMenu() }
      else if (event.key === ',') { event.preventDefault(); setSettingsOpen(true) }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [newConversationFromMenu, openWorkspaceFromMenu, refreshWorkspaceFromMenu, saveActive, setSettingsOpen])

  const hasActiveDocument = useMemo(() => tabs.some((tab) => tab.path === activePath), [activePath, tabs])

  return <div className="app-frame" data-theme={theme} data-platform={isMacPlatform() ? 'mac' : 'desktop'}>
    <TitleBar onPageChange={changeContentPage} onOpenWorkspace={() => void openWorkspaceFromMenu()} onNewConversation={newConversationFromMenu} onRefreshWorkspace={() => void refreshWorkspaceFromMenu()} onShowShortcuts={showShortcuts} onShowAbout={showAbout} onShowWindowDiagnostics={showWindowDiagnostics} onShowRuntimeDiagnostics={() => void showRuntimeDiagnostics()} />
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} data-theme={theme}>
      <ProjectSessionSidebar onPageChange={changeContentPage} onOpenWorkspace={() => void openWorkspaceFromMenu()} onRefreshWorkspace={() => void refreshWorkspaceFromMenu()} onOpenDocument={openDocument} onSelectProject={selectProject} onDeleteProject={removeProject} />
      {settingsOpen ? <SettingsPage /> : <ContentPanel key={workspace?.id ?? 'no-project'} page={contentPage} onPageChange={changeContentPage} showFileEditor={fileEditorVisible && hasActiveDocument} onOpenDocument={openDocument} onOpenWorkspace={() => void openWorkspaceFromMenu()} onRefreshWorkspace={refreshWorkspaceFromMenu} onSave={saveActive} onCloseEditor={() => setFileEditorVisible(false)} onToggleContext={toggleDocumentContext} onOpenLogSource={openLogSource} onReviewDiff={() => { setContentPage('file'); setFileEditorVisible(true); setSettingsOpen(false) }} />}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError(null)}><X /></button></div>}
    </div>
    {runtimeDiagnosticsOpen && <div className="runtime-diagnostics-backdrop" role="presentation" onClick={() => setRuntimeDiagnosticsOpen(false)}>
      <section className="runtime-diagnostics-modal" role="dialog" aria-modal="true" aria-labelledby="runtime-diagnostics-title" onClick={(event) => event.stopPropagation()}>
        <header><div><h2 id="runtime-diagnostics-title"><ScrollText />应用诊断日志</h2><p>{runtimeDiagnostics?.path ?? '正在读取日志路径…'}</p></div><button className="icon-button" aria-label="关闭应用诊断日志" title="关闭" onClick={() => setRuntimeDiagnosticsOpen(false)}><X /></button></header>
        {runtimeDiagnosticsLoading ? <div className="runtime-diagnostics-empty">正在读取最近运行事件…</div> : runtimeDiagnostics && <>
          <div className="runtime-diagnostics-meta"><span>平台 {runtimeDiagnostics.platform}</span><span>版本 {runtimeDiagnostics.version}</span><span>{runtimeDiagnostics.lines.length} 条最近事件</span></div>
          <pre className="runtime-diagnostics-log">{runtimeDiagnostics.lines.length > 0 ? runtimeDiagnostics.lines.join('\n') : '暂无运行日志。'}</pre>
          <footer><button className="secondary-button" onClick={() => void showRuntimeDiagnostics()}><RefreshCw />刷新</button><button className="primary-button" onClick={() => void copyRuntimeDiagnostics()}><Copy />{runtimeCopyState === 'copied' ? '已复制' : '复制日志'}</button></footer>
        </>}
      </section>
    </div>}
  </div>
}
