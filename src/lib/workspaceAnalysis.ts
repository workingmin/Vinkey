import type { ContextDocument, DocumentKind, EvidenceReference, WorkspaceDocumentRef, WorkspaceEntry, WorkspaceSnapshot } from '../types'
import { getDocumentKind } from './fileTypes'
import { flattenWorkspaceFiles } from './tree'

const ANALYZABLE_KINDS = new Set<DocumentKind>(['markdown', 'text', 'code'])
const SENSITIVE_NAMES = /^(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx)$/iu
const GENERATED_NAMES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'cargo.lock'])
const MAX_WORKSPACE_DOCUMENTS = 500
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
const MAX_WORKSPACE_BYTES = 256 * 1024 * 1024
const MAX_TARGETED_DOCUMENTS = 24
const MAX_FOCUSED_DOCUMENTS = 4
const MAX_FOCUSED_DOCUMENT_BYTES = 128 * 1024
const MAX_FOCUSED_WORKSPACE_BYTES = 256 * 1024

export interface WorkspaceInventory {
  workspaceId: string
  documents: WorkspaceDocumentRef[]
  supported: WorkspaceDocumentRef[]
  excluded: WorkspaceDocumentRef[]
}

export interface WorkspaceReadOptions {
  coverage?: 'targeted' | 'exhaustive'
  prompt?: string
  strategy?: 'focused' | 'deep'
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

export function selectWorkspaceAnalysisTargets(
  supported: WorkspaceDocumentRef[],
  prompt: string,
  coverage: 'targeted' | 'exhaustive',
): WorkspaceDocumentRef[] {
  if (coverage === 'exhaustive') return supported
  const normalized = prompt.toLocaleLowerCase()
  const pathMatches = supported.filter((document) => normalized.includes(document.path.toLocaleLowerCase()))
  const mentioned = pathMatches.length > 0 ? pathMatches : supported.filter((document) => {
    const name = document.name.toLocaleLowerCase()
    const stem = name.replace(/\.[^.]+$/u, '')
    return normalized.includes(name) || (stem.length >= 2 && normalized.includes(stem))
  })
  if (mentioned.length > 0) return mentioned.slice(0, MAX_TARGETED_DOCUMENTS)
  const priority = (document: WorkspaceDocumentRef): number => {
    const value = document.path.toLocaleLowerCase()
    if (/(?:readme|说明|简介|梗概|大纲|概要|summary|overview|outline)/u.test(value)) return 3
    if (/(?:设定|人物|角色|世界|时间线|索引|canon|character|world|timeline|index)/u.test(value)) return 2
    if (document.kind === 'markdown' || document.kind === 'text') return 1
    return 0
  }
  return [...supported]
    .sort((left, right) => priority(right) - priority(left) || left.path.localeCompare(right.path, 'zh-CN'))
    .slice(0, MAX_TARGETED_DOCUMENTS)
}

export function selectWorkspaceFocusedTargets(
  supported: WorkspaceDocumentRef[],
  prompt: string,
): WorkspaceDocumentRef[] {
  const normalized = prompt.toLocaleLowerCase()
  const mentioned = supported.filter((document) => {
    const path = document.path.toLocaleLowerCase()
    const name = document.name.toLocaleLowerCase()
    const stem = name.replace(/\.[^.]+$/u, '')
    return normalized.includes(path) || normalized.includes(name) || (stem.length >= 2 && normalized.includes(stem))
  })
  if (mentioned.length > 0) return mentioned.slice(0, MAX_FOCUSED_DOCUMENTS)

  const priority = (document: WorkspaceDocumentRef): number => {
    const value = document.path.toLocaleLowerCase()
    if (/(?:^|\/)(?:readme|summary|overview)(?:\.|\/|$)/u.test(value)) return 5
    if (/(?:^|\/)(?:(?:项目)?(?:说明|简介|概览)|作品简介)(?:\.|\/|$)/u.test(value)) return 4
    if (/(?:^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json)$/u.test(value)) return 3
    if (/(?:说明|简介|梗概|大纲|概要|设定|索引|about|outline|canon|index)/u.test(value)) return 2
    if (document.kind === 'markdown' || document.kind === 'text') return 1
    return 0
  }
  return [...supported]
    .sort((left, right) => priority(right) - priority(left) || left.path.localeCompare(right.path, 'zh-CN'))
    .slice(0, MAX_FOCUSED_DOCUMENTS)
}

export async function readWorkspaceDocuments(
  workspace: WorkspaceSnapshot,
  read: (path: string) => Promise<{ path: string; name: string; content: string; kind: DocumentKind; sizeBytes?: number }>,
  options: WorkspaceReadOptions = {},
): Promise<{ documents: ContextDocument[]; excluded: WorkspaceDocumentRef[] }> {
  const inventory = buildWorkspaceInventory(workspace)
  const focused = options.strategy === 'focused'
  const targets = focused
    ? selectWorkspaceFocusedTargets(inventory.supported, options.prompt ?? '')
    : selectWorkspaceAnalysisTargets(inventory.supported, options.prompt ?? '', options.coverage ?? 'exhaustive')
  const maxDocumentBytes = focused ? MAX_FOCUSED_DOCUMENT_BYTES : MAX_DOCUMENT_BYTES
  const maxWorkspaceBytes = focused ? MAX_FOCUSED_WORKSPACE_BYTES : MAX_WORKSPACE_BYTES
  const maxDocuments = focused ? MAX_FOCUSED_DOCUMENTS : MAX_WORKSPACE_DOCUMENTS
  const targetPaths = new Set(targets.map((document) => document.path))
  const documents: ContextDocument[] = []
  const excluded = [
    ...inventory.excluded,
    ...inventory.supported.filter((document) => !targetPaths.has(document.path)).map((document) => ({ ...document, reason: 'not-targeted' as const })),
  ]
  let totalBytes = 0
  for (const reference of targets) {
    if (documents.length >= maxDocuments) {
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
      if (sizeBytes > maxDocumentBytes || totalBytes + sizeBytes > maxWorkspaceBytes) {
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
