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
import { defaultKeymap, historyKeymap } from '@codemirror/commands'
import { useEffect, useRef } from 'react'
import type { ThemeMode } from '../types'
import { getLanguageName } from '../lib/fileTypes'

interface CodeEditorProps {
  value: string
  filename: string
  themeMode: ThemeMode
  editable?: boolean
  onChange: (value: string) => void
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

export function CodeEditor({ value, filename, themeMode, editable = true, onChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    view.current = new EditorView({
      parent: host.current,
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
          }),
        ],
      }),
    })
    return () => { view.current?.destroy(); view.current = null }
  }, [editable, filename, themeMode])

  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  return <div className="code-editor" ref={host} />
}

export { getLanguageExtensions }
