export const TITLE_BAR_MENU_CONTRACT_VERSION = '2026-09-24-project-conversation-v1'

export const TITLE_BAR_MENU_ORDER = ['project', 'conversation', 'edit', 'view', 'window', 'help'] as const

export type TitleBarMenuId = typeof TITLE_BAR_MENU_ORDER[number]

export const TITLE_BAR_MENU_LABELS: Record<TitleBarMenuId, string> = {
  project: '项目',
  conversation: '会话',
  edit: '编辑',
  view: '查看',
  window: '窗口',
  help: '帮助',
}

export const TITLE_BAR_MENU_ITEM_LABELS = {
  addProject: '添加本地项目…',
  refreshProject: '刷新当前项目',
  newConversation: '新建会话',
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  selectAll: '全选',
  chat: '对话工作台',
  files: '项目文件',
  logs: '任务与日志',
  toggleTheme: '切换浅色/深色主题',
  settings: '设置…',
  minimize: '最小化',
  maximize: '最大化',
  restore: '还原窗口',
  zoom: '缩放窗口',
  fullscreen: '进入全屏',
  closeWindow: '关闭窗口',
  shortcuts: '查看快捷键',
  windowDiagnostics: '窗口诊断信息',
  runtimeDiagnostics: '应用诊断日志',
  about: '关于 Vinkey',
} as const

export type TitleBarMenuItemId = keyof typeof TITLE_BAR_MENU_ITEM_LABELS

export const WINDOWS_TITLE_BAR_MENU_LABELS = TITLE_BAR_MENU_ORDER.map((id) => TITLE_BAR_MENU_LABELS[id])
export const MACOS_TITLE_BAR_MENU_LABELS = ['Vinkey', ...WINDOWS_TITLE_BAR_MENU_LABELS]

export const LEGACY_GLOBAL_MENU_LABELS = [
  '文件',
  '打开工作区…',
  '新建文档…',
  '刷新工作区',
  '保存文档',
  '关闭文档',
  '对话页',
  '文件页',
  '日志中心',
] as const
