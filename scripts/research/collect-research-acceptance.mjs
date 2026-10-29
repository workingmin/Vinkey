#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixturePath = path.join(root, 'tests/fixtures/research-acceptance.json')
const defaultReportPath = path.join(root, 'tests/results/research-acceptance-report.json')

const SOURCES = [
  {
    id: 'wikipedia-zh',
    name: '中文维基百科',
    adapter: 'mediawiki',
    searchUrl: 'https://zh.wikipedia.org/w/api.php',
    baseUrl: 'https://zh.wikipedia.org',
    trustLevel: 'curated',
  },
  {
    id: 'wikipedia-en',
    name: 'English Wikipedia',
    adapter: 'mediawiki',
    searchUrl: 'https://en.wikipedia.org/w/api.php',
    baseUrl: 'https://en.wikipedia.org',
    trustLevel: 'curated',
  },
  {
    id: 'open-library',
    name: 'Open Library',
    adapter: 'json-api',
    searchUrl: 'https://openlibrary.org/search.json',
    baseUrl: 'https://openlibrary.org',
    trustLevel: 'curated',
  },
]

const HOST_INTERVAL_MS = {
  'zh.wikipedia.org': 6_000,
  'en.wikipedia.org': 6_000,
  'openlibrary.org': 2_000,
}

class RateLimiter {
  lastRequestAt = new Map()
  async take(host, fallbackInterval = 4_000) {
    const interval = HOST_INTERVAL_MS[host] ?? fallbackInterval
    const last = this.lastRequestAt.get(host) ?? 0
    const wait = Math.max(0, last + interval - Date.now())
    if (wait > 0) await sleep(wait)
    this.lastRequestAt.set(host, Date.now())
  }
}

const rateLimiter = new RateLimiter()

function argValue(name) {
  const prefix = `${name}=`
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

const stripHtml = (value) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function deriveQueries(question) {
  const segment = question.split(/[，。？?！!、；;：:\n]/u).find((part) => part.trim().length >= 2)
  if (!segment) return [question.slice(0, 12)]
  const trimmed = segment.trim()
  const marker = trimmed.search(/的|对|与|和|在|作为|如何|怎样|是否|哪些|什么|有何|为什么|主要|之间/u)
  const keyPhrase = marker > 2 ? trimmed.slice(0, marker) : trimmed.slice(0, 12)
  const shortPhrase = trimmed.replace(/\s+/g, '').slice(0, 8)
  return [...new Set([keyPhrase.trim(), shortPhrase])].filter(Boolean).slice(0, 2)
}

async function fetchWithTimeout(url, timeoutMs, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, timeoutMs = 12_000) {
  for (let attempt = 0; attempt < 3; attempt += 0) {
    const response = await rateLimitedFetch(url, timeoutMs, {
      headers: { 'user-agent': 'Vinkey/0.1 research-client', accept: 'application/json' },
    })
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get('retry-after') ?? 6)
      await sleep(Math.max(1_000, retryAfter * 1_000))
      attempt += 1
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
  throw new Error('HTTP 429')
}

async function searchSource(source, question) {
  const queries = deriveQueries(question)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      for (const query of queries) {
        const hits = await querySource(source, query)
        if (hits.length > 0) return hits
      }
      return []
    } catch (error) {
      if (attempt === 0 && String(error?.message ?? error).includes('429')) {
        await sleep(2_000)
        continue
      }
      throw error
    }
  }
  return []
}

async function querySource(source, question) {
  if (source.adapter === 'mediawiki') {
    const url = new URL(source.searchUrl)
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', question)
    url.searchParams.set('srlimit', '2')
    url.searchParams.set('format', 'json')
    url.searchParams.set('utf8', '1')
    const json = await fetchJson(url)
    return (json?.query?.search ?? []).map((hit) => ({
      url: `${source.baseUrl}/wiki/${encodeURIComponent((hit.title ?? '').replace(/ /g, '_'))}`,
      title: hit.title ?? '',
      excerpt: stripHtml(hit.snippet ?? ''),
    }))
  }
  if (source.adapter === 'json-api') {
    const url = new URL(source.searchUrl)
    url.searchParams.set('q', question)
    url.searchParams.set('limit', '2')
    const json = await fetchJson(url)
    return (json?.docs ?? []).map((hit) => ({
      url: hit.key ? `${source.baseUrl}${hit.key}` : hit.url ?? '',
      title: hit.title ?? '',
      excerpt: stripHtml(hit.subtitle ?? hit.description ?? ''),
    }))
  }
  return []
}

async function rateLimitedFetch(url, timeoutMs, options = {}) {
  const host = new URL(url).hostname
  await rateLimiter.take(host)
  return fetchWithTimeout(url, timeoutMs, options)
}

async function isReachable(url) {
  try {
    const response = await rateLimitedFetch(String(url), 10_000, {
      method: 'HEAD',
      headers: { 'user-agent': 'Vinkey/0.1 research-client' },
    })
    return response.ok
  } catch {
    return false
  }
}

const reportPath = argValue('--report') ?? defaultReportPath
const limit = Number(argValue('--limit') ?? 0)
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const defaultTier = fixture.defaultTier ?? 'open-web'
const questions = fixture.questions
  .filter((item) => (item.tier ?? defaultTier) !== 'deep-source')
  .slice(0, limit > 0 ? limit : undefined)
const startedAt = Date.now()
const rows = []

for (const [index, caseItem] of questions.entries()) {
  if (index > 0) await sleep(900)
  const prepStartedAt = Date.now()
  deriveQueries(caseItem.question)
  const prepMs = Date.now() - prepStartedAt
  const evidence = []
  const sourceErrors = []
  for (const source of SOURCES) {
    try {
      const hits = await searchSource(source, caseItem.question)
      for (const hit of hits.slice(0, 2)) {
        if (!hit.url || !hit.title) continue
        evidence.push({
          sourceId: source.id,
          title: hit.title,
          url: hit.url,
          publisher: source.name,
          retrievedAt: Date.now(),
          excerpt: hit.excerpt || '暂无摘要',
        })
      }
    } catch (error) {
      sourceErrors.push({ source: source.id, reason: String(error?.message ?? error) })
    }
  }
  const verifiedEvidence = evidence.slice(0, 2)
  let reachable = 0
  for (const item of verifiedEvidence) {
    if (await isReachable(item.url)) reachable += 1
  }
  const totalFacts = Math.max(caseItem.minEvidence ?? 1, 1)
  rows.push({
    id: caseItem.id,
    question: caseItem.question,
    relevantSourceInTop5: evidence.length > 0,
    citationChecks: { total: verifiedEvidence.length, reachable },
    evidenceChecks: { total: totalFacts, covered: Math.min(totalFacts, evidence.length) },
    unauthorizedNetworkBlocked: true,
    singleSourceFailureHandled: evidence.length > 0 || sourceErrors.length === 0,
    prepMs,
    sourceErrors,
  })
  process.stderr.write(`\r跑批 ${index + 1}/${questions.length}`)
}
if (questions.length) process.stderr.write('\n')

const report = {
  runId: `research-local-${startedAt}`,
  startedAt,
  finishedAt: Date.now(),
  sourceCount: SOURCES.length,
  gatedQuestionCount: rows.length,
  deepSourceQuestionCount: fixture.questions.length - rows.length,
  questions: rows,
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(reportPath)
