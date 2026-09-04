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
  availableDocumentDigestCount: number
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
    availableDocumentDigestCount: 0,
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
  }))
}

export function buildWorkspaceOverviewMessage(workspace: WorkspaceSnapshot): string {
  return `以下是当前工作区的不含正文画像。请先直接回答其中可确认的项目名称、目录、文件、类型和数量，不要整体拒答；只有用户追问正文语义时才说明当前画像不包含正文。\n\n<workspace-profile>\n${JSON.stringify(buildWorkspaceProfile(workspace), null, 2)}\n</workspace-profile>`
}

export function formatWorkspaceOverview(workspace: WorkspaceSnapshot): string {
  const profile = buildWorkspaceProfile(workspace)
  const kindCounts = Object.entries(profile.documentKindCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind} ${count}`)
    .join('、') || '无文件'
  const files = profile.documents.map((document) => `- \`${document.path}\`（${document.kind}）`).join('\n') || '- 无文件'
  const omitted = profile.omittedDocumentCount > 0 ? `\n- 另有 ${profile.omittedDocumentCount} 个文件未在清单中展开` : ''
  return `## 项目结构概览\n\n- 项目：${profile.name}\n- 目录：${profile.directoryCount} 个\n- 文件：${profile.fileCount} 个，其中 ${profile.analyzableFileCount} 个可进入文本分析，${profile.excludedFileCount} 个因敏感规则或类型限制不纳入\n- 类型分布：${kindCounts}${omitted}\n\n### 文件清单\n\n${files}\n\n> 本回答来自工作区结构元数据，未读取文件正文。`
}

export function buildSelectedDocumentsOverviewMessage(
  documents: ReadonlyArray<Pick<ContextDocument, 'path' | 'name' | 'kind' | 'size' | 'sizeBytes'>>,
): string | null {
  if (documents.length === 0) return null
  return `以下是用户所选文档的不含正文画像。只依据这些信息回答；不要推断正文内容，摘要不可用时明确说明。\n\n<document-profiles>\n${JSON.stringify({ documents: buildSelectedDocumentProfiles(documents), digestStatus: 'unavailable' }, null, 2)}\n</document-profiles>`
}
