import type { ContextDocument, DocumentKind, EvidenceReference, WorkspaceDocumentRef, WorkspaceEntry, WorkspaceSnapshot } from '../types'
import { getDocumentKind } from './fileTypes'
import { flattenWorkspaceFiles } from './tree'

const ANALYZABLE_KINDS = new Set<DocumentKind>(['markdown', 'text', 'code'])
const SENSITIVE_NAMES = /^(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx)$/iu
const GENERATED_NAMES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'cargo.lock'])
const MAX_WORKSPACE_DOCUMENTS = 500
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
const MAX_WORKSPACE_BYTES = 256 * 1024 * 1024

export interface WorkspaceInventory {
  workspaceId: string
  documents: WorkspaceDocumentRef[]
  supported: WorkspaceDocumentRef[]
  excluded: WorkspaceDocumentRef[]
}

function isSensitive(path: string, name: string): boolean {
  return SENSITIVE_NAMES.test(name) || path.split('/').some((part) => ['.git', '.ssh', '.vinkey'].includes(part.toLowerCase()))
}

export function buildWorkspaceInventory(workspace: WorkspaceSnapshot): WorkspaceInventory {
  const documents = flattenWorkspaceFiles(workspace.entries).map((entry) => {
    const kind = entry.documentKind ?? getDocumentKind(entry.name)
    const sensitive = isSensitive(entry.path, entry.name)
    const generated = GENERATED_NAMES.has(entry.name.toLowerCase())
    const reason: WorkspaceDocumentRef['reason'] = sensitive ? 'sensitive' : ANALYZABLE_KINDS.has(kind) && !generated ? 'supported' : 'unsupported'
    return { path: entry.path, name: entry.name, kind, reason }
  })
  return {
    workspaceId: workspace.id,
    documents,
    supported: documents.filter((document) => document.reason === 'supported'),
    excluded: documents.filter((document) => document.reason !== 'supported'),
  }
}

export async function readWorkspaceDocuments(
  workspace: WorkspaceSnapshot,
  read: (path: string) => Promise<{ path: string; name: string; content: string; kind: DocumentKind; sizeBytes?: number }>,
): Promise<{ documents: ContextDocument[]; excluded: WorkspaceDocumentRef[] }> {
  const inventory = buildWorkspaceInventory(workspace)
  const documents: ContextDocument[] = []
  const excluded = [...inventory.excluded]
  let totalBytes = 0
  for (const reference of inventory.supported) {
    if (documents.length >= MAX_WORKSPACE_DOCUMENTS) {
      excluded.push({ ...reference, reason: 'too-large' })
      continue
    }
    try {
      const document = await read(reference.path)
      if (!ANALYZABLE_KINDS.has(document.kind)) {
        excluded.push({ ...reference, reason: 'unsupported' })
        continue
      }
      const sizeBytes = document.sizeBytes ?? new TextEncoder().encode(document.content).byteLength
      if (sizeBytes > MAX_DOCUMENT_BYTES || totalBytes + sizeBytes > MAX_WORKSPACE_BYTES) {
        excluded.push({ ...reference, reason: 'too-large' })
        continue
      }
      totalBytes += sizeBytes
      documents.push({
        path: document.path,
        name: document.name,
        content: document.content,
        size: document.content.length,
        sizeBytes,
        kind: document.kind,
      })
    } catch {
      excluded.push({ ...reference, reason: 'read-error' })
    }
  }
  return { documents, excluded }
}

export function parseEvidenceReferences(value: string): EvidenceReference[] {
  const references: EvidenceReference[] = []
  const pattern = /\[source:\s*([^\]\s]+)(?:\s+chunk=([^\]\s]+))?\s+lines=(\d+)-(\d+)(?:\s+quote="([^"]*)")?\]/gu
  for (const match of value.matchAll(pattern)) {
    references.push({ sourceId: match[1], chunkId: match[2] ?? null, lineStart: Number(match[3]), lineEnd: Number(match[4]), quote: match[5] ?? null, verified: false })
  }
  return references
}

export function verifyEvidenceReferences(references: EvidenceReference[], documents: ContextDocument[]): EvidenceReference[] {
  const byPath = new Map(documents.map((document) => [document.path, document]))
  return references.map((reference) => {
    const document = byPath.get(reference.sourceId)
    if (!document) return { ...reference, verified: false, verificationError: '来源文件不在本次分析快照中' }
    const lines = document.content.split('\n')
    if (reference.lineStart < 1 || reference.lineEnd < reference.lineStart || reference.lineEnd > lines.length) {
      return { ...reference, verified: false, verificationError: '行号超出来源文件范围' }
    }
    const quote = reference.quote?.trim()
    if (quote && !lines.slice(reference.lineStart - 1, reference.lineEnd).join('\n').includes(quote)) {
      return { ...reference, verified: false, verificationError: '引用原文与来源行不一致' }
    }
    return { ...reference, verified: true, verificationError: null }
  })
}

export function workspaceTreeFiles(entries: WorkspaceEntry[]): WorkspaceDocumentRef[] {
  return flattenWorkspaceFiles(entries).map((entry) => ({ path: entry.path, name: entry.name, kind: entry.documentKind ?? getDocumentKind(entry.name) }))
}
