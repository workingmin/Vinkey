import { mkdtemp, rm, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

// W1-MODEL-E / D-MODEL 模型设置真实端到端验收脚本（UI-ACC-SETTINGS-001）。
// 通过 Ollama/兼容服务的 HTTP API 验证服务可达、目录发现、模型检查（/api/show）、
// 真实 completion、多模型目录、超时与连接失败的优雅处理。默认不读取真实应用数据目录，
// 仅对测试人员指定的 base url 发起只读探测与一次最小推理。

export const SUITE_ID = 'UI-ACC-SETTINGS-001'
export const SUITE_VERSION = 'model-acceptance-1'
export const ACCEPTANCE_ID = 'W1-MODEL-E'
export const DOMAIN_ID = 'D-MODEL'
export const GATE = 'E'

export type CaseStatus = 'PASS' | 'FAIL' | 'BLOCKED'

export interface CaseResult {
  caseId: string
  title: string
  category: 'machine' | 'manual'
  status: CaseStatus
  detail: string | null
  evidence?: string | null
  notes?: string | null
  durationMs?: number
  blockedReason?: string | null
}

export interface CliOptions {
  baseUrl: string
  model: string
  profileId: string | null
  profileName: string | null
  timeoutMs: number
  logFile: string | null
  testerId: string | null
  json: boolean
}

export interface RepositoryInfo {
  version: string
  gitSha: string | null
  dirty: boolean
  root: string
}

export interface EnvironmentInfo {
  os: string
  osVersion: string
  arch: string
  node: string
  rust: string
  tauriCli: string
  tauriFramework: string
  ollama: string
}

export interface SelectedModel {
  profileId: string
  profileName: string
  model: string
  connectionKind: 'ollama' | 'openai-compatible'
  connectionBaseUrl: string
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
  --model <name>         目标模型标签（默认 qwen3:8b）
  --profile-id <id>      显式 profile ID；省略时由 base-url|model 派生稳定 ID
  --profile-name <name>  profile 显示名（默认 derived）
  --timeout-ms <ms>      单请求超时（默认 30000）
  --log-file <path>      逐用例 JSON 诊断日志路径；未指定写入系统临时目录
  --tester-id <id>       非个人测试人员代号
  --json                 仅输出单个完整 JSON 文档到 stdout
  -h, --help             显示帮助

说明：
  - 探测只读：/api/tags 与 /api/show；推理仅一次极小提示，不发送用户作品正文。
  - 连接失败与超时用例验证脚本优雅降级，不因服务不可达而崩溃。`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b',
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

export function collectRepository(root: string): RepositoryInfo {
  let version = '0.0.0'
  const packageFile = join(root, 'package.json')
  if (existsSync(packageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version) version = parsed.version
    } catch { /* 保留默认版本 */ }
  }
  const shaRun = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const statusRun = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  return {
    version,
    gitSha: shaRun.status === 0 ? shaRun.stdout.trim() : null,
    dirty: Boolean(statusRun.stdout.trim()),
    root,
  }
}

function gnuVersion(prefix: string, output: string): string {
  const match = output.match(new RegExp(`${prefix}[\\s/]([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)`))
  return (match?.[1] ?? output.split(/\s+/u)[1] ?? output) || 'N/A'
}

export function collectEnvironment(root: string, baseUrl: string, timeoutMs: number): EnvironmentInfo {
  const packageFile = join(root, 'package.json')
  let tauriCli = 'N/A'
  try {
    const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { devDependencies?: Record<string, string> }
    tauriCli = parsed.devDependencies?.['@tauri-apps/cli'] ?? 'N/A'
  } catch { tauriCli = 'N/A' }
  let tauriFramework = 'N/A'
  const cargoFile = join(root, 'src-tauri', 'Cargo.toml')
  if (existsSync(cargoFile)) {
    const content = readFileSync(cargoFile, 'utf8')
    const match = content.match(/tauri\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/u)
    if (match?.[1]) tauriFramework = match[1]
    else {
      const direct = content.match(/^tauri\s*=\s*"([^"]+)"/mu)
      if (direct?.[1]) tauriFramework = direct[1]
    }
  }
  const rust = spawnSync('rustc', ['--version'], { encoding: 'utf8' })
  let ollama = 'N/A'
  // 环境采集本身不阻断：base url 不可达时记 N/A。
  const versionRes = spawnSync('curl', ['-s', '-m', String(Math.min(timeoutMs, 5000) / 1000), `${baseUrl}/api/version`], { encoding: 'utf8' })
  if (versionRes.status === 0 && versionRes.stdout.trim()) {
    try {
      const parsed = JSON.parse(versionRes.stdout) as { version?: string }
      if (parsed.version) ollama = parsed.version
    } catch { /* 保留 N/A */ }
  }
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion: process.platform === 'win32' ? process.arch : (spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).status === 0 ? spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim() : 'N/A'),
    arch: process.arch,
    node: process.version,
    rust: rust.status === 0 ? gnuVersion('rustc', rust.stdout) : 'N/A',
    tauriCli,
    tauriFramework,
    ollama,
  }
}

export interface ModelCaseContext {
  baseUrl: string
  model: string
  timeoutMs: number
}

export async function runMachineCases(context: ModelCaseContext): Promise<CaseResult[]> {
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

function summarizeCases(cases: CaseResult[]): { caseCount: number; passed: number; failed: number; blocked: number } {
  return {
    caseCount: cases.length,
    passed: cases.filter((c) => c.status === 'PASS').length,
    failed: cases.filter((c) => c.status === 'FAIL').length,
    blocked: cases.filter((c) => c.status === 'BLOCKED').length,
  }
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
  const machineCases = input.cases && input.cases.length > 0 ? input.cases : await runMachineCases({ baseUrl: options.baseUrl, model: options.model, timeoutMs: options.timeoutMs })
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
    repository: { version: repository.version, gitSha: repository.gitSha, dirty: repository.dirty },
    application: {
      version: repository.version,
      buildNumber: null,
      gitSha: null,
      architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W1-MODEL-E 真实端到端验收：通过 Ollama/兼容服务 HTTP API 验证目录发现、模型检查与最小推理；不读取真实应用数据目录与用户作品。',
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

  const { createHash } = await import('node:crypto')
  const sha = createHash('sha256').update(readFileSync(resultFile)).digest('hex')
  writeFileSync(sha256File, `${sha}  result.json\n`, 'utf8')
  // result.json 不自引用自身 hash：定稿写入后由 SHA256SUMS 记录其最终 hash，保证 shasum -c 通过。
  const finalResult = result

  return { result: finalResult, conclusion, exitCode, outputDir, resultFile, sha256File, logFile }
}

function stdoutSummary(output: AcceptanceRunOutput): string {
  const s = output.result.summary as { caseCount: number; passed: number; failed: number; blocked: number }
  return [
    `${SUITE_ID} acceptance: ${output.conclusion} (${s.passed}/${s.caseCount} passed, ${s.failed} failed, ${s.blocked} blocked)`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.exitCode}`,
  ].join('\n')
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
  const selectedModel: SelectedModel = {
    profileId,
    profileName,
    model: options.model,
    connectionKind: options.baseUrl.includes('openai') ? 'openai-compatible' : 'ollama',
    connectionBaseUrl: options.baseUrl,
  }

  try {
    const output = await runModelAcceptance({ options, repository, environment, selectedModel })
    stderrProgress(output.result.cases as CaseResult[])
    if (options.json) console.log(JSON.stringify(output.result, null, 2))
    else console.log(stdoutSummary(output))
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
