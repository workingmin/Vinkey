// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectSessionSidebar } from './ProjectSessionSidebar'
import { useAppStore } from '../store'
import { activateProject, chooseWorkspace, listConversations, listProjects, saveConversationMessage } from '../lib/desktop'
import { withConversationRequest } from '../lib/conversationActivity'

const message = { id: 'm', role: 'user' as const, content: '正在处理的内容', createdAt: 1 }

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState(useAppStore.getInitialState())
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

async function setup() {
  const [first] = await listProjects()
  vi.spyOn(window, 'prompt').mockReturnValue('Second')
  const second = (await chooseWorkspace())!
  const workspace = await activateProject(first.id)
  await saveConversationMessage('active', '运行会话', message, first.id)
  await saveConversationMessage('history', '历史会话', { ...message, id: 'h' }, first.id)
  await saveConversationMessage('active', '另一项目同 ID 会话', message, second.id)
  localStorage.setItem('vinkey.expandedProjects', JSON.stringify([first.id, second.id]))
  useAppStore.setState({ workspace, projects: await listProjects(), conversationId: 'active', messages: [message], conversations: await listConversations(first.id) })
  render(<ProjectSessionSidebar onPageChange={vi.fn()} onOpenWorkspace={vi.fn()} onRefreshWorkspace={vi.fn()} onOpenDocument={vi.fn()} onSelectProject={vi.fn()} onDeleteProject={vi.fn()} />)
  await screen.findByRole('button', { name: '删除会话“历史会话”' })
  return { first, second }
}

describe('conversation deletion while another request is active', () => {
  it('deletes unrelated history, including the same ID in another project, without disturbing the current conversation', async () => {
    const { first, second } = await setup()
    let finish!: () => void
    let request!: Promise<void>
    await act(async () => {
      request = withConversationRequest(first.id, 'active', true, () => new Promise<void>((resolve) => { finish = resolve }))
    })
    try {
      expect(screen.getByRole('button', { name: '删除会话“运行会话”' })).toBeDisabled()
      for (const title of ['历史会话', '另一项目同 ID 会话']) {
        fireEvent.click(screen.getByRole('button', { name: `删除会话“${title}”` }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话记录' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(screen.queryByRole('button', { name: `删除会话“${title}”` })).not.toBeInTheDocument())
      }
      expect(await listConversations(first.id)).toEqual([expect.objectContaining({ id: 'active' })])
      expect(await listConversations(second.id)).toEqual([])
      expect(useAppStore.getState()).toMatchObject({ conversationId: 'active', messages: [message], pendingChatRequests: 1 })
    } finally {
      await act(async () => { finish(); await request })
    }
    expect(screen.getByRole('button', { name: '删除会话“运行会话”' })).toBeEnabled()
  })

  it('rechecks the target if a request starts after the confirmation dialog opens', async () => {
    const { first } = await setup()
    fireEvent.click(screen.getByRole('button', { name: '删除会话“历史会话”' }))
    let finish!: () => void
    let request!: Promise<void>
    await act(async () => {
      request = withConversationRequest(first.id, 'history', true, () => new Promise<void>((resolve) => { finish = resolve }))
    })
    try {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话记录' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('此会话的任务尚未结束')
      expect(await listConversations(first.id)).toHaveLength(2)
    } finally {
      await act(async () => { finish(); await request })
    }
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话记录' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await listConversations(first.id)).toHaveLength(1)
  })
})
