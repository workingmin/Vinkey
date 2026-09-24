export const EDIT_COMMAND_EVENT = 'vinkey:edit-command'
export const EDIT_STATE_CHANGE_EVENT = 'vinkey:edit-state-change'

export type EditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'
export type EditCommandTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

export interface EditCommandEventDetail {
  command: EditCommand
}

interface TextSnapshot {
  value: string
  selectionStart: number
  selectionEnd: number
}

interface TextHistory {
  entries: TextSnapshot[]
  index: number
  applying: boolean
}

const textHistories = new WeakMap<HTMLInputElement | HTMLTextAreaElement, TextHistory>()
const selectableInputTypes = new Set(['', 'text', 'search', 'tel', 'url', 'password'])

function isTextControl(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement
    || (element instanceof HTMLInputElement && selectableInputTypes.has(element.type))
}

function isCodeEditor(element: Element): boolean {
  return element instanceof HTMLElement && element.classList.contains('code-editor')
}

function snapshot(target: HTMLInputElement | HTMLTextAreaElement): TextSnapshot {
  return {
    value: target.value,
    selectionStart: target.selectionStart ?? target.value.length,
    selectionEnd: target.selectionEnd ?? target.value.length,
  }
}

function sameSnapshot(left: TextSnapshot, right: TextSnapshot): boolean {
  return left.value === right.value
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd
}

function ensureHistory(target: HTMLInputElement | HTMLTextAreaElement): TextHistory {
  const current = textHistories.get(target)
  if (current) return current
  const created = { entries: [snapshot(target)], index: 0, applying: false }
  textHistories.set(target, created)
  return created
}

function hasSelection(target: HTMLInputElement | HTMLTextAreaElement): boolean {
  return (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0)
}

function setTextControlValue(target: HTMLInputElement | HTMLTextAreaElement, value: string, inputType: string) {
  const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(target, value)
  else target.value = value
  const inputEvent = typeof InputEvent === 'function'
    ? new InputEvent('input', { bubbles: true, inputType })
    : new Event('input', { bubbles: true })
  target.dispatchEvent(inputEvent)
}

function applySnapshot(target: HTMLInputElement | HTMLTextAreaElement, next: TextSnapshot, inputType: string) {
  const history = ensureHistory(target)
  history.applying = true
  target.focus({ preventScroll: true })
  setTextControlValue(target, next.value, inputType)
  target.setSelectionRange(next.selectionStart, next.selectionEnd)
  history.applying = false
}

function replaceSelection(target: HTMLInputElement | HTMLTextAreaElement, value: string, inputType: string) {
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const nextValue = `${target.value.slice(0, start)}${value}${target.value.slice(end)}`
  setTextControlValue(target, nextValue, inputType)
  const cursor = start + value.length
  target.setSelectionRange(cursor, cursor)
  recordEditTarget(target)
}

function codeEditorFlag(target: HTMLElement, name: string): boolean {
  return target.dataset[name] === 'true'
}

export function resolveEditCommandTarget(candidate: EventTarget | null): EditCommandTarget | null {
  if (!(candidate instanceof Element)) return null
  if (isTextControl(candidate)) return candidate
  const editor = candidate.closest('.code-editor')
  return editor && isCodeEditor(editor) ? editor as HTMLElement : null
}

export function rememberEditTarget(target: EditCommandTarget): void {
  if (isTextControl(target)) ensureHistory(target)
}

export function recordEditTarget(target: EventTarget | null): void {
  if (!(target instanceof Element) || !isTextControl(target)) return
  const history = ensureHistory(target)
  if (history.applying) return
  const next = snapshot(target)
  if (sameSnapshot(history.entries[history.index], next)) return
  history.entries = history.entries.slice(0, history.index + 1)
  history.entries.push(next)
  history.index = history.entries.length - 1
}

export function canExecuteEditCommand(target: EditCommandTarget | null, command: EditCommand): boolean {
  if (!target) return false
  if (isCodeEditor(target)) {
    if (command === 'undo') return codeEditorFlag(target, 'canUndo')
    if (command === 'redo') return codeEditorFlag(target, 'canRedo')
    if (command === 'copy') return codeEditorFlag(target, 'hasSelection')
    if (command === 'cut') return codeEditorFlag(target, 'editable') && codeEditorFlag(target, 'hasSelection')
    if (command === 'paste') return codeEditorFlag(target, 'editable') && Boolean(navigator.clipboard?.readText)
    return codeEditorFlag(target, 'hasContent')
  }
  if (!isTextControl(target) || target.disabled) return false
  const editable = !target.readOnly
  const history = ensureHistory(target)
  if (command === 'undo') return editable && history.index > 0
  if (command === 'redo') return editable && history.index < history.entries.length - 1
  if (command === 'copy') return hasSelection(target) && Boolean(navigator.clipboard?.writeText)
  if (command === 'cut') return editable && hasSelection(target) && Boolean(navigator.clipboard?.writeText)
  if (command === 'paste') return editable && Boolean(navigator.clipboard?.readText)
  return target.value.length > 0
}

export async function executeEditCommand(target: EditCommandTarget | null, command: EditCommand): Promise<boolean> {
  if (!target || !canExecuteEditCommand(target, command)) return false
  if (isCodeEditor(target)) {
    const event = new CustomEvent<EditCommandEventDetail>(EDIT_COMMAND_EVENT, {
      cancelable: true,
      detail: { command },
    })
    return !target.dispatchEvent(event)
  }

  if (!isTextControl(target)) return false
  target.focus({ preventScroll: true })
  const history = ensureHistory(target)
  if (command === 'undo') {
    history.index -= 1
    applySnapshot(target, history.entries[history.index], 'historyUndo')
    return true
  }
  if (command === 'redo') {
    history.index += 1
    applySnapshot(target, history.entries[history.index], 'historyRedo')
    return true
  }
  if (command === 'selectAll') {
    target.setSelectionRange(0, target.value.length)
    return true
  }

  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start
  if (command === 'copy' || command === 'cut') {
    await navigator.clipboard.writeText(target.value.slice(start, end))
    if (command === 'cut') replaceSelection(target, '', 'deleteByCut')
    return true
  }
  if (command === 'paste') {
    replaceSelection(target, await navigator.clipboard.readText(), 'insertFromPaste')
    return true
  }
  return false
}
