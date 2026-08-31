import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, historyKeymap } from '@codemirror/commands'
import { useEffect, useRef } from 'react'
import type { ThemeMode } from '../types'

interface CodeEditorProps {
  value: string
  markdownEnabled: boolean
  themeMode: ThemeMode
  onChange: (value: string) => void
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

export function CodeEditor({ value, markdownEnabled, themeMode, onChange }: CodeEditorProps) {
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
          ...(markdownEnabled ? [markdown()] : []),
          createTheme(themeMode),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.current?.destroy()
  }, [markdownEnabled, themeMode])

  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  return <div className="code-editor" ref={host} />
}
