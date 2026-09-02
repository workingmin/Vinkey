import type { DocumentKind } from '../types'

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

const markdownExtensions = new Set(['md', 'markdown', 'mdx'])
const languageExtensions = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
  'py', 'pyw', 'pyi', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'jsonc', 'json5', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'go', 'rs', 'rb', 'erb', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp',
  'cs', 'swift', 'lua', 'r', 'sql', 'graphql', 'gql', 'proto', 'sh', 'bash', 'zsh',
  'fish', 'ps1', 'bat', 'cmd', 'log',
])

const previewMimes: Record<string, { kind: DocumentKind; mime: string }> = {
  png: { kind: 'image', mime: 'image/png' }, jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' }, gif: { kind: 'image', mime: 'image/gif' },
  svg: { kind: 'image', mime: 'image/svg+xml' }, webp: { kind: 'image', mime: 'image/webp' },
  ico: { kind: 'image', mime: 'image/x-icon' }, bmp: { kind: 'image', mime: 'image/bmp' },
  avif: { kind: 'image', mime: 'image/avif' }, apng: { kind: 'image', mime: 'image/apng' },
  tiff: { kind: 'image', mime: 'image/tiff' }, tif: { kind: 'image', mime: 'image/tiff' },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  mp4: { kind: 'video', mime: 'video/mp4' }, webm: { kind: 'video', mime: 'video/webm' },
  ogv: { kind: 'video', mime: 'video/ogg' }, mov: { kind: 'video', mime: 'video/quicktime' },
  m4v: { kind: 'video', mime: 'video/x-m4v' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' }, wav: { kind: 'audio', mime: 'audio/wav' },
  m4a: { kind: 'audio', mime: 'audio/mp4' }, aac: { kind: 'audio', mime: 'audio/aac' },
  flac: { kind: 'audio', mime: 'audio/flac' }, opus: { kind: 'audio', mime: 'audio/opus' },
  oga: { kind: 'audio', mime: 'audio/ogg' }, ogg: { kind: 'audio', mime: 'audio/ogg' },
  weba: { kind: 'audio', mime: 'audio/webm' },
}

const binaryExtensions = new Set([
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'exe', 'dll', 'so', 'dylib', 'app', 'dmg', 'msi',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'ttf', 'otf', 'woff', 'woff2',
  'eot', 'db', 'sqlite', 'sqlite3', 'bin', 'dat', 'iso', 'img', 'class', 'jar', 'war', 'pyc', 'pyo',
])

export function getDocumentKind(name: string): DocumentKind {
  const lowerName = name.toLowerCase()
  if (markdownExtensions.has(extensionOf(lowerName))) return 'markdown'
  const preview = previewMimes[extensionOf(lowerName)]
  if (preview) return preview.kind
  if (binaryExtensions.has(extensionOf(lowerName))) return 'binary'
  if (lowerName === '.env' || lowerName.startsWith('.env.') || languageExtensions.has(extensionOf(lowerName))) return 'code'
  return 'text'
}

export function isEditableDocument(kind: DocumentKind) {
  return kind === 'markdown' || kind === 'text' || kind === 'code'
}

export function getPreviewMime(name: string) {
  return previewMimes[extensionOf(name)]?.mime ?? null
}

export function getLanguageName(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName === '.env' || lowerName.startsWith('.env.')) return 'env'
  const extension = extensionOf(lowerName)
  if (markdownExtensions.has(extension)) return 'markdown'
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return 'javascript'
  if (['ts', 'tsx', 'mts', 'cts'].includes(extension)) return 'typescript'
  if (['py', 'pyw', 'pyi'].includes(extension)) return 'python'
  if (['html', 'htm'].includes(extension)) return 'html'
  if (['css', 'scss', 'sass', 'less'].includes(extension)) return 'css'
  if (['json', 'jsonc', 'json5'].includes(extension)) return 'json'
  return languageExtensions.has(extension) ? extension : 'plain text'
}

export function isPreviewableDocument(kind: DocumentKind) {
  return kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video'
}
