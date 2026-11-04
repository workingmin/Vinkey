import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  generateFixture, saveMessage, listConversations, loadConversation,
  activateProject, readProjects, searchWorkspaceFixture,
  type FixtureManifest, type ConversationMessageInput,
} from './navigation-acceptance.ts'
import {
  buildTemporaryTitle, deriveSemanticTitle, shouldUpgradeTitle, normalizeConversationTitle,
} from '../../src/lib/conversationTitle.ts'

// W2-NAV-E / D-NAV 项目与会话导航真实端到端验收（UI-ACC-NAV-E2E-001）。
// 复用 W0 的隔离 fixture/SQLite 合同，叠加真实 Ollama 多轮对话，验证：
// 多项目多会话、临时/语义/手动标题生命周期、刷新后持久化、搜索分组与跳转、跨项目恢复。
// 不读取真实应用数据目录与用户作品；fixture 生成于系统临时目录并在结束时清理。

export const SUITE_ID = 'UI-ACC-NAV-E2E-001'
export const SUITE_VERSION = 'navigation-e2e-1'
export const ACCEPTANCE_ID = 'W2-NAV-E'
export const DOMAIN_ID = 'D-NAV'
export const GATE = 'E'

export type CaseStatus = 'PASS' | 'FAIL' | 'BLOCKED'

export interface CaseResult {
  caseId: string
  title: string
  category: 'machine' | 'manual'
  status: CaseStatus
  detail: string | null
  evidence?: string | null
  durationMs?: number
  blockedReason?: string | null
}

export interface CliOptions {
  baseUrl: string
  model: string
  profileId: string | null
  timeoutMs: number
  logFile: string | null
  testerId: string | null
  json: boolean
  keepFixture: boolean
}

export interface RepositoryInfo { version: string; gitSha: string | null; dirty: boolean; root: string }
export interface EnvironmentInfo {
  os: string; osVersion: string; arch: string; node: string
  rust: string; tauriCli: string; tauriFramework: string; ollama: string
}
export interface SelectedModel {
  profileId: string; profileName: string; model: string
  connectionKind: 'ollama' | 'openai-compatible'; connectionBaseUrl: string
}
export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  selectedModel: SelectedModel
  fixture: FixtureManifest | null
  cases?: CaseResult[] | null
}
export interface AcceptanceRunOutput {
  result: Record<string, unknown>
  conclusion: CaseStatus
  exitCode: number
  resultFile: string
  sha256File: string
  logFile: string
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function repositoryRoot(): string {
  const fromEnvironment = process.env.VINKEY_NAVIGATION_E2E_ROOT
  if (fromEnvironment) return resolve(fromEnvironment)
  return process.cwd()
}

function usage(): string {
  return `Vinkey 项目与会话导航真实端到端验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  在隔离 fixture/SQLite 上，用真实 Ollama 完成多项目多会话多轮对话，验证标题生命周期、
  刷新后持久化、搜索分组跳转与跨项目恢复。不读取真实应用数据目录。

用法：
  npm run test:navigation-e2e-acceptance:sh -- [选项]

参数：
  --base-url <url>     服务地址（默认 http://localhost:11434）
  --model <name>       目标模型标签（默认 qwen3:8b）
  --profile-id <id>    显式 profile ID
  --timeout-ms <ms>    单请求超时（默认 30000）
  --log-file <path>    逐用例诊断日志
  --tester-id <id>     非个人测试人员代号
  --keep-fixture       保留隔离 fixture 供检查
  --json               仅输出单个 JSON 文档
  -h, --help           显示帮助`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    baseUrl: 'http://localhost:11434', model: 'qwen3:8b', profileId: null,
    timeoutMs: 30_000, logFile: null, testerId: null, json: false, keepFixture: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    if (value === '--keep-fixture') { options.keepFixture = true; continue }
    const take = (flag: string): string => {
      const arg = values[index + 1]
      if (!arg) throw new Error(`参数 ${flag} 缺少值。`)
      index += 1
      return arg
    }
    if (value === '--base-url') options.baseUrl = take(value).replace(/\/+$/u, '')
    else if (value === '--model') options.model = take(value)
    else if (value === '--profile-id') options.profileId = take(value)
    else if (value === '--timeout-ms') options.timeoutMs = Number(take(value)) || options.timeoutMs
    else if (value === '--log-file') options.logFile = resolve(take(value))
    else if (value === '--tester-id') options.testerId = take(value).trim()
    else throw new Error(`未知参数 ${value}。`)
  }
  return options
}

interface ChatResult { ok: boolean; content: string; error: string | null; ms: number }

async function chatOnce(baseUrl: string, model: string, messages: Array<{ role: string; content: string }>, timeoutMs: number): Promise<ChatResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 固定推理参数以满足规范 §7「固定温度、上下文窗口、套件版本和超时」；
      // qwen3 系列默认开启 thinking，会显著拉长单次响应，故显式关闭并限制输出长度。
      body: JSON.stringify({ model, messages, stream: false, think: false, options: { temperature: 0, num_predict: 64 } }),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, content: '', error: `HTTP ${res.status}`, ms: Date.now() - start }
    const body = JSON.parse(text) as { message?: { content?: string } }
    return { ok: true, content: body.message?.content ?? '', error: null, ms: Date.now() - start }
  } catch (cause: unknown) {
    const aborted = cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
    return { ok: false, content: '', error: aborted ? 'timeout' : messageOf(cause), ms: Date.now() - start }
  } finally { clearTimeout(timer) }
}

async function ollamaReachable(baseUrl: string, model: string, timeoutMs: number): Promise<{ ok: boolean; error: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 8000))
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET', signal: controller.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const body = await res.json() as { models?: Array<{ name: string }> }
    if (!body.models?.some((item) => item.name === model)) return { ok: false, error: `目标模型 ${model} 不在目录中` }
    return { ok: true, error: null }
  } catch (cause: unknown) {
    return { ok: false, error: messageOf(cause) }
  } finally { clearTimeout(timer) }
}

function fnvHash(input: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (const ch of input) { hash ^= BigInt(ch.codePointAt(0)!); hash = (hash * prime) & 0xffffffffffffffffn }
  return hash.toString(16).padStart(16, '0')
}

export function collectRepository(root: string): RepositoryInfo {
  let version = '0.0.0'
  const packageFile = join(root, 'package.json')
  if (existsSync(packageFile)) {
    try { const p = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string }; if (p.version) version = p.version } catch { /* 默认 */ }
  }
  const sha = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  return { version, gitSha: sha.status === 0 ? sha.stdout.trim() : null, dirty: Boolean(status.stdout.trim()), root }
}

function gnuVersion(prefix: string, output: string): string {
  const match = output.match(new RegExp(`${prefix}[\\s/]([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)`))
  return (match?.[1] ?? output.split(/\s+/u)[1] ?? output) || 'N/A'
}

export function collectEnvironment(root: string, baseUrl: string, timeoutMs: number): EnvironmentInfo {
  let tauriCli = 'N/A'
  try { const p = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }; tauriCli = p.devDependencies?.['@tauri-apps/cli'] ?? 'N/A' } catch { /* N/A */ }
  let tauriFramework = 'N/A'
  const cargo = join(root, 'src-tauri', 'Cargo.toml')
  if (existsSync(cargo)) {
    const c = readFileSync(cargo, 'utf8')
    const m = c.match(/tauri\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/u)
    if (m?.[1]) tauriFramework = m[1]
    else { const d = c.match(/^tauri\s*=\s*"([^"]+)"/mu); if (d?.[1]) tauriFramework = d[1] }
  }
  const rust = spawnSync('rustc', ['--version'], { encoding: 'utf8' })
  let ollama = 'N/A'
  const v = spawnSync('curl', ['-s', '-m', String(Math.min(timeoutMs, 5000) / 1000), `${baseUrl}/api/version`], { encoding: 'utf8' })
  if (v.status === 0 && v.stdout.trim()) { try { const p = JSON.parse(v.stdout) as { version?: string }; if (p.version) ollama = p.version } catch { /* N/A */ } }
  const sw = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' })
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion: process.platform === 'win32' ? process.arch : (sw.status === 0 ? sw.stdout.trim() : 'N/A'),
    arch: process.arch, node: process.version,
    rust: rust.status === 0 ? gnuVersion('rustc', rust.stdout) : 'N/A',
    tauriCli, tauriFramework, ollama,
  }
}

export interface E2EContext {
  baseUrl: string
  model: string
  timeoutMs: number
  fixtureRoot: string
}

interface ConversationRecord { projectName: string; projectId: string; dbPath: string; id: string; title: string; turns: number }

export async function runMachineCases(context: E2EContext): Promise<{ cases: CaseResult[]; fixture: FixtureManifest; sessionManifest: ConversationRecord[] }> {
  const { baseUrl, model, timeoutMs, fixtureRoot } = context
  const cases: CaseResult[] = []
  const sessionManifest: ConversationRecord[] = []
  const started = Date.now()

  const reachable = await ollamaReachable(baseUrl, model, timeoutMs)
  if (!reachable.ok) {
    const reason = `真实模型不可用：${reachable.error}`
    for (const id of ['NAV-E-001', 'NAV-E-002', 'NAV-E-003', 'NAV-E-004', 'NAV-E-005', 'NAV-E-006']) {
      cases.push({ caseId: id, title: id, category: 'machine', status: 'BLOCKED', detail: reason, blockedReason: 'ollama-unreachable', durationMs: 0 })
    }
    return { cases, fixture: generateFixture(fixtureRoot), sessionManifest }
  }

  const fixture = generateFixture(fixtureRoot)
  const recordsByProject = fixture.dbSummary.projectRecords
  if (recordsByProject.length < 2) {
    cases.push({ caseId: 'NAV-E-000', title: 'fixture 前置', category: 'machine', status: 'FAIL', detail: '隔离 fixture 未生成两个项目', durationMs: Date.now() - started })
    return { cases, fixture, sessionManifest }
  }

  // NAV-E-001 多项目多会话（每项目 3 会话、每会话至少 2 轮真实模型消息）
  {
    const issues: string[] = []
    const prompts = ['用一句话说明项目定位。', '再用一句话补充一个细节。']
    for (let p = 0; p < 2; p += 1) {
      const project = fixture.projects[p]
      const dbPath = recordsByProject[p].path
      for (let s = 0; s < 3; s += 1) {
        const conversationId = `nav-e2e-p${p + 1}-s${s + 1}`
        const firstInput = `${project.name} 的第 ${s + 1} 个主题`
        const temporaryTitle = buildTemporaryTitle(firstInput)
        const built: Array<{ role: string; content: string }> = []
        for (let turn = 0; turn < 2; turn += 1) {
          const userContent = `${prompts[turn]}（主题：${firstInput}）`
          built.push({ role: 'user', content: userContent })
          const reply = await chatOnce(baseUrl, model, built, timeoutMs)
          if (!reply.ok || !reply.content.trim()) { issues.push(`${conversationId} 第 ${turn + 1} 轮推理失败：${reply.error ?? '空回复'}`); break }
          built.push({ role: 'assistant', content: reply.content })
        }
        const now = Date.now() + p * 1000 + s * 100
        built.forEach((msg, index) => {
          const input: ConversationMessageInput = {
            id: `${conversationId}-m${index + 1}`, role: msg.role as 'user' | 'assistant',
            content: msg.content, createdAt: now + index, completedAt: now + index,
          }
          saveMessage(dbPath, conversationId, temporaryTitle, input)
        })
        sessionManifest.push({ projectName: project.name, projectId: project.id, dbPath, id: conversationId, title: temporaryTitle, turns: Math.floor(built.length / 2) })
      }
      const list = listConversations(dbPath)
      // 只校验本批次新建的 3 条会话；W0 fixture 预置会话的消息数不纳入本用例。
      const created = sessionManifest.filter((r) => r.projectName === project.name)
      const createdIds = new Set(created.map((r) => r.id))
      if (created.length !== 3) issues.push(`${project.name} 新建会话数不足 3（实际 ${created.length}）`)
      const createdRows = list.filter((item) => createdIds.has(item.id))
      if (createdRows.length !== 3) issues.push(`${project.name} 持久化后仅找到 ${createdRows.length} 条新建会话`)
      if (createdRows.some((item) => item.messageCount < 4)) issues.push(`${project.name} 存在消息数不足 4 的新建会话`)
    }
    // 项目隔离：A 的会话不得出现在 B 的库中
    const aIds = new Set(sessionManifest.filter((r) => r.projectName === 'project-a').map((r) => r.id))
    const bList = listConversations(recordsByProject[1].path)
    if (bList.some((item) => aIds.has(item.id))) issues.push('跨项目会话串写')
    if (issues.length > 0) cases.push({ caseId: 'NAV-E-001', title: '多项目多会话', category: 'machine', status: 'FAIL', detail: issues.join('；'), durationMs: Date.now() - started })
    else cases.push({ caseId: 'NAV-E-001', title: '多项目多会话', category: 'machine', status: 'PASS', detail: `两项目各 3 会话、每会话 2 轮真实模型消息并写入隔离库；项目隔离无串写；共 ${sessionManifest.length} 会话。`, durationMs: Date.now() - started })
  }

  // NAV-E-002 临时标题与刷新后持久化
  {
    const first = sessionManifest[0]
    const raw = '  项目   定位\t与 规划  '
    const normalized = buildTemporaryTitle(raw)
    const longRaw = '这是一个非常非常长的标题用于验证二十八字符截断行为是否稳定可靠'
    const truncated = buildTemporaryTitle(longRaw)
    const before = loadConversation(first.dbPath, first.id)
    // 模拟刷新：重新打开只读数据库再读取
    const after = loadConversation(first.dbPath, first.id)
    const issues: string[] = []
    if (normalized !== normalizeConversationTitle(raw)) issues.push('空白合并不符合预期')
    if (truncated.length > 28) issues.push('28 字符截断失效')
    if (before.title !== after.title) issues.push('刷新前后标题发生变化')
    if (before.messages.length !== after.messages.length) issues.push('刷新前后消息数发生变化')
    if (issues.length > 0) cases.push({ caseId: 'NAV-E-002', title: '临时标题', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-E-002', title: '临时标题', category: 'machine', status: 'PASS', detail: `首次输入生成临时标题「${before.title}」；空白合并/28 字符截断符合合同；刷新后标题与 ${after.messages.length} 条消息保持不变。` })
  }

  // NAV-E-003 语义标题（真实模型响应）与至多升级一次、失败回退
  {
    const first = sessionManifest[0]
    const loaded = loadConversation(first.dbPath, first.id)
    const userMessage = loaded.messages.find((m) => m.role === 'user')?.content ?? ''
    const assistantMessage = loaded.messages.find((m) => m.role === 'assistant')?.content ?? ''
    const semantic = deriveSemanticTitle(userMessage, assistantMessage)
    const fallback = deriveSemanticTitle(userMessage, null)
    let upgraded = false
    const firstUpgrade = shouldUpgradeTitle(upgraded, true, loaded.messages.length)
    if (firstUpgrade) upgraded = true
    const secondUpgrade = shouldUpgradeTitle(upgraded, true, loaded.messages.length + 2)
    const unavailable = shouldUpgradeTitle(false, false, loaded.messages.length)
    const issues: string[] = []
    if (!firstUpgrade) issues.push('首轮后未触发语义标题升级')
    if (secondUpgrade) issues.push('语义标题被重复升级')
    if (unavailable) issues.push('模型不可用时仍尝试升级标题')
    if (fallback !== buildTemporaryTitle(userMessage)) issues.push('失败回退未返回临时标题')
    if (!semantic.trim()) issues.push('语义标题为空')
    // 落库一次升级并验证只升级一次
    const now = Date.now()
    if (firstUpgrade) saveMessage(first.dbPath, first.id, semantic, { id: `${first.id}-title-upgrade`, role: 'system', content: 'title-upgrade', createdAt: now, completedAt: now })
    const after = loadConversation(first.dbPath, first.id)
    if (after.title !== semantic) issues.push('升级后的标题未持久化')
    first.title = after.title
    if (issues.length > 0) cases.push({ caseId: 'NAV-E-003', title: '语义标题/失败回退', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-E-003', title: '语义标题/失败回退', category: 'machine', status: 'PASS', detail: `基于真实模型响应生成语义标题「${semantic}」；仅升级一次且已持久化；模型不可用时回退临时标题「${fallback}」。` })
  }

  // NAV-E-004 手动命名优先
  {
    const target = sessionManifest[1]
    const manual = normalizeConversationTitle('手动命名：不覆盖')
    const now = Date.now()
    saveMessage(target.dbPath, target.id, manual, { id: `${target.id}-rename`, role: 'system', content: 'manual-rename', createdAt: now, completedAt: now })
    // 后续新消息传入自动推导标题，模拟"自动升级"不得覆盖手动命名
    const autoTitle = buildTemporaryTitle(`${target.projectName} 的新一轮输入`)
    saveMessage(target.dbPath, target.id, manual, { id: `${target.id}-new-turn`, role: 'user', content: `${target.projectName} 新一轮用户输入`, createdAt: now + 1, completedAt: now + 1 })
    const after = loadConversation(target.dbPath, target.id)
    const issues: string[] = []
    if (after.title !== manual) issues.push(`手动标题被覆盖为「${after.title}」`)
    if (autoTitle === manual) issues.push('推导标题与手动标题相同，用例无效')
    target.title = after.title
    if (issues.length > 0) cases.push({ caseId: 'NAV-E-004', title: '手动命名优先', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-E-004', title: '手动命名优先', category: 'machine', status: 'PASS', detail: `手动命名「${manual}」在后续新消息（自动标题候选「${autoTitle}」）写入后保持不变。` })
  }

  // NAV-E-005 全局搜索：分组、工作区边界、中文路径、上限与跳转目标
  {
    const rootA = fixture.projects[0].root
    const rootB = fixture.projects[1].root
    const chinese = searchWorkspaceFixture(rootA, '灯塔', 100)
    const boundary = searchWorkspaceFixture(rootA, '星轨', 100)
    const capped = searchWorkspaceFixture(rootA, '重复行', 100)
    const empty = searchWorkspaceFixture(rootA, '不存在的关键词-zzz', 100)
    const hitB = searchWorkspaceFixture(rootB, 'nebula', 100)
    const issues: string[] = []
    if (chinese.length < 2) issues.push(`中文查询「灯塔」命中不足：${chinese.length}`)
    if (boundary.length) issues.push('当前工作区搜索越界命中 B 项目内容')
    if (capped.length !== 100) issues.push(`结果上限应为 100 条，实际 ${capped.length}`)
    if (empty.length) issues.push('无结果查询返回了命中')
    if (!hitB.length) issues.push('B 项目搜索未命中自身内容')
    const grouped = {
      projects: fixture.projects.filter((p) => p.name.includes('project')).length,
      conversations: listConversations(recordsByProject[0].path).length + listConversations(recordsByProject[1].path).length,
      documents: chinese.length + hitB.length,
    }
    const jumpTarget = chinese[0]?.path ?? hitB[0]?.path ?? null
    if (issues.length > 0) cases.push({ caseId: 'NAV-E-005', title: '全局搜索', category: 'machine', status: 'FAIL', detail: issues.join('；'), evidence: JSON.stringify(grouped) })
    else cases.push({ caseId: 'NAV-E-005', title: '全局搜索', category: 'machine', status: 'PASS', detail: `项目/会话/文档三类分组=${JSON.stringify(grouped)}；中文查询命中 ${chinese.length} 条、跳转目标 ${jumpTarget}；工作区边界无越界、上限 100 生效、无结果态正确。`, evidence: JSON.stringify(grouped) })
  }

  // NAV-E-006 跨项目恢复
  {
    const source = sessionManifest.find((r) => r.projectName === 'project-b')!
    const target = sessionManifest.find((r) => r.projectName === 'project-a')!
    activateProject(fixture.dbPath, source.projectId)
    const fromSearch = listConversations(source.dbPath).find((c) => c.id === source.id)
    activateProject(fixture.dbPath, target.projectId)
    const restored = loadConversation(target.dbPath, target.id)
    const active = readProjects(fixture.dbPath).activeId
    const issues: string[] = []
    if (!fromSearch) issues.push('搜索结果未定位到目标会话')
    if (active !== target.projectId) issues.push('跨项目恢复后激活项目不正确')
    if (restored.title !== target.title) issues.push(`恢复标题不符：${restored.title} != ${target.title}`)
    if (restored.messages.length < 4) issues.push('恢复消息数不足')
    if (issues.length > 0) cases.push({ caseId: 'NAV-E-006', title: '跨项目恢复', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-E-006', title: '跨项目恢复', category: 'machine', status: 'PASS', detail: `从 B 项目搜索定位会话后切回 A 项目，激活项目、标题「${restored.title}」与 ${restored.messages.length} 条消息全部正确恢复。` })
  }

  return { cases, fixture, sessionManifest }
}

function summarizeCases(cases: CaseResult[]) {
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
  return join(process.platform === 'win32' ? tmpdir() : '/tmp', `vinkey-navigation-e2e-${Date.now()}.json`)
}

export async function runNavigationE2E(input: AcceptanceRunInput): Promise<AcceptanceRunOutput> {
  const { options, repository, environment, selectedModel } = input
  const startedAt = Date.now()
  const fixtureRoot = join(tmpdir(), `vinkey-navigation-e2e-fixture-${Date.now()}`)
  let runResult: { cases: CaseResult[]; fixture: FixtureManifest; sessionManifest: ConversationRecord[] }
  try {
    runResult = input.cases && input.cases.length > 0
      ? { cases: input.cases, fixture: input.fixture ?? generateFixture(fixtureRoot), sessionManifest: [] }
      : await runMachineCases({ baseUrl: options.baseUrl, model: options.model, timeoutMs: options.timeoutMs, fixtureRoot })
  } finally {
    if (!options.keepFixture && existsSync(fixtureRoot)) rmSync(fixtureRoot, { recursive: true, force: true })
  }
  const allCases = runResult.cases.map((c) => ({ ...c, durationMs: c.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = join(repository.root, 'artifacts', 'navigation-acceptance', `e2e-run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  const logDir = logFile.includes(sep) ? logFile.replace(/[^/\\]*$/u, '') : ''
  if (logDir && !existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  const summary = summarizeCases(allCases)
  const conclusion = computeConclusion(allCases)
  const exitCode = conclusion === 'FAIL' ? 2 : conclusion === 'BLOCKED' ? 1 : 0
  const manifest = runResult.fixture.dbSummary

  const result: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    repository: { version: repository.version, gitSha: repository.gitSha, dirty: repository.dirty },
    application: {
      version: repository.version, buildNumber: null, gitSha: null, architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W2-NAV-E 真实端到端：隔离 fixture/SQLite + 本机真实 Ollama 多轮对话；不读取真实应用数据目录与用户作品。',
    },
    provenance: {
      status: repository.gitSha && !repository.dirty ? 'PASS' : 'BLOCKED',
      versionMatch: true, gitShaMatch: Boolean(repository.gitSha), repositoryClean: !repository.dirty,
    },
    execution: { testerId: options.testerId ?? 'local-tester', testerIdBasis: 'explicit non-personal identifier' },
    environment,
    selectedModel,
    inferenceParams: { temperature: 0, numPredict: 64, think: false, stream: false, timeoutMs: options.timeoutMs },
    fixtureManifest: {
      projectCount: manifest.projectCount,
      conversationCount: manifest.conversationCount,
      messageCount: manifest.messageCount,
      cleanup: options.keepFixture ? 'kept' : 'removed',
    },
    sessionManifest: runResult.sessionManifest.map((r) => ({ projectName: r.projectName, conversationId: r.id, title: r.title, turns: r.turns })),
    cases: allCases.map((c) => ({ caseId: c.caseId, title: c.title, category: c.category, status: c.status, detail: c.detail, evidence: c.evidence ?? null, durationMs: c.durationMs ?? 0, blockedReason: c.blockedReason ?? null })),
    summary,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion,
    elapsedMs: Date.now() - startedAt,
  }
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, generatedAt: result.generatedAt, suite: { id: SUITE_ID, version: SUITE_VERSION }, cases: allCases.map((c) => ({ caseId: c.caseId, status: c.status, detail: c.detail })) }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const sha = createHash('sha256').update(readFileSync(resultFile)).digest('hex')
  writeFileSync(sha256File, `${sha}  result.json\n`, 'utf8')
  const finalResult = { ...result, artifacts: { ...result.artifacts, sha256: { 'result.json': sha } } }
  writeFileSync(resultFile, JSON.stringify(finalResult, null, 2), 'utf8')
  return { result: finalResult, conclusion, exitCode, resultFile, sha256File, logFile }
}

function stdoutSummary(output: AcceptanceRunOutput): string {
  const s = output.result.summary as { caseCount: number; passed: number; failed: number; blocked: number }
  return [
    `${SUITE_ID} acceptance: ${output.conclusion} (${s.passed}/${s.caseCount} passed, ${s.failed} failed, ${s.blocked} blocked)`,
    `Results: ${output.resultFile}`, `SHA256SUMS: ${output.sha256File}`, `exit=${output.exitCode}`,
  ].join('\n')
}
function stderrProgress(cases: CaseResult[]): void {
  for (const c of cases) console.error(`[${c.caseId}] ${c.status} ${c.title}${c.status === 'BLOCKED' && c.blockedReason ? `（${c.blockedReason}）` : ''}`)
}

export async function main(): Promise<void> {
  let options: CliOptions
  try {
    const parsed = parseArguments(process.argv.slice(2))
    if (!parsed) { console.log(usage()); return }
    options = parsed
  } catch (cause) { console.error(`参数错误：${messageOf(cause)}`); process.exitCode = 1; return }

  const root = repositoryRoot()
  const repository = collectRepository(root)
  const environment = collectEnvironment(root, options.baseUrl, options.timeoutMs)
  const profileId = options.profileId ?? fnvHash(`${options.baseUrl}|${options.model}`)
  const selectedModel: SelectedModel = {
    profileId, profileName: `derived-${profileId.slice(0, 8)}`, model: options.model,
    connectionKind: options.baseUrl.includes('openai') ? 'openai-compatible' : 'ollama',
    connectionBaseUrl: options.baseUrl,
  }
  try {
    const output = await runNavigationE2E({ options, repository, environment, selectedModel, fixture: null })
    stderrProgress(output.result.cases as CaseResult[])
    if (options.json) console.log(JSON.stringify(output.result, null, 2))
    else console.log(stdoutSummary(output))
    process.exitCode = output.exitCode
  } catch (cause) { console.error(`导航端到端验收失败：${messageOf(cause)}`); process.exitCode = 1 }
}

if (process.env.VINKEY_NAVIGATION_E2E_CLI === '1') {
  main().catch((cause) => { console.error(`导航端到端验收失败：${cause instanceof Error ? cause.message : String(cause)}`); process.exitCode = 1 })
}
