// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { RecordDeletionDialog } from './RecordDeletionDialog'

const project = { id: 'one', name: 'Project One', pathLabel: '/projects/one' }
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true })
})
afterEach(cleanup)

describe('record deletion confirmation', () => {
  it('requires a second step and the exact project name before deleting', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<RecordDeletionDialog project={project} sessionCount={27} onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByText(/27 个/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续删除' }))
    expect(onConfirm).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: '确认删除此项目' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'project one' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: project.name } })
    fireEvent.click(confirm)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledExactlyOnceWith(project.name))
  })

  it('keeps errors in the dialog and allows retry without silently dismissing it', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('数据库不可用'))
    const onCancel = vi.fn()
    render(<RecordDeletionDialog project={project} conversation={{ id: 'c', title: '会话 A', messageCount: 3, updatedAt: 1 }} onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: '删除会话记录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('数据库不可用')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '删除会话记录' })).toBeEnabled()
  })

  it('cancels without invoking deletion', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<RecordDeletionDialog project={project} onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
