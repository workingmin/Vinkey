import { Channel, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type {
  ChatMessage, ChatRequest, ChatStreamEvent, Conversation, ConversationSummary,
  DocumentSnapshot, ModelConnectionResult, ModelProfile, ModelProfileInput, SearchHit,
  WorkspaceSnapshot,
} from '../types'

const PROFILE_KEY = 'vinkey.demo.modelProfiles'
const CONVERSATION_KEY = 'vinkey.demo.conversations'
const demoCancellations = new Set<string>()

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

export async function searchWorkspace(query: string): Promise<SearchHit[]> {
  if (!isDesktop()) {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    return [...demoDocuments.values()].flatMap((document) => document.content.split('\n').flatMap((line, index) =>
      line.toLocaleLowerCase().includes(normalized) ? [{ path: document.path, line: index + 1, snippet: line.slice(0, 180) }] : []))
  }
  return invoke<SearchHit[]>('search_workspace', { query, maxResults: 100 })
}

function defaultDemoProfile(): ModelProfile {
  return {
    id: 'demo-ollama', name: 'Ollama · 浏览器演示', kind: 'ollama', baseUrl: 'http://localhost:11434',
    model: 'qwen2.5:7b', contextWindow: 32768, hasApiKey: false, updatedAt: Date.now(),
  }
}

function readDemoProfiles(): ModelProfile[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '[]') as Array<ModelProfile & {
      apiKey?: string
      clearApiKey?: boolean
    }>
    const value = stored.map(({ apiKey: _apiKey, clearApiKey: _clearApiKey, ...profile }) => profile)
    if (stored.some((profile) => 'apiKey' in profile || 'clearApiKey' in profile)) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(value))
    }
    return value.length > 0 ? value : [defaultDemoProfile()]
  } catch { return [defaultDemoProfile()] }
}

export async function listModelProfiles(): Promise<ModelProfile[]> {
  if (!isDesktop()) return readDemoProfiles()
  return invoke<ModelProfile[]>('list_model_profiles')
}

export async function saveModelProfile(input: ModelProfileInput): Promise<ModelProfile> {
  if (!isDesktop()) {
    const existing = readDemoProfiles().find((item) => item.id === input.id)
    const profile: ModelProfile = {
      id: input.id,
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      model: input.model,
      contextWindow: input.contextWindow,
      hasApiKey: input.clearApiKey ? false : Boolean(input.apiKey) || Boolean(existing?.hasApiKey),
      updatedAt: Date.now(),
    }
    const profiles = readDemoProfiles().filter((item) => item.id !== input.id)
    localStorage.setItem(PROFILE_KEY, JSON.stringify([profile, ...profiles]))
    return profile
  }
  return invoke<ModelProfile>('save_model_profile', { input })
}

export async function deleteModelProfile(id: string): Promise<void> {
  if (!isDesktop()) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(readDemoProfiles().filter((item) => item.id !== id)))
    return
  }
  await invoke('delete_model_profile', { id })
}

export async function testModelConnection(input: ModelProfileInput): Promise<ModelConnectionResult> {
  if (!isDesktop()) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    return { ok: true, message: '浏览器演示连接正常', models: input.kind === 'ollama' ? ['qwen2.5:7b', 'qwen2.5:14b', 'llama3.2:latest'] : [input.model || 'custom-model'] }
  }
  return invoke<ModelConnectionResult>('test_model_connection', { input })
}

export async function streamChat(request: ChatRequest, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  if (!isDesktop()) {
    demoCancellations.delete(request.requestId)
    const contextCount = request.messages.filter((message) => message.content.includes('<document path=')).length
    const response = `${contextCount > 0 ? '我已读取你明确附加的本地文档。\n\n' : ''}这是浏览器演示流。桌面应用会通过 Rust 连接已配置的 Ollama 或 OpenAI 兼容服务；消息会分段到达，并保存在本机数据库中。`
    for (const content of response.match(/.{1,8}/gu) ?? []) {
      if (demoCancellations.has(request.requestId)) throw new Error('请求已停止')
      await new Promise((resolve) => window.setTimeout(resolve, 45))
      onEvent({ type: 'chunk', content })
    }
    onEvent({ type: 'done' })
    return
  }
  const channel = new Channel<ChatStreamEvent>()
  channel.onmessage = onEvent
  await invoke('stream_chat', { request, onEvent: channel })
}

export async function cancelChat(requestId: string): Promise<void> {
  if (!isDesktop()) { demoCancellations.add(requestId); return }
  await invoke('cancel_chat', { requestId })
}

function readDemoConversations(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(CONVERSATION_KEY) ?? '[]') as Conversation[] } catch { return [] }
}

export async function listConversations(): Promise<ConversationSummary[]> {
  if (!isDesktop()) return readDemoConversations().map((conversation) => ({
    id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt, messageCount: conversation.messages.length,
  })).sort((left, right) => right.updatedAt - left.updatedAt)
  return invoke<ConversationSummary[]>('list_conversations')
}

export async function loadConversation(id: string): Promise<Conversation> {
  if (!isDesktop()) {
    const conversation = readDemoConversations().find((item) => item.id === id)
    if (!conversation) throw new Error('找不到该会话')
    return conversation
  }
  return invoke<Conversation>('load_conversation', { id })
}

export async function saveConversationMessage(conversationId: string, title: string, message: ChatMessage): Promise<void> {
  if (!isDesktop()) {
    const values = readDemoConversations()
    const existing = values.find((item) => item.id === conversationId)
    if (existing) {
      existing.title = title
      existing.updatedAt = message.createdAt
      existing.messages = [...existing.messages.filter((item) => item.id !== message.id), message]
    } else values.push({ id: conversationId, title, updatedAt: message.createdAt, messages: [message] })
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(values))
    return
  }
  await invoke('save_conversation_message', { conversationId, title, message })
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isDesktop()) {
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(readDemoConversations().filter((item) => item.id !== id)))
    return
  }
  await invoke('delete_conversation', { id })
}
