import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { DocumentSnapshot, WorkspaceSnapshot } from '../types'

const demoDocuments = new Map<string, DocumentSnapshot>([
  ['00-创作说明.md', {
    path: '00-创作说明.md',
    name: '00-创作说明.md',
    content: '# 雾港来信\n\n一部长篇悬疑小说。故事发生在终年多雾的临海小城，主角林晚回乡整理父亲遗物，却发现一叠从未寄出的信。\n\n## 当前目标\n\n补全第一章结尾，让读者意识到来信的日期存在问题。',
    kind: 'markdown',
    modifiedMs: 1724515200000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['章节/第一章.md', {
    path: '章节/第一章.md',
    name: '第一章.md',
    content: '# 第一章 归港\n\n傍晚六点，渡轮终于靠岸。\n\n林晚站在甲板最末端，隔着一层潮湿的玻璃看见雾中的旧钟楼。指针停在五点四十分，和她离开这里的那天一模一样。\n\n她下意识摸了摸行李箱夹层。父亲留下的第七封信就在那里。',
    kind: 'markdown',
    modifiedMs: 1724601600000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['设定/人物.md', {
    path: '设定/人物.md',
    name: '人物.md',
    content: '# 人物\n\n## 林晚\n\n29 岁，纪录片剪辑师。观察敏锐，习惯用事实回避情绪。\n\n## 林崇山\n\n林晚的父亲，港口旧钟楼的维护员，三个月前去世。',
    kind: 'markdown',
    modifiedMs: 1724688000000,
    lineEnding: 'lf',
    hasBom: false,
  }],
  ['设定/时间线.txt', {
    path: '设定/时间线.txt',
    name: '时间线.txt',
    content: '2008-09-17 林晚离开雾港\n2024-04-03 林崇山去世\n2024-05-12 林晚收到没有邮戳的信\n2024-05-18 林晚回到雾港',
    kind: 'text',
    modifiedMs: 1724774400000,
    lineEnding: 'lf',
    hasBom: false,
  }],
])

function demoWorkspace(): WorkspaceSnapshot {
  return {
    id: 'demo-workspace',
    name: '雾港来信',
    pathLabel: '浏览器演示工作区',
    entries: [
      { name: '00-创作说明.md', path: '00-创作说明.md', kind: 'file', children: [] },
      {
        name: '章节', path: '章节', kind: 'directory', children: [
          { name: '第一章.md', path: '章节/第一章.md', kind: 'file', children: [] },
        ],
      },
      {
        name: '设定', path: '设定', kind: 'directory', children: [
          { name: '人物.md', path: '设定/人物.md', kind: 'file', children: [] },
          { name: '时间线.txt', path: '设定/时间线.txt', kind: 'file', children: [] },
        ],
      },
    ],
  }
}

export const isDesktop = () => '__TAURI_INTERNALS__' in window

export async function chooseWorkspace(): Promise<WorkspaceSnapshot | null> {
  if (!isDesktop()) return demoWorkspace()
  const selected = await open({ directory: true, multiple: false, title: '选择 Vinkey 工作目录' })
  if (!selected) return null
  return invoke<WorkspaceSnapshot>('authorize_workspace', { root: selected })
}

export async function refreshWorkspace(): Promise<WorkspaceSnapshot> {
  if (!isDesktop()) return demoWorkspace()
  return invoke<WorkspaceSnapshot>('get_workspace')
}

export async function readDocument(path: string): Promise<DocumentSnapshot> {
  if (!isDesktop()) {
    const document = demoDocuments.get(path)
    if (!document) throw new Error(`找不到文档：${path}`)
    return { ...document }
  }
  return invoke<DocumentSnapshot>('read_document', { path })
}

export async function saveDocument(document: DocumentSnapshot): Promise<DocumentSnapshot> {
  if (!isDesktop()) {
    const saved = { ...document, modifiedMs: Date.now() }
    demoDocuments.set(document.path, saved)
    return saved
  }
  return invoke<DocumentSnapshot>('save_document', {
    path: document.path,
    content: document.content,
    expectedModifiedMs: document.modifiedMs,
    lineEnding: document.lineEnding,
    hasBom: document.hasBom,
  })
}

export async function createDocument(path: string): Promise<DocumentSnapshot> {
  if (!isDesktop()) {
    if (demoDocuments.has(path)) throw new Error('同名文件已存在')
    const name = path.split('/').at(-1) ?? path
    const document: DocumentSnapshot = {
      path, name, content: '', kind: path.endsWith('.txt') ? 'text' : 'markdown',
      modifiedMs: Date.now(), lineEnding: 'lf', hasBom: false,
    }
    demoDocuments.set(path, document)
    return document
  }
  return invoke<DocumentSnapshot>('create_document', { path })
}

export async function createDirectory(path: string): Promise<void> {
  if (!isDesktop()) return
  await invoke('create_directory', { path })
}
