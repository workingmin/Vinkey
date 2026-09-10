// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as desktop from '../lib/desktop'
import type { ChatActivity } from '../types'
import { MessageActivity } from './MessageActivity'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const activity: ChatActivity = {
  status: 'tool_calling',
  message: '来源引用校验通过，已保存产物',
  timestamp: 1_000,
  worker: {
    sequence: 1,
    timestamp: 1_000,
    jobId: 'job-1',
    stage: 'chapter',
    status: 'running',
    completed: 1,
    total: 2,
    message: '来源引用校验通过，已保存产物',
    artifact: 'chapter-a.md',
    cacheSource: 'shared',
  },
  artifacts: ['chapter-a.md'],
  cacheHits: 1,
}

describe('MessageActivity', () => {
  it('shows a compact current stage and expands its persistent details', () => {
    render(<MessageActivity items={[activity]} active />)
    expect(screen.getByText('正在处理')).toBeTruthy()
    expect(screen.getByText('章节汇总')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /chapter-a\.md/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /正在处理/ }))
    expect(screen.getByRole('button', { name: /chapter-a\.md/ })).toBeTruthy()
    expect(screen.getByText('已复用 1 个结果')).toBeTruthy()
    expect(screen.getByText('.vinkey/analysis/jobs/job-1/')).toBeTruthy()
  })

  it('loads an intermediate artifact into a read-only preview', async () => {
    vi.spyOn(desktop, 'readAnalysisArtifact').mockResolvedValue('# 章节摘要\n\n正文')
    render(<MessageActivity items={[activity]} />)
    fireEvent.click(screen.getByRole('button', { name: /处理记录/ }))
    fireEvent.click(screen.getByRole('button', { name: /chapter-a\.md/ }))

    expect(await screen.findByRole('dialog', { name: '分析产物预览' })).toBeTruthy()
    await waitFor(() => expect(desktop.readAnalysisArtifact).toHaveBeenCalledWith('job-1', 'chapter-a.md'))
    expect(await screen.findByRole('heading', { name: '章节摘要' })).toBeTruthy()
    expect(screen.getByText('只读产物')).toBeTruthy()
  })

  it('keeps the current status visible for a regular chat request', () => {
    render(<MessageActivity items={[{
      status: 'streaming', message: '正在生成回答', timestamp: 1_000,
    }]} active />)
    expect(screen.getByRole('status').textContent).toContain('正在生成回答')
  })
})
