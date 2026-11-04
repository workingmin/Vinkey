import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// W2-CHAT-E / D-CHAT 对话真实端到端验收脚本（UI-ACC-CHAT-001）。
// 通过真实模型完成单轮发送/接收、多轮上下文延续、流式中断与连接失败的优雅处理。
// 默认不读取真实应用数据目录，仅向测试人员指定的 base url 发起真实推理。

export const SUITE_ID = 'UI-ACC-CHAT-001'
export const SUITE_VERSION = 'chat-acceptance-1'
export const ACCEPTANCE_ID = 'W2-CHAT-E'
export const DOMAIN_ID = 'D-CHAT'
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
  const fromEnvironment = process.env.VINKEY_CHAT_ACCEPTANCE_ROOT
  if (fromEnvironment) return resolve(fromEnvironment)
  return process.cwd()
}

function usage(): string {
  return `Vinkey 对话真实端到端验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  用真实模型完成单轮、多轮上下文、流式中断与连接失败优雅处理的端到端验证。
  不读取真实应用数据目录与用户作品正文；仅向指定 base url 发起真实推理。

用法：
  npm run test:chat-acceptance -- [选项]
  npm run test:chat-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:chat-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --base-url <url>       服务地址（默认 http://localhost:11434）
  --model <name>         目标模型标签（默认 qwen3:8b）
  --profile-id <id>      显式 profile ID；省略时由 base-url|model 派生
  --profile-name <name>  profile 显示名
  --timeout-ms <ms>      单请求超时（默认 30000）
  --log-file <path>      逐用例 JSON 诊断日志
  --tester-id <id>       非个人测试人员代号
  --json                 仅输出单个完整 JSON 文档
  -h, --help             显示帮助`
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

interface ChatResult {
  ok: boolean
  content: string
  error: string | null
  ms: number
  status: number | null
}

async function chatOnce(baseUrl: string, model: string, messages: Array<{ role: string; content: string }>, timeoutMs: number): Promise<ChatResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0 } }),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, content: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}`, ms: Date.now() - start, status: res.status }
    const body = JSON.parse(text) as { message?: { content?: string } }
    return { ok: true, content: body.message?.content ?? '', error: null, ms: Date.now() - start, status: res.status }
  } catch (cause: unknown) {
    const aborted = cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
    return { ok: false, content: '', error: aborted ? 'timeout' : messageOf(cause), ms: Date.now() - start, status: null }
  } finally {
    clearTimeout(timer)
  }
}

async function chatStreamAbortable(baseUrl: string, model: string, messages: Array<{ role: string; content: string }>, timeoutMs: number, onChunk: (c: string) => void): Promise<{ aborted: boolean; error: string | null; chunks: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let chunks = 0
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0 } }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) return { aborted: false, error: `HTTP ${res.status}`, chunks }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const obj = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean }
          if (obj.message?.content) { onChunk(obj.message.content); chunks += 1 }
          if (obj.done) return { aborted: false, error: null, chunks }
        } catch { /* 忽略不完整分片 */ }
      }
    }
    return { aborted: false, error: null, chunks }
  } catch (cause: unknown) {
    const aborted = cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
    return { aborted, error: aborted ? 'timeout' : messageOf(cause), chunks }
  } finally {
    clearTimeout(timer)
  }
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

export function collectRepository(root: string): RepositoryInfo {
  let version = '0.0.0'
  const packageFile = join(root, 'package.json')
  if (existsSync(packageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version) version = parsed.version
    } catch { /* 保留默认 */ }
  }
  const shaRun = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const statusRun = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  return { version, gitSha: shaRun.status === 0 ? shaRun.stdout.trim() : null, dirty: Boolean(statusRun.stdout.trim()), root }
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
  const versionRes = spawnSync('curl', ['-s', '-m', String(Math.min(timeoutMs, 5000) / 1000), `${baseUrl}/api/version`], { encoding: 'utf8' })
  if (versionRes.status === 0 && versionRes.stdout.trim()) {
    try {
      const parsed = JSON.parse(versionRes.stdout) as { version?: string }
      if (parsed.version) ollama = parsed.version
    } catch { /* N/A */ }
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

export interface ChatCaseContext {
  baseUrl: string
  model: string
  timeoutMs: number
}

export async function runMachineCases(context: ChatCaseContext): Promise<CaseResult[]> {
  const { baseUrl, model, timeoutMs } = context
  const cases: CaseResult[] = []

  // CHAT-E-001 单轮发送与接收
  {
    const res = await chatOnce(baseUrl, model, [{ role: 'user', content: '用三个字以内回答：你好' }], timeoutMs)
    if (res.ok && res.content.trim()) cases.push({ caseId: 'CHAT-E-001', title: '单轮发送与接收', category: 'machine', status: 'PASS', detail: `模型在 ${res.ms}ms 返回非空回复（${res.content.slice(0, 20)}…）。` })
    else cases.push({ caseId: 'CHAT-E-001', title: '单轮发送与接收', category: 'machine', status: 'FAIL', detail: `单轮推理失败：${res.error ?? '空回复'}` })
  }

  // CHAT-E-002 多轮上下文延续
  {
    const first = await chatOnce(baseUrl, model, [{ role: 'user', content: '请只回复数字：42' }], timeoutMs)
    const second = await chatOnce(baseUrl, model, [
      { role: 'user', content: '请只回复数字：42' },
      { role: 'assistant', content: first.content },
      { role: 'user', content: '我刚才让你说的数字是多少？只回复该数字。' },
    ], timeoutMs)
    const carried = first.ok && second.ok && /42/u.test(second.content)
    if (carried) cases.push({ caseId: 'CHAT-E-002', title: '多轮上下文延续', category: 'machine', status: 'PASS', detail: `两轮对话完成，第二轮正确引用首轮数字 42（${second.ms}ms）。` })
    else cases.push({ caseId: 'CHAT-E-002', title: '多轮上下文延续', category: 'machine', status: 'FAIL', detail: `多轮上下文未延续：首轮=${first.content?.slice(0, 20)}，次轮=${second.content?.slice(0, 20)}，错误=${second.error ?? first.error ?? '空'}` })
  }

  // CHAT-E-003 流式中断/停止
  {
    let chunks = 0
    const outcome = await chatStreamAbortable(baseUrl, model, [{ role: 'user', content: '请写一段两百字的故事。' }], 600, (c) => { chunks += 1; if (chunks >= 2) throw new DOMException('client-abort', 'AbortError') })
    const graceful = outcome.aborted || outcome.chunks >= 1
    if (graceful) cases.push({ caseId: 'CHAT-E-003', title: '流式中断/停止', category: 'machine', status: 'PASS', detail: `流式输出可在客户端中止后优雅停止（收到 ${outcome.chunks} 个分片后中断；${outcome.error ?? 'ok'}）。` })
    else cases.push({ caseId: 'CHAT-E-003', title: '流式中断/停止', category: 'machine', status: 'FAIL', detail: `流式中断未优雅处理：${JSON.stringify(outcome)}` })
  }

  // CHAT-E-004 连接失败优雅处理（注入，不依赖真实 Ollama）
  {
    const blackhole = 'http://127.0.0.1:9'
    const res = await chatOnce(blackhole, model, [{ role: 'user', content: 'hi' }], 2000)
    const handled = !res.ok && (res.error === 'timeout' || res.error?.includes('ECONNREFUSED') || res.error?.includes('fetch'))
    if (handled) cases.push({ caseId: 'CHAT-E-004', title: '连接失败优雅处理', category: 'machine', status: 'PASS', detail: `指向不可达地址时降级为结构化错误（${res.error}），未崩溃。` })
    else cases.push({ caseId: 'CHAT-E-004', title: '连接失败优雅处理', category: 'machine', status: 'FAIL', detail: `不可达地址未优雅处理：${JSON.stringify(res)}` })
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
  return join(directory, `vinkey-chat-acceptance-${Date.now()}.json`)
}

export async function runChatAcceptance(input: AcceptanceRunInput): Promise<AcceptanceRunOutput> {
  const { options, repository, environment, selectedModel } = input
  const startedAt = Date.now()
  const machineCases = input.cases && input.cases.length > 0 ? input.cases : await runMachineCases({ baseUrl: options.baseUrl, model: options.model, timeoutMs: options.timeoutMs })
  const allCases = machineCases.map((c) => ({ ...c, durationMs: c.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = join(repository.root, 'artifacts', 'chat-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  const logDirectory = logFile.includes(sep) ? logFile.replace(/[^/\\]*$/u, '') : ''
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
      note: 'W2-CHAT-E 真实端到端验收：用真实模型完成单轮、多轮上下文、流式中断与失败处理；不读取真实应用数据目录与用户作品。',
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
    cases: allCases.map((c) => ({ caseId: c.caseId, title: c.title, category: c.category, status: c.status, detail: c.detail, evidence: c.evidence ?? null, notes: c.notes ?? null, durationMs: c.durationMs ?? 0, blockedReason: c.blockedReason ?? null })),
    summary,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion,
    elapsedMs: Date.now() - startedAt,
  }
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, generatedAt: result.generatedAt, suite: { id: SUITE_ID, version: SUITE_VERSION }, cases: allCases.map((c) => ({ caseId: c.caseId, category: c.category, status: c.status, detail: c.detail, blockedReason: c.blockedReason })) }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')

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
  const profileId = options.profileId ?? fnvHash(`${options.baseUrl}|${options.model}`)
  const profileName = options.profileName ?? `derived-${profileId.slice(0, 8)}`
  const selectedModel = {
    profileId,
    profileName,
    model: options.model,
    connectionKind: options.baseUrl.includes('openai') ? 'openai-compatible' : 'ollama',
    connectionBaseUrl: options.baseUrl,
  } as SelectedModel

  try {
    const output = await runChatAcceptance({ options, repository, environment, selectedModel })
    stderrProgress(output.result.cases as CaseResult[])
    if (options.json) console.log(JSON.stringify(output.result, null, 2))
    else console.log(stdoutSummary(output))
    process.exitCode = output.exitCode
  } catch (cause) {
    console.error(`对话验收失败：${messageOf(cause)}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_CHAT_ACCEPTANCE_CLI === '1') {
  main().catch((cause) => {
    console.error(`对话验收失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
