// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as desktop from '../lib/desktop'
import type { ChatActivity } from '../types'
import { MessageActivity } from './MessageActivity'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function activity(sequence = 1, segmentId = 'segment-a', label = '人物分析'): ChatActivity {
  return {
    id: `worker:job-1:${sequence}`, segment: { id: segmentId, label },
    status: 'tool_calling', message: `检索人物相关段落 ${sequence}`, timestamp: sequence * 1_000,
    worker: { sequence, timestamp: sequence * 1_000, jobId: 'job-1', stage: 'map', status: 'running', completed: sequence, total: 150,
      message: `检索人物相关段落 ${sequence}`, artifact: `summary-${sequence}.md`, cacheSource: 'shared' },
    artifacts: [`summary-${sequence}.md`], cacheHits: 1,
  }
}
const segmentButton = () => screen.getByRole('button', { name: /人物分析.*条记录/ })
const detailButton = (sequence = 1) => screen.getByRole('button', { name: new RegExp(`^${sequence}\\. 检索人物相关段落`) })

describe('two-level process reading', () => {
  it('has segment and activity disclosures without a task-level container', () => {
    render(<MessageActivity items={[activity()]} active />)
    expect(screen.getByLabelText('任务状态').textContent).toContain('正在处理')
    const bulk = screen.getByRole('button', { name: '展开全部过程' })
    expect(bulk.hasAttribute('aria-expanded')).toBe(false)
    expect(segmentButton().getAttribute('aria-expanded')).toBe('true')
    expect(detailButton().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(detailButton())
    expect(screen.getByRole('button', { name: /summary-1.md/ })).toBeTruthy()
    const sectionBody = document.getElementById(segmentButton().getAttribute('aria-controls')!)!
    expect(sectionBody.contains(detailButton())).toBe(true)
    expect(document.getElementById(detailButton().getAttribute('aria-controls')!)).toBeTruthy()
  })

  it('keeps segment choices when earlier events are replayed later', () => {
    const { rerender } = render(<MessageActivity items={[activity(2)]} active />)
    fireEvent.click(segmentButton())
    rerender(<MessageActivity items={[activity(1), activity(2)]} active />)
    expect(segmentButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps same-named executions separate and permits independent reading', () => {
    render(<MessageActivity items={[activity(1), activity(2, 'segment-b')]} active />)
    const segments = screen.getAllByRole('button', { name: /人物分析.*条记录/ })
    expect(segments).toHaveLength(2)
    fireEvent.click(segments[0])
    expect(screen.queryByRole('button', { name: /^1\. 检索/ })).toBeNull()
    expect(detailButton(2)).toBeTruthy()
  })

  it('preserves child choices through segment collapse, bulk actions and completion', () => {
    const { rerender } = render(<MessageActivity items={[activity()]} active />)
    fireEvent.click(detailButton())
    fireEvent.click(segmentButton())
    fireEvent.click(segmentButton())
    expect(detailButton().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '收起全部过程' }))
    rerender(<MessageActivity items={[activity(), activity(2, 'segment-b')]} result={{ status: 'completed' }} />)
    expect(screen.getAllByRole('button', { name: /人物分析.*条记录/ }).every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '展开全部过程' }))
    expect(detailButton().getAttribute('aria-expanded')).toBe('true')
    expect(detailButton(2).getAttribute('aria-expanded')).toBe('false')
  })

  it('does not hide delivered responses when either layer is collapsed or paged away', () => {
    const first = { ...activity(), response: '已经交付的人物分析' }
    render(<MessageActivity items={[first, ...Array.from({ length: 80 }, (_, index) => activity(index + 2, 'segment-b'))]} active />)
    fireEvent.click(screen.getByRole('button', { name: '收起全部过程' }))
    expect(screen.getByText('已经交付的人物分析')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('已经交付的人物分析')).toBeVisible()
    expect(screen.getByText('已经交付的人物分析').closest('[hidden]')).toBeNull()
  })

  it('retains all activities and reading choices across pages and incoming events', () => {
    const items = Array.from({ length: 121 }, (_, index) => activity(index + 1))
    const { rerender } = render(<MessageActivity items={items} active />)
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    fireEvent.click(detailButton(51))
    rerender(<MessageActivity items={[...items, activity(122)]} active />)
    expect(screen.getByText('第 51–100 条 / 共 122 条')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看最新记录' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(22)
    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(detailButton(51).getAttribute('aria-expanded')).toBe('true')
  })

  it('shows unsegmented histories in original order without inventing boundaries', () => {
    const items = [activity(1), activity(2)].map((item) => ({ ...item, segment: undefined }))
    render(<MessageActivity items={items} active />)
    expect(screen.getByRole('button', { name: /过程记录（未提供推进边界）/ })).toBeTruthy()
    expect(screen.getByText('按原始顺序展示，未推测执行轮次。')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('1. 检索人物相关段落 1'), expect.stringContaining('2. 检索人物相关段落 2'),
    ])
  })

  it('opens a read-only artifact from the activity details', async () => {
    vi.spyOn(desktop, 'readAnalysisArtifact').mockResolvedValue('# 章节摘要\n\n正文')
    render(<MessageActivity items={[activity()]} />)
    fireEvent.click(segmentButton())
    fireEvent.click(detailButton())
    fireEvent.click(screen.getByRole('button', { name: /summary-1.md/ }))
    const dialog = await screen.findByRole('dialog', { name: '分析产物预览' })
    await waitFor(() => expect(desktop.readAnalysisArtifact).toHaveBeenCalledWith('job-1', 'summary-1.md'))
    expect(await within(dialog).findByRole('heading', { name: '章节摘要' })).toBeTruthy()
  })

  it('keeps actual terminal status visible while all process details are collapsed', () => {
    const failed = { ...activity(), worker: { ...activity().worker!, status: 'failed' as const } }
    const { rerender } = render(<MessageActivity items={[failed]} result={{ status: 'completed' }} />)
    expect(screen.getByLabelText('任务状态').textContent).toContain('已完成')
    rerender(<MessageActivity items={[activity()]} result={{ status: 'failed' }} />)
    expect(screen.getByLabelText('任务状态').textContent).toContain('处理失败')
    rerender(<MessageActivity items={[activity()]} result={{ status: 'cancelled' }} />)
    expect(screen.getByLabelText('任务状态').textContent).toContain('已停止')
    rerender(<MessageActivity items={[{ ...activity(), worker: { ...activity().worker!, status: 'paused' } }]} active />)
    expect(screen.getByLabelText('任务状态').textContent).toContain('已暂停')
    rerender(<MessageActivity items={[activity()]} active runStatus="stopping" />)
    expect(screen.getByLabelText('任务状态').textContent).toContain('正在停止')
  })

  it('keeps missing-history notices outside disclosures', () => {
    render(<MessageActivity items={[{ ...activity(), id: undefined }]} historyError="后台记录读取失败" />)
    expect(screen.getByText(/历史可能不完整/)).toBeVisible()
    expect(screen.getByText('后台记录读取失败')).toBeVisible()
  })
})
