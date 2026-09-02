import { describe, expect, it } from 'vitest'
import { getDocumentKind, getLanguageName, isEditableDocument, isPreviewableDocument } from './fileTypes'

describe('file type routing', () => {
  it('recognizes ClaudeCodeUI-style editable language families', () => {
    expect(getDocumentKind('src/App.tsx')).toBe('code')
    expect(getDocumentKind('config.json')).toBe('code')
    expect(getDocumentKind('.env.local')).toBe('code')
    expect(getLanguageName('src/App.tsx')).toBe('typescript')
    expect(getLanguageName('README.md')).toBe('markdown')
    expect(isEditableDocument('code')).toBe(true)
  })

  it('routes media to preview and known binary formats away from text editing', () => {
    expect(getDocumentKind('cover.png')).toBe('image')
    expect(getDocumentKind('manual.pdf')).toBe('pdf')
    expect(getDocumentKind('recording.mp3')).toBe('audio')
    expect(getDocumentKind('archive.zip')).toBe('binary')
    expect(isPreviewableDocument('image')).toBe(true)
    expect(isEditableDocument('binary')).toBe(false)
  })
})
