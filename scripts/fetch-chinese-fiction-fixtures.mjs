import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { JSDOM } from 'jsdom'

const root = resolve(import.meta.dirname, '..', 'tests', 'fixtures', 'chinese-fiction')
const works = [
  { sourceTitle: '孔乙己', title: '孔乙己', target: '短篇/孔乙己.txt', minimumCharacters: 2_000 },
  { sourceTitle: '狂人日記', title: '狂人日记', target: '短篇/狂人日记.txt', minimumCharacters: 4_000 },
  { sourceTitle: '故鄉', title: '故乡', target: '短篇/故乡.txt', minimumCharacters: 4_000 },
  { sourceTitle: '阿Q正傳', title: '阿Q正传', target: '中篇/阿Q正传.txt', minimumCharacters: 18_000 },
]

function sourceUrl(title) {
  return `https://zh.wikisource.org/wiki/${encodeURIComponent(title)}?action=render&variant=zh-hans`
}

function normalizeText(html, work) {
  const document = new JSDOM(html).window.document
  const content = document.querySelector('.prp-pages-output')
  if (!content) throw new Error(`${work.sourceTitle} 页面缺少 .prp-pages-output 正文`)
  content.querySelectorAll('style, script, .mw-editsection, .pagenum, .ws-noexport').forEach((node) => node.remove())
  const body = (content.textContent ?? '')
    .replace(/[\u200b\ufeff]/gu, '')
    .replace(/\u00a0/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
  const text = `《${work.title}》\n作者：鲁迅\n\n${body}\n`
  if (text.length < work.minimumCharacters) {
    throw new Error(`${work.sourceTitle} 正文异常：仅 ${text.length} 字符`)
  }
  return text
}

await mkdir(root, { recursive: true })
const manifest = []
for (const work of works) {
  const url = sourceUrl(work.sourceTitle)
  const response = await fetch(url, {
    headers: { 'user-agent': 'Vinkey-fixture-builder/1.0 (Chinese fiction test fixtures)' },
  })
  if (!response.ok) throw new Error(`${work.sourceTitle} 下载失败：HTTP ${response.status}`)
  const text = normalizeText(await response.text(), work)
  const target = resolve(root, work.target)
  const relativeTarget = relative(root, target)
  if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) throw new Error(`非法输出路径：${work.target}`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, text, 'utf8')
  manifest.push({
    path: work.target,
    title: work.title,
    author: '鲁迅',
    source: url,
    characters: [...text].length,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  })
  console.log(`${work.target}\t${[...text].length} 字符`)
}
await writeFile(resolve(root, 'manifest.json'), `${JSON.stringify({ generatedAt: '2026-09-17', works: manifest }, null, 2)}\n`, 'utf8')
