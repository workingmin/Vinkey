import type { ContextDocument, DocumentKind, WorkspaceEntry, WorkspaceSnapshot } from '../types'
import { getDocumentKind } from './fileTypes'
import { buildWorkspaceInventory } from './workspaceAnalysis'

const DEFAULT_PROFILE_LIMIT = 200

function safeRelativePath(path: string, name: string): string {
  return path.startsWith('/') || /^[a-z]:[\\/]/iu.test(path) ? name : path
}

export interface DocumentProfile {
  path: string
  name: string
  kind: DocumentKind
  sizeBytes: number | null
  digestStatus: 'unavailable'
}

export interface WorkspaceProfile {
  workspaceId: string
  name: string
  directoryCount: number
  fileCount: number
  analyzableFileCount: number
  excludedFileCount: number
  documentKindCounts: Partial<Record<DocumentKind, number>>
  documents: DocumentProfile[]
  omittedDocumentCount: number
  projectDigestStatus: 'unavailable'
}

function countDirectories(entries: WorkspaceEntry[]): number {
  return entries.reduce((count, entry) => count + (entry.kind === 'directory' ? 1 + countDirectories(entry.children) : 0), 0)
}

export function buildWorkspaceProfile(workspace: WorkspaceSnapshot, limit = DEFAULT_PROFILE_LIMIT): WorkspaceProfile {
  const inventory = buildWorkspaceInventory(workspace)
  const files = inventory.documents.filter((reference) => reference.reason !== 'sensitive').map((reference) => ({
    path: safeRelativePath(reference.path, reference.name),
    name: reference.name,
    kind: reference.kind,
    sizeBytes: null,
    digestStatus: 'unavailable' as const,
  }))
  const documentKindCounts: Partial<Record<DocumentKind, number>> = {}
  for (const file of files) documentKindCounts[file.kind] = (documentKindCounts[file.kind] ?? 0) + 1
  const boundedLimit = Math.max(1, Math.min(DEFAULT_PROFILE_LIMIT, limit))
  return {
    workspaceId: workspace.id,
    name: workspace.name,
    directoryCount: countDirectories(workspace.entries),
    fileCount: inventory.documents.length,
    analyzableFileCount: inventory.supported.length,
    excludedFileCount: inventory.excluded.length,
    documentKindCounts,
    documents: files.slice(0, boundedLimit),
    omittedDocumentCount: Math.max(0, files.length - boundedLimit),
    projectDigestStatus: 'unavailable',
  }
}

export function buildSelectedDocumentProfiles(
  documents: ReadonlyArray<Pick<ContextDocument, 'path' | 'name' | 'kind' | 'size' | 'sizeBytes'>>,
): DocumentProfile[] {
  return documents.map((document) => ({
    path: safeRelativePath(document.path, document.name),
    name: document.name,
    kind: document.kind ?? getDocumentKind(document.name),
    sizeBytes: document.sizeBytes ?? document.size,
    digestStatus: 'unavailable',
  }))
}

export function buildWorkspaceOverviewMessage(workspace: WorkspaceSnapshot): string {
  return `以下是当前工作区的不含正文画像。只依据这些信息回答；不要推断文件内容，缺少已有摘要时明确说明无法判断正文语义。\n\n<workspace-profile>\n${JSON.stringify(buildWorkspaceProfile(workspace), null, 2)}\n</workspace-profile>`
}

export function buildSelectedDocumentsOverviewMessage(
  documents: ReadonlyArray<Pick<ContextDocument, 'path' | 'name' | 'kind' | 'size' | 'sizeBytes'>>,
): string | null {
  if (documents.length === 0) return null
  return `以下是用户所选文档的不含正文画像。只依据这些信息回答；不要推断正文内容，摘要不可用时明确说明。\n\n<document-profiles>\n${JSON.stringify({ documents: buildSelectedDocumentProfiles(documents), digestStatus: 'unavailable' }, null, 2)}\n</document-profiles>`
}
