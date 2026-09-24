import { basicSetup } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { StreamLanguage } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, historyKeymap, redo, redoDepth, selectAll, undo, undoDepth } from '@codemirror/commands'
import { useEffect, useRef } from 'react'
import type { EditorSelection, ThemeMode } from '../types'
import { getLanguageName } from '../lib/fileTypes'
import { EDIT_COMMAND_EVENT, EDIT_STATE_CHANGE_EVENT, type EditCommandEventDetail } from '../lib/editCommands'

interface CodeEditorProps {
  value: string
  filename: string
  themeMode: ThemeMode
  editable?: boolean
  onChange: (value: string) => void
  onSelectionChange?: (selection: Omit<EditorSelection, 'path'> | null) => void
}

const envLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^#.*/)) return 'comment'
    if (stream.sol() && stream.match(/^[A-Za-z_][A-Za-z0-9_.]*(?==)/)) return 'variableName.definition'
    if (stream.match(/^=/)) return 'operator'
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string'
    if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string'
    if (stream.match(/^\$\{[^}]*\}?/)) return 'variableName.special'
    if (stream.match(/^\$[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName.special'
    if (stream.match(/^\d+/)) return 'number'
    stream.next()
    return null
  },
})

function getLanguageExtensions(filename: string): Extension[] {
  const language = getLanguageName(filename)
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  if (language === 'env') return [envLanguage]
  if (language === 'javascript') return [javascript({ jsx: ['jsx', 'tsx'].includes(extension), typescript: false })]
  if (language === 'typescript') return [javascript({ jsx: ['tsx'].includes(extension), typescript: true })]
  if (language === 'python') return [python()]
  if (language === 'html') return [html()]
  if (language === 'css') return [css()]
  if (language === 'json') return [json()]
  if (language === 'markdown') return [markdown()]
  return []
}

function createTheme(themeMode: ThemeMode) {
  const light = themeMode === 'light'
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: light ? '#ffffff' : '#151719', color: light ? '#202428' : '#dfe2e5' },
    '.cm-content': { padding: '24px 28px', caretColor: light ? '#087f8c' : '#36b8c4', fontFamily: 'var(--font-editor)', fontSize: '15px', lineHeight: '1.8' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-gutters': { backgroundColor: light ? '#ffffff' : '#151719', color: light ? '#9aa1a7' : '#555d64', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: light ? '#f3f6f7' : '#1b1e21' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: `${light ? '#cce7ea' : '#24434a'} !important` },
    '&.cm-focused': { outline: 'none' },
  }, { dark: !light })
}

export function CodeEditor({ value, filename, themeMode, editable = true, onChange, onSelectionChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  onChangeRef.current = onChange
  onSelectionChangeRef.current = onSelectionChange

  useEffect(() => {
    if (!host.current) return
    const hostElement = host.current
    const updateCommandState = (editor: EditorView) => {
      const selection = editor.state.selection.main
      hostElement.dataset.editable = String(editable)
      hostElement.dataset.canUndo = String(editable && undoDepth(editor.state) > 0)
      hostElement.dataset.canRedo = String(editable && redoDepth(editor.state) > 0)
      hostElement.dataset.hasSelection = String(!selection.empty)
      hostElement.dataset.hasContent = String(editor.state.doc.length > 0)
      hostElement.dispatchEvent(new CustomEvent(EDIT_STATE_CHANGE_EVENT, { bubbles: true }))
    }
    const handleEditCommand = (event: Event) => {
      const editor = view.current
      if (!editor) return
      const command = (event as CustomEvent<EditCommandEventDetail>).detail?.command
      if (!command) return
      event.preventDefault()
      if (command === 'undo') undo(editor)
      else if (command === 'redo') redo(editor)
      else if (command === 'selectAll') selectAll(editor)
      else if (command === 'copy' || command === 'cut') {
        const selection = editor.state.selection.main
        if (!selection.empty) {
          const selectedText = editor.state.sliceDoc(selection.from, selection.to)
          void navigator.clipboard.writeText(selectedText).then(() => {
            if (command === 'cut' && editable && view.current === editor) {
              editor.dispatch({ changes: { from: selection.from, to: selection.to }, selection: { anchor: selection.from } })
            }
          })
        }
      } else if (command === 'paste' && editable) {
        void navigator.clipboard.readText().then((text) => {
          if (view.current !== editor) return
          const selection = editor.state.selection.main
          editor.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length } })
        })
      }
      editor.focus()
      window.requestAnimationFrame(() => { if (view.current === editor) updateCommandState(editor) })
    }
    hostElement.addEventListener(EDIT_COMMAND_EVENT, handleEditCommand)
    view.current = new EditorView({
      parent: hostElement,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...getLanguageExtensions(filename),
          createTheme(themeMode),
          EditorView.lineWrapping,
          EditorState.readOnly.of(!editable),
          EditorView.editable.of(editable),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && editable) onChangeRef.current(update.state.doc.toString())
            if (update.selectionSet || update.docChanged) {
              const selection = update.state.selection.main
              onSelectionChangeRef.current?.(selection.empty ? null : {
                from: selection.from,
                to: selection.to,
                text: update.state.sliceDoc(selection.from, selection.to),
              })
            }
            if (update.docChanged || update.selectionSet) updateCommandState(update.view)
          }),
        ],
      }),
    })
    updateCommandState(view.current)
    return () => {
      hostElement.removeEventListener(EDIT_COMMAND_EVENT, handleEditCommand)
      view.current?.destroy()
      view.current = null
    }
  }, [editable, filename, themeMode])

  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  return <div className="code-editor" ref={host} />
}

export { getLanguageExtensions }
