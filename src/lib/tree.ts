import type { WorkspaceEntry } from '../types'

export function filterWorkspaceTree(
  entries: WorkspaceEntry[],
  query: string,
): WorkspaceEntry[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return entries

  return entries.flatMap((entry) => {
    if (entry.kind === 'file') {
      return entry.name.toLocaleLowerCase().includes(normalized) ? [entry] : []
    }

    const children = filterWorkspaceTree(entry.children, normalized)
    const directoryMatches = entry.name.toLocaleLowerCase().includes(normalized)
    return children.length > 0 || directoryMatches ? [{ ...entry, children }] : []
  })
}
export function flattenWorkspaceFiles(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return entries.flatMap((entry) =>
    entry.kind === 'file' ? [entry] : flattenWorkspaceFiles(entry.children),
  )
}
