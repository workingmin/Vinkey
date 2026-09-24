// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canExecuteEditCommand,
  EDIT_COMMAND_EVENT,
  executeEditCommand,
  recordEditTarget,
  rememberEditTarget,
  resolveEditCommandTarget,
} from './editCommands'

const writeText = vi.fn<(value: string) => Promise<void>>()
const readText = vi.fn<() => Promise<string>>()

beforeEach(() => {
  document.body.replaceChildren()
  writeText.mockReset().mockResolvedValue(undefined)
  readText.mockReset().mockResolvedValue(' pasted')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText, readText },
  })
})

describe('focused edit commands', () => {
  it('resolves standard controls and the CodeMirror host from its content node', () => {
    const input = document.createElement('input')
    const editor = document.createElement('div')
    editor.className = 'code-editor'
    const content = document.createElement('div')
    editor.append(content)
    expect(resolveEditCommandTarget(input)).toBe(input)
    expect(resolveEditCommandTarget(content)).toBe(editor)
    expect(resolveEditCommandTarget(document.body)).toBeNull()
  })

  it('records controlled-input history and dispatches undo and redo input events', async () => {
    const input = document.createElement('input')
    input.value = 'first'
    document.body.append(input)
    rememberEditTarget(input)
    input.value = 'second'
    input.setSelectionRange(6, 6)
    recordEditTarget(input)
    const events: string[] = []
    input.addEventListener('input', (event) => events.push((event as InputEvent).inputType))

    expect(canExecuteEditCommand(input, 'undo')).toBe(true)
    expect(await executeEditCommand(input, 'undo')).toBe(true)
    expect(input.value).toBe('first')
    expect(await executeEditCommand(input, 'redo')).toBe(true)
    expect(input.value).toBe('second')
    expect(events).toEqual(['historyUndo', 'historyRedo'])
  })

  it('copies, cuts, pastes and selects through the focused text control', async () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello world'
    document.body.append(textarea)
    rememberEditTarget(textarea)
    textarea.setSelectionRange(0, 5)

    expect(await executeEditCommand(textarea, 'copy')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(await executeEditCommand(textarea, 'cut')).toBe(true)
    expect(textarea.value).toBe(' world')
    expect(await executeEditCommand(textarea, 'paste')).toBe(true)
    expect(textarea.value).toBe(' pasted world')
    expect(await executeEditCommand(textarea, 'selectAll')).toBe(true)
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, textarea.value.length])
  })

  it('bridges CodeMirror commands without using a global DOM command', async () => {
    const editor = document.createElement('div')
    editor.className = 'code-editor'
    editor.dataset.editable = 'true'
    editor.dataset.canUndo = 'true'
    editor.dataset.hasSelection = 'true'
    editor.dataset.hasContent = 'true'
    document.body.append(editor)
    const received: string[] = []
    editor.addEventListener(EDIT_COMMAND_EVENT, (event) => {
      received.push((event as CustomEvent<{ command: string }>).detail.command)
      event.preventDefault()
    })

    expect(await executeEditCommand(editor, 'undo')).toBe(true)
    expect(await executeEditCommand(editor, 'cut')).toBe(true)
    expect(received).toEqual(['undo', 'cut'])
  })
})
