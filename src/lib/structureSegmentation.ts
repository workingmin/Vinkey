import type { ContextDocument } from '../types'

export type StructureSegmentKind = 'chapter' | 'scene'

export interface StructureSegment {
  id: string
  kind: StructureSegmentKind
  title: string | null
  startOffset: number
  endOffset: number
  startChar: number
  endChar: number
  lineStart: number
  lineEnd: number
  confidence: 'high' | 'medium' | 'low'
  splitReason: string
  preview: string
}

export interface StructureProposal {
  sourceId: string
  sourceName: string
  segments: StructureSegment[]
  candidateCount: number
}

export interface StructureOutput {
  path: string
  name: string
  content: string
  kind: StructureSegmentKind
  sourceSegmentId: string
}

interface Candidate {
  startIndex: number
  startChar: number
  line: number
  kind: StructureSegmentKind
  title: string | null
  confidence: StructureSegment['confidence']
  splitReason: string
}

interface LineInfo {
  value: string
  startIndex: number
  endIndex: number
  startChar: number
  endChar: number
  line: number
}

function linesOf(value: string): LineInfo[] {
  const lines: LineInfo[] = []
  let startIndex = 0
  let startChar = 0
  let line = 1
  let index = 0
  let charOffset = 0
  while (index < value.length) {
    const codePoint = value.codePointAt(index) ?? 0
    const character = String.fromCodePoint(codePoint)
    const width = character.length
    if (character !== '\n') {
      index += width
      charOffset += 1
      continue
    }
    lines.push({
      value: value.slice(startIndex, index),
      startIndex,
      endIndex: index,
      startChar,
      endChar: charOffset,
      line,
    })
    index += width
    charOffset += 1
    startIndex = index
    startChar = charOffset
    line += 1
  }
  if (startIndex < value.length || value.length === 0) {
    lines.push({
      value: value.slice(startIndex),
      startIndex,
      endIndex: value.length,
      startChar,
      endChar: charOffset,
      line,
    })
  }
  return lines
}

function candidateFor(line: LineInfo): Candidate | null {
  const trimmed = line.value.trim()
  if (!trimmed) return null

  const markdown = trimmed.match(/^(#{1,6})\s+(.+)$/u)
  if (markdown) {
    const level = markdown[1].length
    const title = markdown[2].trim()
    const chapter = level <= 1 || /(?:卷|部|篇|章|回)\s*[0-9零一二三四五六七八九十百千\-、:：.]*/u.test(title)
    return {
      startIndex: line.startIndex,
      startChar: line.startChar,
      line: line.line,
      kind: chapter ? 'chapter' : 'scene',
      title,
      confidence: chapter ? 'high' : 'medium',
      splitReason: chapter ? 'markdown-heading' : 'nested-heading',
    }
  }

  if (/^第\s*[0-9零一二三四五六七八九十百千\-]+\s*[卷部篇章节回]/u.test(trimmed)) {
    return {
      startIndex: line.startIndex,
      startChar: line.startChar,
      line: line.line,
      kind: 'chapter',
      title: trimmed,
      confidence: 'high',
      splitReason: 'numbered-heading',
    }
  }

  if (/^(?:\*{3,}|-{3,}|_{3,}|……{2,})$/u.test(trimmed)) {
    return {
      startIndex: line.startIndex,
      startChar: line.startChar,
      line: line.line,
      kind: 'scene',
      title: null,
      confidence: 'high',
      splitReason: 'scene-separator',
    }
  }

  return null
}

function preview(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim()
  return compact.length > 180 ? `${compact.slice(0, 180)}…` : compact
}

export function segmentDocument(document: ContextDocument): StructureProposal {
  const lines = linesOf(document.content)
  const totalChars = Array.from(document.content).length
  const candidates = lines.flatMap((line) => {
    const candidate = candidateFor(line)
    return candidate ? [candidate] : []
  })
  const starts = candidates.length > 0
    ? (candidates[0].startIndex > 0 && document.content.slice(0, candidates[0].startIndex).trim()
      ? [{
        startIndex: 0,
        startChar: 0,
        line: 1,
        kind: 'chapter' as const,
        title: '前置内容',
        confidence: 'low' as const,
        splitReason: 'content-before-first-heading',
      }, ...candidates]
      : candidates)
    : [{
      startIndex: 0,
      startChar: 0,
      line: 1,
      kind: 'chapter' as const,
      title: null,
      confidence: 'low' as const,
      splitReason: 'no-explicit-boundary',
    }]
  const segments = starts.map((candidate, index) => {
    const next = starts[index + 1]
    const startIndex = candidate.startIndex
    const endIndex = next?.startIndex ?? document.content.length
    const startChar = candidate.startChar
    const endChar = next?.startChar ?? totalChars
    const lineStart = candidate.line
    const lineEnd = Math.max(lineStart, (lines.find((line) => line.startIndex >= endIndex)?.line ?? lines.length) - 1)
    return {
      id: `${document.path}:segment-${index + 1}`,
      kind: candidate.kind,
      title: candidate.title,
      startOffset: startIndex,
      endOffset: endIndex,
      startChar,
      endChar,
      lineStart,
      lineEnd,
      confidence: candidate.confidence,
      splitReason: candidate.splitReason,
      preview: preview(document.content.slice(startIndex, endIndex)),
    }
  })
  return {
    sourceId: document.path,
    sourceName: document.name,
    segments,
    candidateCount: candidates.length,
  }
}

function sanitizeName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 70) || '未命名'
}

function extensionOf(name: string): string {
  const match = name.match(/(\.[^.]+)$/u)
  return match ? match[1] : '.md'
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(0, slash) : ''
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/u, '')
}

export function buildStructureOutputs(document: ContextDocument, proposal: StructureProposal): StructureOutput[] {
  const chapterSegments = proposal.segments.filter((segment) => segment.kind === 'chapter')
  const segments = chapterSegments.length > 0 ? chapterSegments : proposal.segments
  const parent = parentOf(document.path)
  const outputDirectory = `${baseName(document.name)}-章节拆分`
  const directoryPath = parent ? `${parent}/${outputDirectory}` : outputDirectory
  const extension = extensionOf(document.name)
  return segments.map((segment, index) => {
    const label = sanitizeName(segment.title ?? `${segment.kind === 'chapter' ? '未命名章节' : '场景'}-${index + 1}`)
    const kindLabel = segment.kind === 'chapter' ? '章节' : '场景'
    const name = `${String(index + 1).padStart(3, '0')}-${kindLabel}-${label}${extension}`
    return {
      path: `${directoryPath}/${name}`,
      name,
      content: document.content.slice(segment.startOffset, segment.endOffset),
      kind: segment.kind,
      sourceSegmentId: segment.id,
    }
  })
}

export function formatStructureResult(proposals: StructureProposal[], outputPaths: string[]): string {
  const total = outputPaths.length
  const lowConfidence = proposals.reduce(
    (sum, proposal) => sum + proposal.segments.filter((segment) => segment.confidence === 'low').length,
    0,
  )
  const lines = [
    '## 已完成本地章节拆分',
    '',
    `已在当前项目中写入 ${total} 个拆分文件。结果基于标题、层级和分隔线规则生成，本轮未调用 AI。`,
  ]
  for (const path of outputPaths) {
    lines.push(`- ${path}`)
  }
  lines.push('', '原文未被覆盖；如需调整边界，请直接编辑这些新文件。')
  lines.push(lowConfidence > 0
    ? `有 ${lowConfidence} 个低置信度边界，是否需要进一步梳理隐含场景、章节命名和剧情阶段？请回复“重新梳理章节结构”进入 AI 增强。`
    : '如果还需要进一步梳理隐含场景、章节命名和剧情阶段，请回复“重新梳理章节结构”进入 AI 增强。')
  return lines.join('\n')
}
