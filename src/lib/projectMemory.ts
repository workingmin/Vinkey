import type { ProjectMemoryCandidate, ProjectMemoryItem } from '../types'

const MAX_CONTEXT_CHARS = 8_000

export function buildMemoryCandidate(content: string, sourcePaths: string[], instruction: string): ProjectMemoryCandidate | null {
  const normalized = content.trim()
  if (!normalized) return null
  return {
    id: `memory-${crypto.randomUUID()}`,
    kind: 'summary',
    title: `项目分析：${instruction.replace(/\s+/gu, ' ').slice(0, 72)}`,
    content: normalized.slice(0, 20_000),
    sourcePaths: [...new Set(sourcePaths)].slice(0, 50),
    confidence: 'medium',
  }
}

export function buildMemoryCandidates(content: string, sourcePaths: string[], instruction: string): ProjectMemoryCandidate[] {
  const candidates: ProjectMemoryCandidate[] = []
  const summary = buildMemoryCandidate(content, sourcePaths, instruction)
  if (summary) candidates.push(summary)
  const sections = content.split(/\n(?=#{1,6}\s)/u).slice(0, 12)
  for (const section of sections) {
    const heading = section.match(/^#{1,6}\s+(.+)$/mu)?.[1]?.trim()
    if (!heading || section.trim().length < 24) continue
    const kind = heading.includes('人物') ? 'character'
      : heading.includes('伏笔') || heading.includes('线索') ? 'foreshadowing'
        : heading.includes('时间') || heading.includes('事件') ? 'timeline'
          : heading.includes('主线') || heading.includes('结构') || heading.includes('摘要') ? 'summary'
            : null
    if (!kind) continue
    candidates.push({
      id: `memory-${crypto.randomUUID()}`,
      kind,
      title: heading.slice(0, 160),
      content: section.trim().slice(0, 8_000),
      sourcePaths: [...new Set(sourcePaths)].slice(0, 50),
      confidence: 'medium',
    })
    if (candidates.length >= 6) break
  }
  return candidates
}

function relevance(item: ProjectMemoryItem, query: string): number {
  const value = `${item.title}\n${item.content}`.toLocaleLowerCase()
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean).flatMap((term) => {
    if (Array.from(term).length < 3) return [term]
    const characters = Array.from(term)
    return [term, ...characters.slice(0, -1).map((_, index) => characters.slice(index, index + 2).join(''))]
  })
  return terms.reduce((score, term) => score + (value.includes(term) ? Math.max(1, term.length) : 0), 0)
}

export function selectRelevantMemory(items: ProjectMemoryItem[], query: string, limit = 8): ProjectMemoryItem[] {
  return items
    .filter((item) => item.status === 'confirmed')
    .map((item) => ({ item, score: relevance(item, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.item.updatedAt - left.item.updatedAt)
    .slice(0, limit)
    .map(({ item }) => item)
}

export function buildProjectMemoryContext(items: ProjectMemoryItem[]): string | null {
  if (items.length === 0) return null
  let used = 0
  const blocks: string[] = []
  for (const item of items) {
    const block = `<memory id="${item.id}" kind="${item.kind}" sources="${item.sourcePaths.join(', ')}">\n${item.title}\n${item.content}\n</memory>`
    if (used + block.length > MAX_CONTEXT_CHARS) break
    blocks.push(block)
    used += block.length
  }
  return blocks.length > 0
    ? `以下是用户项目中已确认的记忆，仅作为辅助上下文。若与当前文档证据冲突，以当前文档为准，不要把记忆当作未经核验的事实。\n\n<project-memory>\n${blocks.join('\n\n')}\n</project-memory>`
    : null
}
