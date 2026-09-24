import { describe, expect, it } from 'vitest'
import {
  LEGACY_GLOBAL_MENU_LABELS,
  MACOS_TITLE_BAR_MENU_LABELS,
  TITLE_BAR_MENU_CONTRACT_VERSION,
  TITLE_BAR_MENU_ITEM_LABELS,
  TITLE_BAR_MENU_ORDER,
  WINDOWS_TITLE_BAR_MENU_LABELS,
} from './titleBarMenu'

describe('title-bar menu contract', () => {
  it('keeps the Windows and macOS top-level business menus aligned', () => {
    expect(TITLE_BAR_MENU_CONTRACT_VERSION).toContain('project-conversation')
    expect(TITLE_BAR_MENU_ORDER).toEqual(['project', 'conversation', 'edit', 'view', 'window', 'help'])
    expect(WINDOWS_TITLE_BAR_MENU_LABELS).toEqual(['项目', '会话', '编辑', '查看', '窗口', '帮助'])
    expect(MACOS_TITLE_BAR_MENU_LABELS).toEqual(['Vinkey', ...WINDOWS_TITLE_BAR_MENU_LABELS])
    expect(WINDOWS_TITLE_BAR_MENU_LABELS).not.toContain('文件')
  })

  it('uses business-object names and keeps settings in the application menu', () => {
    expect(TITLE_BAR_MENU_ITEM_LABELS.addProject).toBe('添加本地项目…')
    expect(TITLE_BAR_MENU_ITEM_LABELS.refreshProject).toBe('刷新当前项目')
    expect(TITLE_BAR_MENU_ITEM_LABELS.newConversation).toBe('新建会话')
    expect(TITLE_BAR_MENU_ITEM_LABELS.settings).toBe('设置…')
    expect([
      TITLE_BAR_MENU_ITEM_LABELS.chat,
      TITLE_BAR_MENU_ITEM_LABELS.files,
      TITLE_BAR_MENU_ITEM_LABELS.logs,
    ]).toEqual(['对话工作台', '项目文件', '任务与日志'])
  })

  it('tracks labels that must not return to the global menu', () => {
    expect(LEGACY_GLOBAL_MENU_LABELS).toContain('新建文档…')
    expect(LEGACY_GLOBAL_MENU_LABELS).toContain('保存文档')
    expect(LEGACY_GLOBAL_MENU_LABELS).toContain('关闭文档')
  })
})
