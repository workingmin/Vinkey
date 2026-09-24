// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleBar } from './App'
import { useAppStore } from './store'

function renderTitleBar() {
  const callbacks = {
    onPageChange: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onNewConversation: vi.fn(),
    onRefreshWorkspace: vi.fn(),
    onShowShortcuts: vi.fn(),
    onShowAbout: vi.fn(),
    onShowWindowDiagnostics: vi.fn(),
    onShowRuntimeDiagnostics: vi.fn(),
  }
  render(<><TitleBar {...callbacks} /><textarea aria-label="测试编辑目标" defaultValue="hello world" /></>)
  return callbacks
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue('paste') },
  })
  useAppStore.setState({
    workspace: null,
    modelProfiles: [],
    activeModelId: null,
    theme: 'dark',
    error: null,
  })
})

afterEach(() => cleanup())

describe('Windows title-bar menu', () => {
  it('renders the target top-level order without a global file menu', () => {
    renderTitleBar()
    expect(screen.getAllByRole('button').slice(0, 6).map((button) => button.textContent)).toEqual([
      '项目', '会话', '编辑', '查看', '窗口', '帮助',
    ])
    expect(screen.queryByRole('button', { name: /^文件$/ })).toBeNull()
    expect(screen.getByRole('navigation', { name: '应用菜单' }).getAttribute('data-menu-contract')).toBeTruthy()
  })

  it('keeps project and document commands in their intended scopes', () => {
    renderTitleBar()
    fireEvent.click(screen.getByRole('button', { name: /^项目$/ }))
    const projectMenu = screen.getByRole('menu', { name: '项目菜单' })
    expect((within(projectMenu).getByRole('menuitem', { name: /添加本地项目/ }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(projectMenu).getByRole('menuitem', { name: /刷新当前项目/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(projectMenu).queryByText('新建文档…')).toBeNull()
    expect(within(projectMenu).queryByText('保存文档')).toBeNull()
    expect(within(projectMenu).queryByText('关闭文档')).toBeNull()
  })

  it('uses the target view labels and does not put settings in View', () => {
    const callbacks = renderTitleBar()
    fireEvent.click(screen.getByRole('button', { name: /^查看$/ }))
    const viewMenu = screen.getByRole('menu', { name: '查看菜单' })
    expect(within(viewMenu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '对话工作台', '项目文件', '任务与日志', '切换浅色/深色主题',
    ])
    expect(within(viewMenu).queryByText('模型与应用设置')).toBeNull()
    fireEvent.click(within(viewMenu).getByRole('menuitem', { name: '项目文件' }))
    expect(callbacks.onPageChange).toHaveBeenCalledWith('file')
  })

  it('returns focus to the trigger when Escape closes a menu', () => {
    renderTitleBar()
    const trigger = screen.getByRole('button', { name: /^会话$/ })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: '会话菜单' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '会话菜单' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('dispatches edit commands to the remembered input target', () => {
    renderTitleBar()
    const textarea = screen.getByRole('textbox', { name: '测试编辑目标' }) as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(2, 5)
    fireEvent.select(textarea)
    fireEvent.mouseDown(screen.getByRole('button', { name: /^编辑$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^编辑$/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^全选/ }))
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, textarea.value.length])
    expect(document.activeElement).toBe(textarea)
  })

  it('disables edit commands after focus leaves editable content', () => {
    renderTitleBar()
    const textarea = screen.getByRole('textbox', { name: '测试编辑目标' }) as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(0, 5)
    screen.getByRole('button', { name: '最小化窗口' }).focus()
    fireEvent.click(screen.getByRole('button', { name: /^编辑$/ }))
    expect((screen.getByRole('menuitem', { name: /^全选/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('menuitem', { name: /^剪切/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
