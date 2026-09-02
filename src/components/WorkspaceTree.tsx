import { Archive, Braces, ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen, Image, Music2, Plus, FolderPlus, RefreshCw, Video } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { WorkspaceEntry } from '../types'
import { filterWorkspaceTree } from '../lib/tree'
import { getDocumentKind, getLanguageName } from '../lib/fileTypes'

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
  const kind = entry.documentKind ?? getDocumentKind(entry.name)
  const Icon = kind === 'markdown' ? FileText
    : kind === 'code' ? FileCode2
      : kind === 'image' ? Image
        : kind === 'audio' ? Music2
          : kind === 'video' ? Video
            : kind === 'pdf' || kind === 'binary' ? Archive
              : kind === 'text' ? FileText : Braces
  const kindLabel = kind === 'binary' ? '二进制文件' : kind === 'pdf' ? 'PDF 预览' : kind === 'image' ? '图片预览' : kind === 'audio' ? '音频预览' : kind === 'video' ? '视频预览' : `${getLanguageName(entry.name)} 文件`
  return <button
    className={`tree-row file ${activePath === entry.path ? 'active' : ''}`}
    style={{ paddingLeft: 27 + depth * 14 }}
    onClick={() => onOpen(entry.path)}
    onContextMenu={(event) => { event.preventDefault(); onContext(entry.path) }}
    title={`${kindLabel}；左键打开，右键添加到对话上下文`}
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
