import { FileText, Highlighter, Layers3 } from 'lucide-react'
import type { TaskMessageRef } from '../types'

const intentLabels: Record<string, string> = {
  'structure-segmentation': '章节拆分',
  'structure-enhancement': '结构增强',
  'document-analysis': '文档分析',
  'document-revision': '文档修改',
  'character-analysis': '人物分析',
  'continuity-review': '连续性审校',
  'workspace-analysis': '项目分析',
  'general-chat': '普通对话',
}

const scopeLabels: Record<string, string> = {
  'editor-selection': '编辑器选区',
  'selected-documents': '所选文档',
  'current-document': '当前文档',
  workspace: '整个项目',
  conversation: '当前会话',
}

const effectLabels: Record<string, string> = {
  read: '只读',
  draft: '生成草稿',
  proposal: '生成提案',
}

function targetLabel(target: TaskMessageRef['targets'][number]): string {
  if (target.kind === 'selection') return '编辑器选区'
  if (target.kind === 'work') return '当前作品'
  const normalized = target.id.replace(/\\/gu, '/')
  return normalized.split('/').at(-1) || target.id
}

export function TaskRequestSummary({ task }: { task: TaskMessageRef | null | undefined }) {
  if (!task || (task.intent === 'general-chat' && task.targets.length === 0 && !task.actionId)) return null
  const visibleTargets = task.targets.slice(0, 4)
  return <div className="message-request-context" aria-label="任务范围">
    <div className="message-request-targets">
      <span className="message-request-kind"><Layers3 />{intentLabels[task.intent] ?? task.intent}</span>
      {visibleTargets.map((target) => <span className="message-request-target" key={`${target.kind}:${target.id}`} title={target.id}>
        {target.kind === 'selection' ? <Highlighter /> : <FileText />}
        <span>{targetLabel(target)}</span>
      </span>)}
      {task.targets.length > visibleTargets.length && <span className="message-request-more">+{task.targets.length - visibleTargets.length}</span>}
    </div>
    <small>{scopeLabels[task.scope] ?? task.scope} · {effectLabels[task.sideEffect] ?? task.sideEffect}</small>
  </div>
}
