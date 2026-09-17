// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskRequestSummary } from './TaskRequestSummary'

afterEach(cleanup)

describe('TaskRequestSummary', () => {
  it('shows the routed task and document snapshot on the user turn', () => {
    render(<TaskRequestSummary task={{
      taskId: 'task-1', intent: 'continuity-review', scope: 'selected-documents', sideEffect: 'draft',
      targets: [{ id: '章节/第一章.md', kind: 'document' }, { id: '设定/人物.md', kind: 'document' }],
    }} />)
    expect(screen.getByLabelText('任务范围').textContent).toContain('连续性审校')
    expect(screen.getByText('第一章.md')).toBeTruthy()
    expect(screen.getByText('人物.md')).toBeTruthy()
    expect(screen.getByText(/所选文档 · 生成草稿/)).toBeTruthy()
  })

  it('does not add metadata noise to an ordinary conversation', () => {
    const { container } = render(<TaskRequestSummary task={{
      taskId: 'task-2', intent: 'general-chat', scope: 'conversation', sideEffect: 'draft', targets: [],
    }} />)
    expect(container.innerHTML).toBe('')
  })
})
