import { ChevronDown, ChevronRight, FileText, FileType2, Folder, FolderOpen, Plus, FolderPlus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { WorkspaceEntry } from '../types'
import { filterWorkspaceTree } from '../lib/tree'

interface WorkspaceTreeProps {
  entries: WorkspaceEntry[]
  activePath: string | null
  query: string
  onOpen: (path: string) => void
  onContext: (path: string) => void
}

function TreeItem({ entry, depth, activePath, onOpen, onContext }: {
  entry: WorkspaceEntry; depth: number; activePath: string | null
  onOpen: (path: string) => void; onContext: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  if (entry.kind === 'directory') {
    return <>
      <button className="tree-row" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown /> : <ChevronRight />}{expanded ? <FolderOpen /> : <Folder />}<span>{entry.name}</span>
      </button>
      {expanded && entry.children.map((child) => <TreeItem key={child.path} entry={child} depth={depth + 1} activePath={activePath} onOpen={onOpen} onContext={onContext} />)}
    </>
  }
  const Icon = entry.name.endsWith('.txt') ? FileType2 : FileText
  return <button
    className={`tree-row file ${activePath === entry.path ? 'active' : ''}`}
    style={{ paddingLeft: 27 + depth * 14 }}
    onClick={() => onOpen(entry.path)}
    onContextMenu={(event) => { event.preventDefault(); onContext(entry.path) }}
    title="打开文档；右键添加到对话上下文"
  ><Icon /><span>{entry.name}</span></button>
}

export function WorkspaceTree({ entries, activePath, query, onOpen, onContext }: WorkspaceTreeProps) {
  const visible = useMemo(() => filterWorkspaceTree(entries, query), [entries, query])
  return <div className="tree" role="tree">
    {visible.map((entry) => <TreeItem key={entry.path} entry={entry} depth={0} activePath={activePath} onOpen={onOpen} onContext={onContext} />)}
    {visible.length === 0 && <div className="empty-small">没有匹配的文档</div>}
  </div>
}

export const workspaceActions = [
  { id: 'file', label: '新建文档', icon: Plus },
  { id: 'folder', label: '新建文件夹', icon: FolderPlus },
  { id: 'refresh', label: '刷新工作区', icon: RefreshCw },
] as const
