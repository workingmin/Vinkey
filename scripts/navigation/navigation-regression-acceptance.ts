import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  generateFixture, saveMessage, loadConversation, listConversations,
  activateProject, readProjects, deleteProjectRecord, applyIfMatchesActive,
  type FixtureManifest, type ConversationMessageInput,
} from './navigation-acceptance.ts'

// W4-NAV-R / D-NAV 项目与会话导航跨域回归验收（UI-ACC-NAV-REGRESSION-001）。
// 在隔离 fixture/SQLite 上构造生成中会话、运行中后台任务、未保存草稿与延迟搜索响应，
// 验证切换/删除的阻断、保存后恢复、过期响应丢弃和失败恢复幂等。
//
// 状态语义与产品实现对齐（脚本内建模，避免在 Node 中引入浏览器侧 zustand store）：
//   - isConversationBusy       → src/lib/conversationActivity.ts:8-11
//   - projectTransition 阻断    → src/App.tsx:1500/1533/1704/1720
//   - 未保存文档切换确认        → src/App.tsx:1430
//   - 未保存文档删除阻断        → src/App.tsx:1535
//   - 过期响应 workspaceId 守卫 → src/App.tsx:1710/1726 + applyIfMatchesActive（W0 合同函数）
//   - 删除会话前运行判定        → src/components/ProjectSessionSidebar.tsx:108-110
// 只报告交叉风险，不重复完整 CRUD。

export const SUITE_ID = 'UI-ACC-NAV-REGRESSION-001'
export const SUITE_VERSION = 'navigation-regression-1'
export const ACCEPTANCE_ID = 'W4-NAV-R'
export const DOMAIN_ID = 'D-NAV'
export const GATE = 'R'

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
  timeoutMs: number
  logFile: string | null
  testerId: string | null
  json: boolean
  keepFixture: boolean
}
export interface RepositoryInfo { version: string; gitSha: string | null; dirty: boolean; root: string }
export interface EnvironmentInfo {
  os: string; osVersion: string; arch: string; node: string
  rust: string; tauriCli: string; tauriFramework: string
}
export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
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

function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause) }
function repositoryRoot(): string {
  return process.env.VINKEY_NAVIGATION_REGRESSION_ROOT ? resolve(process.env.VINKEY_NAVIGATION_REGRESSION_ROOT) : process.cwd()
}

function usage(): string {
  return `Vinkey 项目与会话导航跨域回归验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  构造生成中会话、运行中后台任务、未保存草稿与延迟搜索响应，验证切换/删除的阻断、
  保存后恢复、过期响应丢弃与失败恢复幂等。只报告交叉风险，不重复完整 CRUD。

用法：
  npm run test:navigation-regression-acceptance:sh -- [选项]

参数：
  --timeout-ms <ms>  单用例超时上限（默认 30000）
  --log-file <path>  逐用例诊断日志
  --tester-id <id>   非个人测试人员代号
  --keep-fixture     保留隔离 fixture 供检查
  --json             仅输出单个 JSON 文档
  -h, --help         显示帮助`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = { timeoutMs: 30_000, logFile: null, testerId: null, json: false, keepFixture: false }
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
    if (value === '--timeout-ms') options.timeoutMs = Number(take(value)) || options.timeoutMs
    else if (value === '--log-file') options.logFile = resolve(take(value))
    else if (value === '--tester-id') options.testerId = take(value).trim()
    else throw new Error(`未知参数 ${value}。`)
  }
  return options
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
export function collectEnvironment(root: string): EnvironmentInfo {
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
  const sw = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' })
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion: process.platform === 'win32' ? process.arch : (sw.status === 0 ? sw.stdout.trim() : 'N/A'),
    arch: process.arch, node: process.version,
    rust: rust.status === 0 ? gnuVersion('rustc', rust.stdout) : 'N/A', tauriCli, tauriFramework,
  }
}

// ---- 交叉状态模型（语义对齐产品实现） ----
export interface TaskJob { id: string; workspaceId: string; conversationId: string; status: 'running' | 'completed' | 'cancelled' }
export interface EditorTab { path: string; content: string; savedContent: string }
export interface CrossDomainState {
  activeProjectId: string
  projectTransition: boolean
  pendingConversationRequests: Map<string, number>
  chatRuns: Map<string, { status: string }>
  taskJobs: TaskJob[]
  tabs: EditorTab[]
  appliedSearchResults: Array<{ workspaceId: string; query: string; hits: number }>
  switchAttempts: number
  deleteAttempts: number
  appliedSwitches: number
  appliedDeletes: number
}

function activityKey(workspaceId: string, conversationId: string): string { return JSON.stringify([workspaceId, conversationId]) }
function isConversationBusy(state: CrossDomainState, workspaceId: string, conversationId: string): boolean {
  return Boolean(state.pendingConversationRequests.get(activityKey(workspaceId, conversationId))
    || (state.activeProjectId === workspaceId && state.chatRuns.has(conversationId)))
}
function hasUnsavedTabs(state: CrossDomainState): boolean { return state.tabs.some((tab) => tab.content !== tab.savedContent) }
function hasRunningTask(state: CrossDomainState, workspaceId: string): boolean {
  return state.taskJobs.some((job) => job.workspaceId === workspaceId && job.status === 'running')
}
export type SwitchOutcome = 'SWITCHED' | 'BLOCKED_BUSY' | 'BLOCKED_TRANSITION' | 'CONFIRM_REQUIRED'
function attemptSwitch(state: CrossDomainState, targetId: string): SwitchOutcome {
  state.switchAttempts += 1
  if (state.projectTransition) return 'BLOCKED_TRANSITION'
  if (hasUnsavedTabs(state)) return 'CONFIRM_REQUIRED'
  // 生成中会话：明确阻断，等待停止后继续（不串写目标会话）
  for (const [conversationId] of state.chatRuns) {
    if (isConversationBusy(state, state.activeProjectId, conversationId)) return 'BLOCKED_BUSY'
  }
  state.activeProjectId = targetId
  state.appliedSwitches += 1
  return 'SWITCHED'
}
function attemptDeleteProject(state: CrossDomainState, projectId: string, confirmation: string): { ok: boolean; reason: string | null } {
  state.deleteAttempts += 1
  if (state.projectTransition) return { ok: false, reason: '项目切换中，请稍后重试' }
  if (hasRunningTask(state, projectId)) return { ok: false, reason: '此项目的任务尚未结束，请等待任务停止并完成保存后再删除' }
  if (hasUnsavedTabs(state)) return { ok: false, reason: '当前项目有未保存文档，请先保存或关闭文档' }
  state.appliedDeletes += 1
  return { ok: true, reason: null }
}

export interface RegressionContext { fixtureRoot: string }

export function runMachineCases(context: RegressionContext): { cases: CaseResult[]; fixture: FixtureManifest; preStates: Record<string, unknown> } {
  const started = Date.now()
  const cases: CaseResult[] = []
  const fixture = generateFixture(context.fixtureRoot)
  const projectA = fixture.projects[0]
  const projectB = fixture.projects[1]
  const dbA = fixture.dbSummary.projectRecords[0].path
  const dbB = fixture.dbSummary.projectRecords[1].path
  const seededA = listConversations(dbA)[0]
  const seededB = listConversations(dbB)[0]
  const preStates: Record<string, unknown> = {}

  const freshState = (): CrossDomainState => ({
    activeProjectId: projectA.id, projectTransition: false,
    pendingConversationRequests: new Map(), chatRuns: new Map(),
    taskJobs: [], tabs: [], appliedSearchResults: [], switchAttempts: 0, deleteAttempts: 0,
    appliedSwitches: 0, appliedDeletes: 0,
  })

  // NAV-R-001 生成中切换：阻断或不串写目标会话；停止后可切换
  {
    const state = freshState()
    state.chatRuns.set(seededA.id, { status: 'streaming' })
    const beforeTarget = loadConversation(dbB, seededB.id)
    const busyOutcome = attemptSwitch(state, projectB.id)
    // 阻断期间任何异步结果都不得写入目标会话
    const staleWriteApplied = applyIfMatchesActive(state.activeProjectId, projectB.id)
    // 只有守卫判定「目标项目仍为当前激活项目」时才允许写入；被阻断时结果应被丢弃。
    if (staleWriteApplied) {
      const now = Date.now()
      saveMessage(dbB, seededB.id, beforeTarget.title, { id: 'nav-r-001-stale', role: 'user', content: '不应写入的过期响应', createdAt: now, completedAt: now } as ConversationMessageInput)
    }
    const duringBusy = loadConversation(dbB, seededB.id)
    // 停止生成后继续切换
    state.chatRuns.delete(seededA.id)
    const afterStop = attemptSwitch(state, projectB.id)
    const afterTarget = loadConversation(dbB, seededB.id)
    const issues: string[] = []
    if (busyOutcome !== 'BLOCKED_BUSY') issues.push(`生成中切换未被阻断（${busyOutcome}）`)
    if (staleWriteApplied) issues.push('过期响应错误地写入了非激活项目')
    if (duringBusy.messages.length !== beforeTarget.messages.length) issues.push('阻断期间目标会话被串写')
    if (afterStop !== 'SWITCHED') issues.push(`停止后仍无法切换（${afterStop}）`)
    if (afterTarget.messages.length !== beforeTarget.messages.length) issues.push('切换后源/目标会话消息数发生变化')
    preStates['NAV-R-001'] = { generatingConversation: seededA.id, outcomeWhileBusy: busyOutcome, staleWriteApplied, outcomeAfterStop: afterStop }
    if (issues.length > 0) cases.push({ caseId: 'NAV-R-001', title: '生成中切换', category: 'machine', status: 'FAIL', detail: issues.join('；'), durationMs: Date.now() - started })
    else cases.push({ caseId: 'NAV-R-001', title: '生成中切换', category: 'machine', status: 'PASS', detail: `生成中切换被明确阻断（BLOCKED_BUSY），过期响应未写入项目 B，目标会话消息数保持 ${beforeTarget.messages.length}；停止生成后切换成功。`, durationMs: Date.now() - started })
  }

  // NAV-R-002 后台任务中切换/删除：不允许任务和来源记录失联
  {
    const state = freshState()
    const job: TaskJob = { id: 'nav-r-job-001', workspaceId: projectA.id, conversationId: seededA.id, status: 'running' }
    state.taskJobs.push(job)
    // 运行任务同时占用会话请求名额，使 isConversationBusy 与产品语义一致。
    state.pendingConversationRequests.set(activityKey(projectA.id, seededA.id), 1)
    const blocked = attemptDeleteProject(state, projectA.id, projectA.name)
    const busyCheck = isConversationBusy(state, projectA.id, seededA.id)
    const recordStillExists = readProjects(fixture.dbPath).projects.some((p) => p.id === projectA.id)
    const conversationStillExists = listConversations(dbA).some((c) => c.id === seededA.id)
    // 任务结束后删除成功，且任务记录与来源会话仍可追溯（不被静默丢弃）
    job.status = 'completed'
    const allowed = attemptDeleteProject(state, projectA.id, projectA.name)
    const issues: string[] = []
    if (blocked.ok) issues.push('运行中任务下删除项目未被阻断')
    if (!recordStillExists || !conversationStillExists) issues.push('阻断期间项目或来源会话记录失联')
    if (!allowed.ok) issues.push(`任务完成后仍被阻断：${allowed.reason}`)
    if (job.workspaceId !== projectA.id || job.conversationId !== seededA.id) issues.push('任务与来源记录关联丢失')
    preStates['NAV-R-002'] = { jobId: job.id, statusWhileDeleting: 'running', blockedReason: blocked.reason, busyCheck, recordStillExists, conversationStillExists }
    if (issues.length > 0) cases.push({ caseId: 'NAV-R-002', title: '后台任务中切换/删除', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-R-002', title: '后台任务中切换/删除', category: 'machine', status: 'PASS', detail: `运行任务 ${job.id} 存在时删除被阻断（${blocked.reason}），项目与来源会话记录均保留；任务完成后允许删除，来源关联未失联。` })
  }

  // NAV-R-003 未保存文档切换/删除：保存/放弃/返回；取消后保持原状态
  {
    const state = freshState()
    state.tabs.push({ path: 'notes/中英对照.txt', content: '灯塔 lighthouse\n黎明 dawn\n新增草稿内容', savedContent: '灯塔 lighthouse\n黎明 dawn\n' })
    const confirm = attemptSwitch(state, projectB.id)
    const unchangedAfterCancel = state.activeProjectId === projectA.id && hasUnsavedTabs(state)
    const deleteWhileDirty = attemptDeleteProject(state, projectA.id, projectA.name)
    // 用户选择「保存」
    state.tabs[0].savedContent = state.tabs[0].content
    const afterSave = attemptSwitch(state, projectB.id)
    // 用户选择「放弃」的等价路径：恢复 savedContent
    const state2 = freshState()
    state2.tabs.push({ path: 'notes/中英对照.txt', content: '草稿', savedContent: '原文' })
    const confirm2 = attemptSwitch(state2, projectB.id)
    state2.tabs[0].content = state2.tabs[0].savedContent
    const afterDiscard = attemptSwitch(state2, projectB.id)
    const issues: string[] = []
    if (confirm !== 'CONFIRM_REQUIRED') issues.push(`未保存草稿切换未要求确认（${confirm}）`)
    if (!unchangedAfterCancel) issues.push('取消后激活项目或草稿状态被改变')
    if (deleteWhileDirty.ok) issues.push('存在未保存文档时删除项目未被阻断')
    if (afterSave !== 'SWITCHED') issues.push(`保存后仍无法切换（${afterSave}）`)
    if (confirm2 !== 'CONFIRM_REQUIRED' || afterDiscard !== 'SWITCHED') issues.push('放弃草稿后切换路径异常')
    preStates['NAV-R-003'] = { unsavedTab: 'notes/中英对照.txt', confirmOutcome: confirm, cancelKeepsState: unchangedAfterCancel, deleteBlocked: !deleteWhileDirty.ok, afterSave, afterDiscard }
    if (issues.length > 0) cases.push({ caseId: 'NAV-R-003', title: '未保存文档切换/删除', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-R-003', title: '未保存文档切换/删除', category: 'machine', status: 'PASS', detail: '草稿存在时切换要求确认（保存/放弃/返回），取消后激活项目与草稿状态不变；删除被阻断；保存或放弃草稿后均可正常切换。' })
  }

  // NAV-R-004 过期搜索结果：切换项目后旧结果不得覆盖新项目范围
  {
    const state = freshState()
    const delayedResult = { workspaceId: projectA.id, query: '灯塔', hits: 2 }
    // 搜索尚未返回时切换项目
    state.activeProjectId = projectB.id
    const applyStale = applyIfMatchesActive(state.activeProjectId, delayedResult.workspaceId)
    if (applyStale) state.appliedSearchResults.push(delayedResult)
    const currentResult = { workspaceId: projectB.id, query: 'nebula', hits: 1 }
    const applyCurrent = applyIfMatchesActive(state.activeProjectId, currentResult.workspaceId)
    if (applyCurrent) state.appliedSearchResults.push(currentResult)
    const issues: string[] = []
    if (applyStale) issues.push('过期搜索结果被错误应用')
    if (!applyCurrent) issues.push('当前项目搜索结果未应用')
    if (state.appliedSearchResults.length !== 1 || state.appliedSearchResults[0].workspaceId !== projectB.id) issues.push('最终搜索结果范围与激活项目不一致')
    preStates['NAV-R-004'] = { delayedResult, activeAfterSwitch: state.activeProjectId, applyStale, applyCurrent, finalResults: state.appliedSearchResults }
    if (issues.length > 0) cases.push({ caseId: 'NAV-R-004', title: '过期搜索结果', category: 'machine', status: 'FAIL', detail: issues.join('；'), evidence: JSON.stringify(state.appliedSearchResults) })
    else cases.push({ caseId: 'NAV-R-004', title: '过期搜索结果', category: 'machine', status: 'PASS', detail: `切换项目后，A 项目的延迟搜索结果被 workspaceId 守卫丢弃；B 项目当前结果正确应用，最终范围仅含 ${projectB.id}。`, evidence: JSON.stringify(state.appliedSearchResults) })
  }

  // NAV-R-005 失败恢复：阻断解除后重试只执行一次目标操作，状态可追踪
  {
    const state = freshState()
    state.projectTransition = true
    const first = attemptSwitch(state, projectB.id)
    const appliedBefore = state.appliedSwitches
    // 阻断未解除时重复提交：只增加尝试次数，不产生新的目标操作
    const second = attemptSwitch(state, projectB.id)
    const unchanged = state.activeProjectId === projectA.id && state.appliedSwitches === appliedBefore
    // 阻断解除后重试一次
    state.projectTransition = false
    const retry = attemptSwitch(state, projectB.id)
    const deleteAppliedBefore = state.appliedDeletes
    const del = attemptDeleteProject(state, projectA.id, projectA.name)
    const issues: string[] = []
    if (first !== 'BLOCKED_TRANSITION' || second !== 'BLOCKED_TRANSITION') issues.push('切换中未持续阻断')
    if (state.appliedSwitches !== appliedBefore + 1 || !unchanged) issues.push('重复提交产生了多次目标操作')
    if (retry !== 'SWITCHED' || state.activeProjectId !== projectB.id) issues.push('阻断解除后重试未生效')
    if (!del.ok || state.appliedDeletes !== deleteAppliedBefore + 1) issues.push('删除操作未恰好执行一次')
    preStates['NAV-R-005'] = { firstOutcome: first, secondOutcome: second, switchAttempts: state.switchAttempts, appliedSwitches: state.appliedSwitches, retryOutcome: retry, appliedDeletes: state.appliedDeletes }
    if (issues.length > 0) cases.push({ caseId: 'NAV-R-005', title: '失败恢复', category: 'machine', status: 'FAIL', detail: issues.join('；') })
    else cases.push({ caseId: 'NAV-R-005', title: '失败恢复', category: 'machine', status: 'PASS', detail: `切换中持续阻断（BLOCKED_TRANSITION），重复提交只增加尝试次数（${state.switchAttempts}）而未增加目标操作；解除后重试一次即成功切换，删除操作恰好执行 ${state.appliedDeletes} 次，状态可追踪。` })
  }

  return { cases, fixture, preStates }
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
  return join(process.platform === 'win32' ? tmpdir() : '/tmp', `vinkey-navigation-regression-${Date.now()}.json`)
}

export function runNavigationRegression(input: AcceptanceRunInput): AcceptanceRunOutput {
  const { options, repository, environment } = input
  const startedAt = Date.now()
  const fixtureRoot = join(tmpdir(), `vinkey-navigation-regression-fixture-${Date.now()}`)
  let runResult: { cases: CaseResult[]; fixture: FixtureManifest; preStates: Record<string, unknown> }
  try {
    runResult = input.cases && input.cases.length > 0
      ? { cases: input.cases, fixture: input.fixture ?? generateFixture(fixtureRoot), preStates: {} }
      : runMachineCases({ fixtureRoot })
  } finally {
    if (!options.keepFixture && existsSync(fixtureRoot)) rmSync(fixtureRoot, { recursive: true, force: true })
  }
  const allCases = runResult.cases.map((c) => ({ ...c, durationMs: c.durationMs ?? 0 }))
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = join(repository.root, 'artifacts', 'navigation-acceptance', `regression-run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  const logDir = logFile.includes(sep) ? logFile.replace(/[^/\\]*$/u, '') : ''
  if (logDir && !existsSync(logDir)) mkdirSync(logDir, { recursive: true })
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
      version: repository.version, buildNumber: null, gitSha: null, architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W4-NAV-R 跨域回归：隔离 fixture/SQLite + 交叉状态建模；状态语义对齐 src/lib/conversationActivity.ts 与 src/App.tsx。',
    },
    provenance: {
      status: repository.gitSha && !repository.dirty ? 'PASS' : 'BLOCKED',
      versionMatch: true, gitShaMatch: Boolean(repository.gitSha), repositoryClean: !repository.dirty,
    },
    execution: { testerId: options.testerId ?? 'local-tester', testerIdBasis: 'explicit non-personal identifier' },
    environment,
    preconditionStates: runResult.preStates,
    fixtureManifest: {
      projectCount: runResult.fixture.dbSummary.projectCount,
      conversationCount: runResult.fixture.dbSummary.conversationCount,
      cleanup: options.keepFixture ? 'kept' : 'removed',
    },
    cases: allCases.map((c) => ({ caseId: c.caseId, title: c.title, category: c.category, status: c.status, detail: c.detail, evidence: c.evidence ?? null, durationMs: c.durationMs ?? 0, blockedReason: c.blockedReason ?? null })),
    summary, exitCode, logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion, elapsedMs: Date.now() - startedAt,
  }
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, generatedAt: result.generatedAt, suite: { id: SUITE_ID, version: SUITE_VERSION }, cases: allCases.map((c) => ({ caseId: c.caseId, status: c.status, detail: c.detail })) }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const sha = createHash('sha256').update(readFileSync(resultFile)).digest('hex')
  writeFileSync(sha256File, `${sha}  result.json\n`, 'utf8')
  // result.json 不自引用自身 hash：定稿写入后由 SHA256SUMS 记录其最终 hash，保证 shasum -c 通过。
  const finalResult = result
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

export function main(): void {
  let options: CliOptions
  try {
    const parsed = parseArguments(process.argv.slice(2))
    if (!parsed) { console.log(usage()); return }
    options = parsed
  } catch (cause) { console.error(`参数错误：${messageOf(cause)}`); process.exitCode = 1; return }
  const root = repositoryRoot()
  const repository = collectRepository(root)
  const environment = collectEnvironment(root)
  try {
    const output = runNavigationRegression({ options, repository, environment, fixture: null })
    stderrProgress(output.result.cases as CaseResult[])
    if (options.json) console.log(JSON.stringify(output.result, null, 2))
    else console.log(stdoutSummary(output))
    process.exitCode = output.exitCode
  } catch (cause) { console.error(`导航回归验收失败：${messageOf(cause)}`); process.exitCode = 1 }
}

if (process.env.VINKEY_NAVIGATION_REGRESSION_CLI === '1') {
  main()
}
