import { Archive, FileWarning, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { readFileBytes } from '../lib/desktop'
import { getPreviewMime, isPreviewableDocument } from '../lib/fileTypes'
import type { DocumentSnapshot } from '../types'

interface FilePreviewProps {
  document: DocumentSnapshot
  onError: (message: string) => void
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export function FilePreview({ document, onError }: FilePreviewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mime = document.mimeType ?? getPreviewMime(document.name)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    if (!isPreviewableDocument(document.kind) || !mime) {
      setUrl(null)
      setLoading(false)
      return () => undefined
    }
    setLoading(true)
    void readFileBytes(document.path).then((bytes) => {
      if (!active) return
      objectUrl = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: mime }))
      setUrl(objectUrl)
    }).catch((error) => {
      if (active) onError(`无法预览文件：${String(error)}`)
    }).finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document.kind, document.name, document.path, mime, onError])

  if (document.kind === 'binary') return <div className="file-preview-empty"><Archive /><strong>二进制文件</strong><span>该文件不能在文本编辑器中编辑。</span></div>
  if (!isPreviewableDocument(document.kind)) return null
  if (loading) return <div className="file-preview-empty"><LoaderCircle className="spin" /><span>正在加载预览…</span></div>
  if (!url) return <div className="file-preview-empty"><FileWarning /><span>无法生成文件预览。</span></div>
  if (document.kind === 'image') return <div className="file-preview-media"><img src={url} alt={document.name} /></div>
  if (document.kind === 'pdf') return <iframe className="file-preview-frame" title={document.name} src={url} />
  if (document.kind === 'audio') return <div className="file-preview-player"><audio controls src={url} /></div>
  return <div className="file-preview-player"><video controls src={url} /></div>
}

export function downloadBytes(bytes: Uint8Array, name: string, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
