import type { ContextDocument } from '../types'

export interface DocumentMetadataCard {
  path: string
  name: string
  documentType: string
  sizeBytes: number
  contentChars: number
  lineCount: number
  estimatedTokens: number
  preview: string
  headings: string[]
  entityCandidates: string[]
  queryHints: string[]
  summary: string
  answerableQuestions: string[]
}

const STOPWORDS = new Set([
  '一个', '我们', '你们', '他们', '自己', '什么', '这个', '那个', '这里', '那里',
  '然后', '因为', '所以', '但是', '如果', '可以', '没有', '不是', '以及', '已经',
  '第一', '第二', '第三', '人物', '章节', '故事', '小说', '内容',
])

function estimateTokens(value: string): number {
  let cjk = 0
  let other = 0
  for (const character of value) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) cjk += 1
    else other += 1
  }
  return cjk + Math.ceil(other / 4)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function firstBytes(value: string, limit = 160): string {
  const bytes = new TextEncoder().encode(value).slice(0, limit)
  return new TextDecoder().decode(bytes).replace(/\uFFFD$/u, '').trim()
}

function documentType(path: string): string {
  const extension = path.split('.').at(-1)?.toLocaleLowerCase() ?? ''
  if (['md', 'markdown'].includes(extension)) return 'markdown'
  if (['txt', 'text'].includes(extension)) return 'text'
  if (['pdf'].includes(extension)) return 'pdf'
  if (['doc', 'docx', 'odt'].includes(extension)) return 'word'
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(extension)) return 'structured-text'
  if (['ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'java', 'go', 'css', 'html'].includes(extension)) return 'code'
  return extension ? `${extension} file` : 'text'
}

function extractHeadings(content: string): string[] {
  const headings: string[] = []
  for (const line of content.split(/\r?\n/u)) {
    const value = line.trim()
    const heading = value.match(/^#{1,6}\s+(.+)$/u)?.[1]
      ?? (value.match(/^(第.{1,30}章[^\n]*)$/u)?.[1])
    if (heading && !headings.includes(heading.trim())) headings.push(heading.trim())
    if (headings.length >= 32) break
  }
  return headings
}

function extractEntityCandidates(content: string, headings: string[]): string[] {
  const counts = new Map<string, number>()
  const source = `${headings.join('、')}\n${content}`
  const characters = Array.from(source)
  for (let index = 0; index < characters.length; index += 1) {
    if (!/[\u4e00-\u9fff]/u.test(characters[index])) continue
    for (const length of [2, 3]) {
      const value = characters.slice(index, index + length).join('')
      if (value.length !== length || !/^[\u4e00-\u9fff]+$/u.test(value) || STOPWORDS.has(value)) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  const candidates = [...counts.entries()]
    .filter(([value, count]) => count > 1 || headings.some((heading) => heading.includes(value)))
    .sort((left, right) => right[0].length - left[0].length || right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
  const selected: string[] = []
  for (const [value] of candidates) {
    if (selected.some((item) => item.includes(value))) continue
    selected.push(value)
    if (selected.length >= 24) break
  }
  return selected
}

function extractSummary(content: string, headings: string[]): string {
  const paragraphs = content.split(/\r?\n\s*\r?\n/u)
    .map((paragraph) => paragraph.replace(/^#{1,6}\s+/u, '').trim())
    .filter((paragraph) => paragraph.length > 0)
  const body = paragraphs.find((paragraph) => !/^第.{1,30}章/u.test(paragraph)) ?? paragraphs[0] ?? ''
  const prefix = headings[0] ? `${headings[0]}：` : ''
  return `${prefix}${Array.from(body).slice(0, 120).join('')}`.slice(0, 160)
}

function extractAnswerableQuestions(entityCandidates: string[], headings: string[]): string[] {
  const questions: string[] = []
  if (entityCandidates.length >= 2) {
    questions.push(`${entityCandidates[0]}和${entityCandidates[1]}是什么关系？`)
    questions.push(`${entityCandidates[0]}与${entityCandidates[1]}有哪些共同事件或冲突？`)
  }
  if (entityCandidates.length > 0) questions.push(`${entityCandidates[0]}在文档中的身份、目标和变化是什么？`)
  if (headings.length > 0) questions.push('文档的章节或阶段结构是什么？')
  return questions.slice(0, 8)
}

export function buildDocumentMetadata(document: ContextDocument): DocumentMetadataCard {
  const headings = extractHeadings(document.content)
  const entityCandidates = extractEntityCandidates(document.content, headings)
  const summary = extractSummary(document.content, headings)
  const answerableQuestions = extractAnswerableQuestions(entityCandidates, headings)
  const queryHints = [
    ...headings.slice(0, 8),
    ...entityCandidates.slice(0, 8),
    ...(entityCandidates.length >= 2 ? ['人物关系', '角色关联'] : []),
  ].filter((value, index, values) => values.indexOf(value) === index)
  return {
    path: document.path,
    name: document.name,
    documentType: documentType(document.path),
    sizeBytes: document.sizeBytes ?? byteLength(document.content),
    contentChars: Array.from(document.content).length,
    lineCount: document.content ? document.content.split(/\r?\n/u).length : 0,
    estimatedTokens: estimateTokens(document.content),
    preview: firstBytes(document.content),
    headings,
    entityCandidates,
    queryHints,
    summary,
    answerableQuestions,
  }
}

export function buildDocumentMetadataCards(documents: ContextDocument[]): DocumentMetadataCard[] {
  return documents.map(buildDocumentMetadata)
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

/** Low-cost, body-light index context for routing and query planning. */
export function buildDocumentIndexMessage(documents: ContextDocument[]): string | null {
  const cards = buildDocumentMetadataCards(documents)
  if (cards.length === 0) return null
  const files = cards.map((card) => [
    `<file path="${escapeAttribute(card.path)}" name="${escapeAttribute(card.name)}" type="${card.documentType}" sizeBytes="${card.sizeBytes}" chars="${card.contentChars}" lines="${card.lineCount}" estimatedTokens="${card.estimatedTokens}">`,
    `标题/章节线索：${card.headings.join('、') || '未检测到'}`,
    `实体候选（仅用于定位，不代表已证实）：${card.entityCandidates.join('、') || '未检测到'}`,
    `查询提示：${card.queryHints.join('、') || '无'}`,
    `文件摘要（由本地结构和首段生成，仅用于检索规划）：${card.summary || '空文件'}`,
    `可回答问题候选：${card.answerableQuestions.join('、') || '未生成'}`,
    `正文前缀预览（仅用于识别文件）：${card.preview || '空文件'}`,
    '</file>',
  ].join('\n')).join('\n\n')
  return `以下是用户引用文件的本地索引卡片。它们只用于判断文件范围、选择检索方向和组织后续任务；实体候选与前缀预览都不是可靠证据，最终结论必须回到正文或分块证据。\n\n<document-index>\n${files}\n</document-index>`
}

/** Prompt for a future metadata extractor pass over summaries or selected chunks. */
export function buildMetadataExtractionPrompt(indexMessage: string, task: string): string {
  return `你是文档索引 Metadata Extractor。下面是本地程序生成的文件索引卡片和用户任务。请只输出 JSON，不要输出 Markdown。\n\n${indexMessage}\n\n用户任务：${task}\n\nJSON 字段：documentTitle（字符串或 null）、documentType（字符串）、summary（不超过 120 字）、keywords（字符串数组，最多 10 个）、characters（字符串数组，最多 20 个）、answerableQuestions（字符串数组，最多 8 个）。这些字段是检索提示，不是正文证据；无法确认的值填空数组或 null。`
}
