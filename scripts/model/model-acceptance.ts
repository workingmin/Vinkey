import { mkdtemp, rm, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import {
  formatSuiteSummary,
  sha256OfFile,
  summarizeCases,
  type CaseResult,
  type CaseStatus,
} from '../lib/acceptance'
import { collectCoreEnvironment, collectRepository, probeOllamaVersion, type CoreEnvironmentInfo, type RepositoryInfo } from '../lib/environment'

export type { CaseResult, CaseStatus } from '../lib/acceptance'
export type { RepositoryInfo } from '../lib/environment'

// W1-MODEL-E / D-MODEL 模型设置真实端到端验收脚本（UI-ACC-SETTINGS-001）。
// 通过 Ollama 原生协议（/api/tags、/api/show、/api/chat）与 OpenAI-compatible 协议
// （/v1/models、/v1/chat/completions）分别验证服务可达、目录发现、模型检查、
// 真实 completion、多模型目录、超时与连接失败的优雅处理。默认一次运行同时执行两套协议，
// 不读取真实应用数据目录，仅对测试人员指定的 base url 发起只读探测与最小推理。
// 失败/超时用例为 blackhole 地址注入，不是真实服务故障恢复，报告中不得混称。

export const SUITE_ID = 'UI-ACC-SETTINGS-001'
export const SUITE_VERSION = 'model-acceptance-1'
export const ACCEPTANCE_ID = 'W1-MODEL-E'
export const DOMAIN_ID = 'D-MODEL'
export const GATE = 'E'

export type ModelProtocol = 'ollama' | 'openai-compatible'
export type ProtocolSelection = ModelProtocol | 'both'

export interface CliOptions {
  baseUrl: string
  model: string
  protocol: ProtocolSelection
  profileId: string | null
  profileName: string | null
  timeoutMs: number
  logFile: string | null
  testerId: string | null
  json: boolean
}

export type EnvironmentInfo = CoreEnvironmentInfo & { ollama: string }

export interface SelectedModel {
  profileId: string
  profileName: string
  model: string
  connectionKind: ModelProtocol
  connectionBaseUrl: string
  protocols: ModelProtocol[]
  openaiCompatibleBaseUrl: string | null
}

export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  selectedModel: SelectedModel
  cases?: CaseResult[] | null
}

export interface AcceptanceRunOutput {
  result: Record<string, unknown>
  conclusion: CaseStatus
  exitCode: number
  outputDir: string
  resultFile: string
  sha256File: string
  logFile: string
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function repositoryRoot(): string {
  const fromEnvironment = process.env.VINKEY_MODEL_ACCEPTANCE_ROOT
  if (fromEnvironment) return resolve(fromEnvironment)
  return process.cwd()
}

function usage(): string {
  return `Vinkey 模型设置真实端到端验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  对 Ollama/OpenAI-compatible 服务做目录发现、模型检查与一次最小 completion，
  验证真实模型/profile 可达、可推理与超时/失败优雅处理。不读取真实应用数据目录。

用法：
  npm run test:model-acceptance -- [选项]
  npm run test:model-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:model-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --base-url <url>       服务地址（默认 http://localhost:11434）
  --protocol <name>      ollama | openai-compatible | both（默认 both）
  --model <name>         目标模型标签（默认 qwen3:8b）
  --profile-id <id>      显式 profile ID；省略时由 base-url|model 派生稳定 ID
  --profile-name <name>  profile 显示名（默认 derived）
  --timeout-ms <ms>      单请求超时（默认 30000）
  --log-file <path>      逐用例 JSON 诊断日志路径；未指定写入系统临时目录
  --tester-id <id>       非个人测试人员代号
  --json                 仅输出单个完整 JSON 文档到 stdout
  -h, --help             显示帮助

说明：
  - 探测只读：Ollama /api/tags、/api/show 与 /v1/models；推理仅一次极小提示，不发送用户作品正文。
  - openai-compatible 协议在 base url 后补 /v1（已带 /v1 则直接使用）；可用 VINKEY_MODEL_API_KEY
    提供临时凭据，仅放入 Authorization header，不写入日志、result.json 或仓库。
  - 连接失败与超时用例为 blackhole 地址注入，不是真实服务故障恢复；报告中必须分别标注。`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b',
    protocol: 'both',
    profileId: null,
    profileName: null,
    timeoutMs: 30_000,
    logFile: null,
    testerId: null,
    json: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    const take = (flag: string): string => {
      const arg = values[index + 1]
      if (!arg) throw new Error(`参数 ${flag} 缺少值。`)
      index += 1
      return arg
    }
    if (value === '--base-url') options.baseUrl = take(value).replace(/\/+$/u, '')
    else if (value === '--model') options.model = take(value)
    else if (value === '--protocol') {
      const protocol = take(value)
      if (!['ollama', 'openai-compatible', 'both'].includes(protocol)) throw new Error(`未知协议 ${protocol}；可选 ollama / openai-compatible / both。`)
      options.protocol = protocol as ProtocolSelection
    }
    else if (value === '--profile-id') options.profileId = take(value)
    else if (value === '--profile-name') options.profileName = take(value)
    else if (value === '--timeout-ms') options.timeoutMs = Number(take(value)) || options.timeoutMs
    else if (value === '--log-file') options.logFile = resolve(take(value))
    else if (value === '--tester-id') options.testerId = take(value).trim()
    else throw new Error(`未知参数 ${value}。`)
  }
  return options
}

interface HttpResult {
  ok: boolean
  status: number | null
  body: unknown
  text: string
  error: string | null
  ms: number
}

function requestWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<HttpResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  return fetch(url, { ...init, signal: controller.signal })
    .then(async (res) => {
      const text = await res.text()
      let body: unknown = null
      try { body = JSON.parse(text) } catch { /* 非 JSON 也保留 text */ }
      return { ok: true, status: res.status, body, text, error: null, ms: Date.now() - start }
    })
    .catch((cause: unknown) => {
      const aborted = cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
      return { ok: false, status: null, body: null, text: '', error: aborted ? 'timeout' : messageOf(cause), ms: Date.now() - start }
    })
    .finally(() => clearTimeout(timer))
}

function fnvHash(input: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (const ch of input) {
    hash ^= BigInt(ch.codePointAt(0)!)
    hash = (hash * prime) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

function deriveProfileId(baseUrl: string, model: string): string {
  return fnvHash(`${baseUrl}|${model}`)
}

export function collectEnvironment(root: string, baseUrl: string, timeoutMs: number): EnvironmentInfo {
  return { ...collectCoreEnvironment(root), ollama: probeOllamaVersion(baseUrl, timeoutMs) }
}

export interface ModelCaseContext {
  baseUrl: string
  model: string
  timeoutMs: number
  protocol: ProtocolSelection
}

function openaiBase(baseUrl: string): string {
  return /\/v1$/u.test(baseUrl) ? baseUrl : `${baseUrl}/v1`
}

function openaiHeaders(): Record<string, string> {
  // 临时凭据只进入 Authorization header；不写入 result.json、诊断日志或仓库。
  const apiKey = process.env.VINKEY_MODEL_API_KEY?.trim()
  return { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }
}

function openaiModelIds(body: unknown): string[] {
  return ((body as { data?: Array<{ id?: string }> })?.data ?? [])
    .map((item) => item.id ?? '')
    .filter((id) => id.length > 0)
}

async function runOllamaCases(context: ModelCaseContext): Promise<CaseResult[]> {
  const { baseUrl, model, timeoutMs } = context
  const cases: CaseResult[] = []

  // MODEL-E-001 服务可达与目录发现
  {
    const issues: string[] = []
    const tags = await requestWithTimeout(`${baseUrl}/api/tags`, { method: 'GET' }, timeoutMs)
    if (!tags.ok) {
      cases.push({ caseId: 'MODEL-E-001', title: '服务可达与目录发现', category: 'machine', status: 'BLOCKED', detail: `服务不可达：${tags.error ?? '未知错误'}，无法执行真实模型验收。`, blockedReason: 'ollama-unreachable' })
    } else {
      const models = (tags.body as { models?: Array<{ name: string }> })?.models ?? []
      if (models.length === 0) issues.push('目录为空，未发现任何模型')
      const names = models.map((m) => m.name)
      if (!names.includes(model)) issues.push(`目标模型 ${model} 不在目录中（实际：${names.join(', ') || '空'}）`)
      if (issues.length > 0) cases.push({ caseId: 'MODEL-E-001', title: '服务可达与目录发现', category: 'machine', status: 'FAIL', detail: issues.join('；') })
      else cases.push({ caseId: 'MODEL-E-001', title: '服务可达与目录发现', category: 'machine', status: 'PASS', detail: `目录发现 ${models.length} 个模型，目标 ${model} 存在。` })
    }
  }

  // MODEL-E-002 模型检查与最小推理
  {
    const issues: string[] = []
    const show = await requestWithTimeout(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }, timeoutMs)
    if (!show.ok) issues.push(`/api/show 失败：${show.error ?? show.status ?? '未知'}`)
    const chat = await requestWithTimeout(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '用两个字回答：连通' }], stream: false, options: { temperature: 0 } }),
    }, timeoutMs)
    if (!chat.ok) issues.push(`最小推理失败：${chat.error ?? chat.status ?? '未知'}`)
    else {
      const reply = (chat.body as { message?: { content?: string } })?.message?.content ?? ''
      if (!reply.trim()) issues.push('推理返回空内容')
    }
    if (issues.length > 0) cases.push({ caseId: 'MODEL-E-002', title: '模型检查与最小推理', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'MODEL-E-002', title: '模型检查与最小推理', category: 'machine', status: 'PASS', detail: `/api/show 与 /api/chat 均成功，目标模型可完成一次真实推理（${chat.ms}ms）。` })
  }

  // MODEL-E-003 连接失败优雅处理（注入，不依赖真实 Ollama）
  {
    const blackhole = 'http://127.0.0.1:9'
    const res = await requestWithTimeout(`${blackhole}/api/tags`, { method: 'GET' }, 2000)
    const handled = !res.ok && (res.error === 'timeout' || res.error?.includes('ECONNREFUSED') || res.error?.includes('fetch'))
    if (handled) cases.push({ caseId: 'MODEL-E-003', title: '连接失败优雅处理', category: 'machine', status: 'PASS', detail: `指向不可达地址时脚本降级为结构化错误（${res.error}），未崩溃。` })
    else cases.push({ caseId: 'MODEL-E-003', title: '连接失败优雅处理', category: 'machine', status: 'FAIL', detail: `不可达地址未优雅处理：${JSON.stringify(res)}` })
  }

  // MODEL-E-004 多模型目录
  {
    const tags = await requestWithTimeout(`${baseUrl}/api/tags`, { method: 'GET' }, timeoutMs)
    const models = tags.ok ? ((tags.body as { models?: Array<{ name: string }> })?.models ?? []) : []
    if (models.length >= 1) cases.push({ caseId: 'MODEL-E-004', title: '多模型目录', category: 'machine', status: 'PASS', detail: `目录包含 ${models.length} 个模型：${models.map((m) => m.name).join(', ')}` })
    else cases.push({ caseId: 'MODEL-E-004', title: '多模型目录', category: 'machine', status: 'BLOCKED', detail: '目录为空，无法验证多模型选择', blockedReason: 'no-models' })
  }

  // MODEL-E-005 超时处理（注入，不依赖真实 Ollama）
  {
    const blackhole = 'http://10.255.255.1:80'
    const res = await requestWithTimeout(`${blackhole}/api/tags`, { method: 'GET' }, 200)
    const timedOut = res.error === 'timeout' || !res.ok
    if (timedOut) cases.push({ caseId: 'MODEL-E-005', title: '超时处理', category: 'machine', status: 'PASS', detail: `单请求超时上限生效（${res.ms}ms，结果：${res.error ?? '非 2xx'}），未无限等待。` })
    else cases.push({ caseId: 'MODEL-E-005', title: '超时处理', category: 'machine', status: 'FAIL', detail: `未在限定时间内中止：${JSON.stringify(res)}` })
  }

  return cases
}

async function runOpenAICompatibleCases(context: ModelCaseContext): Promise<CaseResult[]> {
  const { baseUrl, model, timeoutMs } = context
  const v1 = openaiBase(baseUrl)
  const headers = openaiHeaders()
  const cases: CaseResult[] = []

  // MODEL-E-OAI-001 兼容协议服务可达与目录发现
  {
    const res = await requestWithTimeout(`${v1}/models`, { method: 'GET', headers }, timeoutMs)
    if (!res.ok) {
      cases.push({ caseId: 'MODEL-E-OAI-001', title: 'OpenAI-compatible 目录发现', category: 'machine', status: 'BLOCKED', detail: `兼容端点不可达：${res.error ?? res.status ?? '未知错误'}。`, blockedReason: 'openai-compatible-unreachable' })
    } else {
      const ids = openaiModelIds(res.body)
      const issues: string[] = []
      if (ids.length === 0) issues.push('目录为空，未发现任何模型')
      if (!ids.includes(model)) issues.push(`目标模型 ${model} 不在目录中（实际：${ids.join(', ') || '空'}）`)
      cases.push(issues.length > 0
        ? { caseId: 'MODEL-E-OAI-001', title: 'OpenAI-compatible 目录发现', category: 'machine', status: 'FAIL', detail: issues.join('；') }
        : { caseId: 'MODEL-E-OAI-001', title: 'OpenAI-compatible 目录发现', category: 'machine', status: 'PASS', detail: `GET ${v1}/models 发现 ${ids.length} 个模型，目标 ${model} 存在。` })
    }
  }

  // MODEL-E-OAI-002 兼容协议真实最小推理
  {
    const res = await requestWithTimeout(`${v1}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '用两个字回答：连通' }], temperature: 0, stream: false }),
    }, timeoutMs)
    const reply = (res.body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? ''
    const issues: string[] = []
    if (!res.ok) issues.push(`/v1/chat/completions 失败：${res.error ?? res.status ?? '未知'}`)
    else if (!reply.trim()) issues.push('推理返回空内容')
    cases.push(issues.length > 0
      ? { caseId: 'MODEL-E-OAI-002', title: 'OpenAI-compatible 最小推理', category: 'machine', status: 'FAIL', detail: issues.join('；') }
      : { caseId: 'MODEL-E-OAI-002', title: 'OpenAI-compatible 最小推理', category: 'machine', status: 'PASS', detail: `真实调用 ${v1}/chat/completions 完成一次最小推理（${res.ms}ms），返回内容非空。` })
  }

  // MODEL-E-OAI-003 兼容协议连接失败优雅处理（blackhole 注入，不是真实服务故障恢复）
  {
    const blackhole = 'http://127.0.0.1:9'
    const res = await requestWithTimeout(`${blackhole}/v1/models`, { method: 'GET', headers }, 2000)
    const handled = !res.ok && (res.error === 'timeout' || res.error?.includes('ECONNREFUSED') || res.error?.includes('fetch'))
    cases.push(handled
      ? { caseId: 'MODEL-E-OAI-003', title: 'OpenAI-compatible 连接失败优雅处理', category: 'machine', status: 'PASS', detail: `指向不可达地址时降级为结构化错误（${res.error}），未崩溃。` }
      : { caseId: 'MODEL-E-OAI-003', title: 'OpenAI-compatible 连接失败优雅处理', category: 'machine', status: 'FAIL', detail: `不可达地址未优雅处理：${JSON.stringify(res)}` })
  }

  // MODEL-E-OAI-004 兼容协议多模型目录
  {
    const res = await requestWithTimeout(`${v1}/models`, { method: 'GET', headers }, timeoutMs)
    const ids = res.ok ? openaiModelIds(res.body) : []
    cases.push(ids.length >= 1
      ? { caseId: 'MODEL-E-OAI-004', title: 'OpenAI-compatible 多模型目录', category: 'machine', status: 'PASS', detail: `目录包含 ${ids.length} 个模型：${ids.join(', ')}` }
      : { caseId: 'MODEL-E-OAI-004', title: 'OpenAI-compatible 多模型目录', category: 'machine', status: 'BLOCKED', detail: '目录为空，无法验证多模型选择', blockedReason: 'no-models' })
  }

  // MODEL-E-OAI-005 兼容协议超时处理（blackhole 注入，不是真实服务故障恢复）
  {
    const blackhole = 'http://10.255.255.1:80'
    const res = await requestWithTimeout(`${blackhole}/v1/models`, { method: 'GET', headers }, 200)
    const timedOut = res.error === 'timeout' || !res.ok
    cases.push(timedOut
      ? { caseId: 'MODEL-E-OAI-005', title: 'OpenAI-compatible 超时处理', category: 'machine', status: 'PASS', detail: `单请求超时上限生效（${res.ms}ms，结果：${res.error ?? '非 2xx'}），未无限等待。` }
      : { caseId: 'MODEL-E-OAI-005', title: 'OpenAI-compatible 超时处理', category: 'machine', status: 'FAIL', detail: `未在限定时间内中止：${JSON.stringify(res)}` })
  }

  return cases
}

export async function runMachineCases(context: ModelCaseContext): Promise<CaseResult[]> {
  const cases: CaseResult[] = []
  if (context.protocol === 'ollama' || context.protocol === 'both') cases.push(...await runOllamaCases(context))
  if (context.protocol === 'openai-compatible' || context.protocol === 'both') cases.push(...await runOpenAICompatibleCases(context))
  return cases
}

function computeConclusion(cases: CaseResult[]): CaseStatus {
  const s = summarizeCases(cases)
  if (s.failed > 0) return 'FAIL'
  if (s.blocked > 0) return 'BLOCKED'
  return 'PASS'
}

function defaultLogFile(): string {
  const directory = process.platform === 'win32' ? tmpdir() : '/tmp'
  return join(directory, `vinkey-model-acceptance-${Date.now()}.json`)
}

export async function runModelAcceptance(input: AcceptanceRunInput): Promise<AcceptanceRunOutput> {
  const { options, repository, environment, selectedModel } = input
  const startedAt = Date.now()
  const machineCases = input.cases && input.cases.length > 0 ? input.cases : await runMachineCases({ baseUrl: options.baseUrl, model: options.model, timeoutMs: options.timeoutMs, protocol: options.protocol })
  const allCases = machineCases.map((c) => ({ ...c, durationMs: c.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = join(repository.root, 'artifacts', 'model-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  const logDirectory = logFile ? (logFile.includes(sep) ? logFile.replace(/[^/\\]*$/u, '') : '') : ''
  if (logDirectory && !existsSync(logDirectory)) mkdirSync(logDirectory, { recursive: true })

  const summary = summarizeCases(allCases)
  const conclusion = computeConclusion(allCases)
  const exitCode = conclusion === 'FAIL' ? 2 : conclusion === 'BLOCKED' ? 1 : 0

  const result: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    protocols: options.protocol === 'both' ? ['ollama', 'openai-compatible'] : [options.protocol],
    repository: { version: repository.version, gitSha: repository.gitSha, dirty: repository.dirty },
    application: {
      version: repository.version,
      buildNumber: null,
      gitSha: null,
      architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W1-MODEL-E 真实端到端验收：分别通过 Ollama 原生协议与 OpenAI-compatible 协议验证目录发现、模型检查与最小推理；不读取真实应用数据目录与用户作品。连接失败/超时用例为注入，不是真实服务故障恢复。',
    },
    provenance: {
      status: repository.gitSha && !repository.dirty ? 'PASS' : 'BLOCKED',
      versionMatch: true,
      gitShaMatch: Boolean(repository.gitSha),
      repositoryClean: !repository.dirty,
    },
    execution: { testerId: options.testerId ?? 'local-tester', testerIdBasis: 'explicit non-personal identifier' },
    environment,
    selectedModel,
    cases: allCases.map((c) => ({
      caseId: c.caseId, title: c.title, category: c.category, status: c.status,
      detail: c.detail, evidence: c.evidence ?? null, notes: c.notes ?? null,
      durationMs: c.durationMs ?? 0, blockedReason: c.blockedReason ?? null,
    })),
    summary,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion,
    elapsedMs: Date.now() - startedAt,
  }
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, generatedAt: result.generatedAt, suite: { id: SUITE_ID, version: SUITE_VERSION }, cases: allCases.map((c) => ({ caseId: c.caseId, category: c.category, status: c.status, detail: c.detail, blockedReason: c.blockedReason })) }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')

  const sha = sha256OfFile(resultFile)
  writeFileSync(sha256File, `${sha}  result.json\n`, 'utf8')
  // result.json 不自引用自身 hash：定稿写入后由 SHA256SUMS 记录其最终 hash，保证 shasum -c 通过。
  const finalResult = result

  return { result: finalResult, conclusion, exitCode, outputDir, resultFile, sha256File, logFile }
}

function stderrProgress(cases: CaseResult[]): void {
  for (const c of cases) {
    const suffix = c.status === 'BLOCKED' && c.blockedReason ? `（${c.blockedReason}）` : ''
    console.error(`[${c.caseId}] ${c.status} ${c.title}${suffix}`)
  }
}

export async function main(): Promise<void> {
  let options: CliOptions
  try {
    const parsed = parseArguments(process.argv.slice(2))
    if (!parsed) { console.log(usage()); return }
    options = parsed
  } catch (cause) {
    console.error(`参数错误：${messageOf(cause)}`)
    process.exitCode = 1
    return
  }

  const root = repositoryRoot()
  const repository = collectRepository(root)
  const environment = collectEnvironment(root, options.baseUrl, options.timeoutMs)
  const profileId = options.profileId ?? deriveProfileId(options.baseUrl, options.model)
  const profileName = options.profileName ?? `derived-${profileId.slice(0, 8)}`
  const protocols: ModelProtocol[] = options.protocol === 'both'
    ? ['ollama', 'openai-compatible']
    : [options.protocol]
  const selectedModel: SelectedModel = {
    profileId,
    profileName,
    model: options.model,
    connectionKind: protocols[0],
    connectionBaseUrl: options.baseUrl,
    protocols,
    openaiCompatibleBaseUrl: protocols.includes('openai-compatible') ? openaiBase(options.baseUrl) : null,
  }

  try {
    const output = await runModelAcceptance({ options, repository, environment, selectedModel })
    stderrProgress(output.result.cases as CaseResult[])
    if (options.json) console.log(JSON.stringify(output.result, null, 2))
    else console.log(formatSuiteSummary(SUITE_ID, output))
    process.exitCode = output.exitCode
  } catch (cause) {
    console.error(`模型验收失败：${messageOf(cause)}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_MODEL_ACCEPTANCE_CLI === '1') {
  main().catch((cause) => {
    console.error(`模型验收失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
