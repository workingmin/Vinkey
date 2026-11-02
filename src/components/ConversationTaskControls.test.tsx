// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as desktop from '../lib/desktop'
import { useAppStore } from '../store'
import type { TaskJob, WorkspaceSnapshot } from '../types'
import { ConversationTaskControls } from './ConversationTaskControls'

afterEach(() => { cleanup(); vi.restoreAllMocks(); useAppStore.setState({ workspace: null, error: null, chatRuns: {} }) })

const workspace: WorkspaceSnapshot = { id: 'ws-1', name: '测试工作区', pathLabel: '测试', entries: [] }

const job = (overrides: Partial<TaskJob> = {}): TaskJob => ({
  taskId: 'job-1',
  workspaceId: 'ws-1',
  taskType: 'long-text-analysis',
  instructionHash: 'hash',
  status: 'running',
  cancelRequested: false,
  sourceFingerprints: {},
  steps: [],
  events: [],
  displayTitle: '分析文稿',
  conversationId: 'c-1',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

function renderControls(covers: TaskJob[] = [job()]) {
  useAppStore.setState({ workspace })
  vi.spyOn(desktop, 'listTaskJobs').mockResolvedValue(covers)
  return render(<ConversationTaskControls conversationId="c-1" />)
}

describe('ConversationTaskControls', () => {
  beforeEach(() => { useAppStore.setState({ workspace: null, error: null, chatRuns: {} }) })

  it('shows the unified running status and stop action', async () => {
    renderControls()
    await screen.findByText(/处理中/)
    expect(screen.getByRole('button', { name: '停止任务' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '暂停任务' })).toBeTruthy()
  })

  it('confirms a stop with CP-49 copy before cancelling', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cancelTaskJob = vi.spyOn(desktop, 'cancelTaskJob').mockResolvedValue(undefined)
    vi.spyOn(desktop, 'listTaskJobs').mockResolvedValue([])
    renderControls([job()])
    await screen.findByRole('button', { name: '停止任务' })
    fireEvent.click(screen.getByRole('button', { name: '停止任务' }))
    expect(confirm).toHaveBeenCalledWith('停止此任务？已生成的内容和已保存的分析文件会保留。')
    await waitFor(() => expect(cancelTaskJob).toHaveBeenCalledWith('job-1'))
  })

  it('releases the action lock and reports the error when a control fails', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cancelTaskJob = vi.spyOn(desktop, 'cancelTaskJob').mockRejectedValueOnce(new Error('后端拒绝'))
    vi.spyOn(desktop, 'cancelTaskJob').mockResolvedValue(undefined)
    renderControls()
    const stop = await screen.findByRole('button', { name: '停止任务' })
    fireEvent.click(stop)
    await waitFor(() => expect(useAppStore.getState().error).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '停止任务' }))
    await waitFor(() => expect(cancelTaskJob).toHaveBeenCalledTimes(2))
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('relabels a retry option with the unified step name', async () => {
    const failed = job({ status: 'failed', failure: { code: 'model', category: 'model', message: '调用失败', retryable: true }, steps: [{ id: 'map', kind: 'map', status: 'failed', attempt: 1, updatedAt: 1 }] })
    renderControls([failed])
    await screen.findByText(/处理失败/)
    expect(screen.getByRole('option', { name: '分析文本片段' })).toBeTruthy()
  })
})
