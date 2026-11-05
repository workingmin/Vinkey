import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import {
  LEGACY_GLOBAL_MENU_LABELS,
  MACOS_TITLE_BAR_MENU_LABELS,
  TITLE_BAR_MENU_CONTRACT_VERSION,
  TITLE_BAR_MENU_ITEM_LABELS,
  TITLE_BAR_MENU_LABELS,
  TITLE_BAR_MENU_ORDER,
  WINDOWS_TITLE_BAR_MENU_LABELS,
} from '../../src/lib/titleBarMenu'

// W0-SHELL-MENU-F / D-SHELL 标题栏与功能菜单 fixture 业务链路验收脚本
// （UI-ACC-TITLE-BAR-FIXTURE-001）。
// 在隔离临时目录中生成项目/会话/草稿文档 fixture，并从源码合同与 WebView 组件两个层面
// 验证菜单动作到页面/设置/编辑焦点与状态保持链路，不调用 Ollama，不读写真实应用数据目录。
// macOS 原生菜单树、交通灯与系统窗口证据仍属于 W0-SHELL-MENU-P 的测试人员桌面执行范围。

export const SUITE_ID = 'UI-ACC-TITLE-BAR-FIXTURE-001'
export const SUITE_VERSION = 'title-bar-acceptance-1'
export const ACCEPTANCE_ID = 'W0-SHELL-MENU-F'
export const DOMAIN_ID = 'D-SHELL'
export const GATE = 'F'

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
  workspace: string | null
  outputDir: string | null
  logFile: string | null
  testerId: string | null
  json: boolean
  keepFixture: boolean
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
}

export interface FixtureFileSummary {
  name: string
  relativePath: string
  sha256: string
}

export interface FixtureConversationSummary {
  id: string
  title: string
  messageCount: number
}

export interface FixtureProjectSummary {
  id: string
  name: string
  root: string
  files: FixtureFileSummary[]
  conversations: FixtureConversationSummary[]
}

export interface FixtureManifest {
  fixtureRoot: string
  created: boolean
  dbPath: string
  projectRecordsDir: string
  workspaceRoot: string
  projects: FixtureProjectSummary[]
  draftRelativePath: string
  draftSha256: string
  cleanup: 'removed' | 'kept' | 'caller-owned'
}

export interface ProjectRow {
  id: string
  name: string
  root: string
  openedAt: number
}

export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  fixture: FixtureManifest
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
  const fromEnvironment = process.env.VINKEY_TITLE_BAR_ACCEPTANCE_ROOT
  if (fromEnvironment) return resolve(fromEnvironment)
  return process.cwd()
}

function usage(): string {
  return `Vinkey 标题栏与功能菜单 fixture 业务链路验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  在隔离临时目录生成一个已登记项目和草稿文档 fixture，只读核查项目菜单（添加/刷新）、
  会话菜单（新建会话）、查看页面切换、编辑焦点命令分派与设置进入/返回的状态保持合同。
  不调用 Ollama，不读写真实应用数据目录与用户作品目录。macOS 原生菜单仍需桌面专项执行。

用法：
  npm run test:title-bar-acceptance -- [选项]
  npm run test:title-bar-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:title-bar-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --workspace <dir>   指定 fixture 根目录；省略时在系统临时目录生成（运行后自动清理，
                      加 --keep-fixture 可保留用于检查）
  --output <dir>      结果归档目录（result.json、SHA256SUMS）；默认 artifacts/title-bar-acceptance/run-<时间戳>/
  --log-file <path>   写入逐用例 JSON 诊断日志；未指定时写入系统临时目录
  --tester-id <id>    非个人标识的测试人员代号（用于 execution.testerId）
  --keep-fixture      运行结束后保留自动生成的 fixture（默认自动清理）
  --json              输出完整机器可读 JSON（stdout 只有单个 JSON 文档）
  -h, --help          显示帮助

环境变量：
  VINKEY_TITLE_BAR_ACCEPTANCE_ROOT  仓库根目录（由包装脚本注入，一般无需手工设置）

说明：
  - 机器证据覆盖 F 子集：项目添加/刷新、新建会话、查看页面切换、编辑焦点分派、设置进入/返回。
  - 目标平台原生菜单树（macOS AXMenuItem）与交通灯/系统窗口动作属于 W0-SHELL-MENU-P，
    不在此脚本结论范围内，测试人员仍需在 macOS 15+ 桌面执行专项脚本与回传。`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    workspace: null,
    outputDir: null,
    logFile: null,
    testerId: null,
    json: false,
    keepFixture: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    if (value === '--keep-fixture') { options.keepFixture = true; continue }
    if (value === '--workspace' || value === '--output' || value === '--log-file' || value === '--tester-id') {
      const argument = values[index + 1]
      if (!argument) throw new Error(`参数 ${value} 缺少值。`)
      index += 1
      if (value === '--workspace') options.workspace = resolve(argument)
      if (value === '--output') options.outputDir = resolve(argument)
      if (value === '--log-file') options.logFile = resolve(argument)
      if (value === '--tester-id') options.testerId = argument.trim()
      continue
    }
    throw new Error(`未知参数 ${value}。`)
  }
  if (options.testerId && !/^[A-Za-z0-9._-]{1,64}$/u.test(options.testerId)) {
    throw new Error('--tester-id 仅允许 1-64 个字母、数字、点、下划线或连字符。')
  }
  return options
}

function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function runCommand(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; code: number | null } {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 })
    return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim(), code: result.status }
  } catch {
    return { ok: false, stdout: '', stderr: '', code: null }
  }
}

export function collectRepository(root: string): RepositoryInfo {
  let version = '0.0.0'
  const packageFile = join(root, 'package.json')
  if (existsSync(packageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version) version = parsed.version
    } catch {
      // 读取失败时保留默认版本，仍可给出可读错误提示
    }
  }
  const shaRun = runCommand('git', ['-C', root, 'rev-parse', 'HEAD'])
  const statusRun = runCommand('git', ['-C', root, 'status', '--porcelain'])
  return { version, gitSha: shaRun.ok ? shaRun.stdout : null, dirty: Boolean(statusRun.stdout), root }
}

export function collectEnvironment(root: string): EnvironmentInfo {
  const packageFile = join(root, 'package.json')
  let tauriCli = 'N/A'
  try {
    const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { devDependencies?: Record<string, string> }
    tauriCli = parsed.devDependencies?.['@tauri-apps/cli'] ?? 'N/A'
  } catch {
    tauriCli = 'N/A'
  }
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
  const rust = runCommand('rustc', ['--version'])
  let osVersion = 'N/A'
  if (process.platform === 'win32') osVersion = process.arch
  else {
    const swVers = runCommand('sw_vers', ['-productVersion'])
    if (swVers.ok) osVersion = swVers.stdout
  }
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion,
    arch: process.arch,
    node: process.version,
    rust: rust.ok ? (rust.stdout.match(/rustc[\s/]([0-9]+\.[0-9]+(?:\.[0-9]+)?)/u)?.[1] ?? rust.stdout.split(/\s+/u)[1] ?? rust.stdout) : 'N/A',
    tauriCli,
    tauriFramework,
  }
}

// 与导航脚本一致的稳定项目 ID 合同：规范化 root 路径的 FNV-1a 16 位十六进制 ID。
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n

export function projectIdOf(root: string): string {
  const normalized = resolve(root)
  let hash = FNV_OFFSET
  for (const character of normalized) {
    hash ^= BigInt(character.codePointAt(0)!)
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

const PROJECT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, name TEXT NOT NULL, opened_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_selection (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), active_id TEXT);
  INSERT OR IGNORE INTO project_selection (singleton, active_id) VALUES (1, NULL);
`

const CONVERSATION_SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    activity_log TEXT,
    task_ref TEXT,
    run_result TEXT
  );
  CREATE INDEX IF NOT EXISTS messages_conversation_id ON messages(conversation_id, created_at);
`

export function createProjectsDatabase(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true })
  const database = new DatabaseSync(dbPath)
  try {
    database.exec(PROJECT_SCHEMA)
  } finally {
    database.close()
  }
}

export function openConversationDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path)
  database.exec(CONVERSATION_SCHEMA)
  return database
}

export function createConversationDatabase(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const database = openConversationDatabase(path)
  database.close()
}

export function readProjects(dbPath: string): { projects: ProjectRow[]; activeId: string | null } {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const projects = database.prepare('SELECT id, name, root, opened_at AS openedAt FROM projects ORDER BY opened_at DESC, id')
      .all().map((row) => row as unknown as ProjectRow)
    const active = database.prepare('SELECT active_id AS activeId FROM project_selection WHERE singleton = 1').get() as { activeId: string | null } | undefined
    return { projects, activeId: active?.activeId ?? null }
  } finally {
    database.close()
  }
}

export function projectCount(dbPath: string): number {
  return readProjects(dbPath).projects.length
}

export function registerProject(dbPath: string, root: string): { id: string; name: string; root: string } {
  const id = projectIdOf(root)
  const name = root.split(sep).filter(Boolean).at(-1) ?? root
  const database = new DatabaseSync(dbPath)
  try {
    database.exec('PRAGMA foreign_keys = ON;')
    database.prepare(
      'INSERT INTO projects (id, root, name, opened_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, opened_at=excluded.opened_at',
    ).run(id, root, name, Date.now())
    database.prepare('UPDATE project_selection SET active_id = ? WHERE singleton = 1').run(id)
  } finally {
    database.close()
  }
  return { id, name, root }
}

export function saveMessage(dbPath: string, conversationId: string, conversationTitle: string, message: {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  completedAt?: number | null
}): void {
  const database = openConversationDatabase(dbPath)
  try {
    const updatedAt = message.completedAt ?? message.createdAt
    database.prepare(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=?',
    ).run(conversationId, conversationTitle, message.createdAt, updatedAt, updatedAt)
    database.prepare(
      'INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(message.id, conversationId, message.role, message.content, message.createdAt, message.completedAt ?? null)
  } finally {
    database.close()
  }
}

export function listConversations(dbPath: string): Array<{ id: string; title: string; updatedAt: number; messageCount: number }> {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare(
      'SELECT c.id, c.title, c.updated_at AS updatedAt, COUNT(m.id) AS messageCount FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id GROUP BY c.id ORDER BY c.updated_at DESC',
    ).all().map((row) => row as unknown as { id: string; title: string; updatedAt: number; messageCount: number })
  } finally {
    database.close()
  }
}

export function messageCountFor(dbPath: string, conversationId: string): number {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const row = database.prepare('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?').get(conversationId) as { count: number }
    return Number(row.count)
  } finally {
    database.close()
  }
}

function writeFixture(root: string): void {
  const workspaceRoot = join(root, 'workspace')
  mkdirSync(join(workspaceRoot, 'docs'), { recursive: true })
  writeFileSync(join(workspaceRoot, 'draft.md'), '# 未保存草稿\n\n这段文字必须在刷新项目后原样保留。\n', 'utf8')
  writeFileSync(join(workspaceRoot, 'docs', '第1章.md'), '# 第一章\n\n灯塔在黎明前亮起。\n', 'utf8')
}

function fixtureFiles(workspaceRoot: string): FixtureFileSummary[] {
  const specs = [
    'draft.md',
    join('docs', '第1章.md'),
  ]
  return specs.map((relativePath) => ({
    name: relativePath.split('/').at(-1) ?? relativePath,
    relativePath,
    sha256: sha256OfFile(join(workspaceRoot, relativePath)),
  }))
}

export function generateFixture(fixtureRoot: string): FixtureManifest {
  mkdirSync(fixtureRoot, { recursive: true })
  const workspaceRoot = join(fixtureRoot, 'workspace')
  writeFixture(fixtureRoot)
  const dbPath = join(fixtureRoot, 'app-data', 'vinkey.sqlite3')
  const projectRecordsDir = join(fixtureRoot, 'app-data', 'project-records')
  createProjectsDatabase(dbPath)
  const { id } = registerProject(dbPath, workspaceRoot)
  const recordPath = join(projectRecordsDir, `${id}.sqlite3`)
  createConversationDatabase(recordPath)
  const now = Date.now()
  saveMessage(recordPath, 'tb-c1', '主题讨论', { id: 'tb-m1', role: 'user', content: '如何布置这个世界观？', createdAt: now })
  saveMessage(recordPath, 'tb-c1', '主题讨论', { id: 'tb-m2', role: 'assistant', content: '以海港为空间锚点，冲突围绕灯塔展开。', createdAt: now + 1, completedAt: now + 1 })
  saveMessage(recordPath, 'tb-c2', '备用会话', { id: 'tb-m3', role: 'user', content: '保留这个会话用于刷新断言。', createdAt: now + 2 })

  const conversations = listConversations(recordPath)
  const files = fixtureFiles(workspaceRoot)
  const draft = files.find((file) => file.relativePath === 'draft.md')!
  return {
    fixtureRoot,
    created: true,
    dbPath,
    projectRecordsDir,
    workspaceRoot,
    projects: [{ id, name: 'workspace', root: workspaceRoot, files, conversations }],
    draftRelativePath: draft.relativePath,
    draftSha256: draft.sha256,
    cleanup: 'caller-owned',
  }
}

function defineGlobal(name: string, value: unknown): void {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true })
  } catch {
    ;(globalThis as unknown as Record<string, unknown>)[name] = value
  }
}

function ensureClipboard(): void {
  const nav = globalThis.navigator as Navigator & { clipboard?: { writeText: (text: string) => Promise<void>; readText: () => Promise<string> } }
  if (!nav.clipboard) {
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => undefined,
        readText: async () => 'clipboard-paste',
      },
    })
  }
}

function loadJsdom(): { JSDOM: new (...args: unknown[]) => { window: Window & typeof globalThis } } | null {
  try {
    const requireNode = createRequire(join(repositoryRoot(), 'package.json'))
    return requireNode('jsdom') as { JSDOM: new (...args: unknown[]) => { window: Window & typeof globalThis } }
  } catch {
    return null
  }
}

export function installDomHarness(): void {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    ensureClipboard()
    return
  }
  const jsdom = loadJsdom()
  if (!jsdom) throw new Error('未找到 jsdom 依赖，请先执行 npm install --include=dev。')
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  Object.defineProperty(dom.window.navigator, 'platform', { configurable: true, value: 'Win32' })
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => undefined, readText: async () => 'clipboard-paste' },
  })
  defineGlobal('window', dom.window)
  defineGlobal('document', dom.window.document)
  defineGlobal('navigator', dom.window.navigator)
  defineGlobal('localStorage', dom.window.localStorage)
  defineGlobal('HTMLElement', dom.window.HTMLElement)
  defineGlobal('HTMLInputElement', dom.window.HTMLInputElement)
  defineGlobal('HTMLTextAreaElement', dom.window.HTMLTextAreaElement)
  defineGlobal('Element', dom.window.Element)
  defineGlobal('Node', dom.window.Node)
  defineGlobal('Event', dom.window.Event)
  defineGlobal('CustomEvent', dom.window.CustomEvent)
  defineGlobal('MouseEvent', dom.window.MouseEvent)
  defineGlobal('FocusEvent', dom.window.FocusEvent)
  defineGlobal('KeyboardEvent', dom.window.KeyboardEvent)
  defineGlobal('InputEvent', dom.window.InputEvent)
  defineGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
  defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window))
}

function passCase(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'PASS', detail }
}

function failCase(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'FAIL', detail }
}

function idle(milliseconds = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

interface TitleBarCaseContext {
  dbPath: string
  fixture: FixtureManifest
}

async function runMachineCases(context: TitleBarCaseContext): Promise<CaseResult[]> {
  installDomHarness()
  const { useAppStore } = await import('../../src/store.ts')
  const editCommands = await import('../../src/lib/editCommands.ts')
  const { createRoot } = await import('react-dom/client')
  const React = await import('react')
  const { TitleBar } = await import('../../src/App.tsx')
  const cases: CaseResult[] = []
  const { dbPath, fixture } = context
  const project = fixture.projects[0]!
  const recordPath = join(fixture.projectRecordsDir, `${project.id}.sqlite3`)

  // TB-MENU-001 一级菜单树合同（P 子集结构守卫：F 子集执行前先证明目标菜单不会退回旧文件菜单）
  {
    const issues: string[] = []
    if (TITLE_BAR_MENU_ORDER.join(',') !== 'project,conversation,edit,view,window,help') issues.push('Windows 菜单顺序不符合目标合同')
    if (WINDOWS_TITLE_BAR_MENU_LABELS.join(',') !== '项目,会话,编辑,查看,窗口,帮助') issues.push('Windows 标签不符合目标合同')
    if (MACOS_TITLE_BAR_MENU_LABELS.join(',') !== 'Vinkey,项目,会话,编辑,查看,窗口,帮助') issues.push('macOS 标签不符合目标合同')
    if (WINDOWS_TITLE_BAR_MENU_LABELS.includes('文件')) issues.push('一级菜单出现旧“文件”')
    if (!TITLE_BAR_MENU_CONTRACT_VERSION.includes('project-conversation')) issues.push('菜单合同版本未标记目标对象')
    if (!LEGACY_GLOBAL_MENU_LABELS.includes('新建文档…') || !LEGACY_GLOBAL_MENU_LABELS.includes('保存文档')) issues.push('旧菜单禁用文案缺失')
    cases.push(issues.length > 0
      ? failCase('TB-MENU-001', '一级菜单树合同（目标对象/顺序/无文件）', issues.join('；'))
      : passCase('TB-MENU-001', '一级菜单树合同（目标对象/顺序/无文件）', 'Windows 顺序与 macOS“Vinkey/项目/会话/编辑/查看/窗口/帮助”一致；无全局“文件”；旧菜单文案被禁用。'))
  }

  // TB-MENU-002 项目菜单 fixture（添加/刷新）：重复添加去重，刷新不清除会话与草稿
  {
    const issues: string[] = []
    const before = projectCount(dbPath)
    const reRegistered = registerProject(dbPath, fixture.workspaceRoot)
    if (reRegistered.id !== project.id) issues.push('重复添加同一目录产生不同项目 ID')
    if (projectCount(dbPath) !== before) issues.push(`重复添加产生新记录：${before} -> ${projectCount(dbPath)}`)
    const conversationsBefore = listConversations(recordPath)
    const draftBefore = sha256OfFile(join(fixture.workspaceRoot, fixture.draftRelativePath))
    const refreshed = registerProject(dbPath, fixture.workspaceRoot)
    if (refreshed.id !== project.id || projectCount(dbPath) !== before) issues.push('刷新项目改变了记录或数量')
    const conversationsAfter = listConversations(recordPath)
    const draftAfter = sha256OfFile(join(fixture.workspaceRoot, fixture.draftRelativePath))
    if (JSON.stringify(conversationsBefore) !== JSON.stringify(conversationsAfter)) issues.push('刷新项目清除了会话或更改了会话内容')
    if (draftBefore !== draftAfter) issues.push('刷新项目改变了草稿文件内容')
    cases.push(issues.length > 0
      ? failCase('TB-MENU-002', '项目菜单 fixture（添加/刷新/去重与状态保持）', issues.join('；'))
      : passCase('TB-MENU-002', '项目菜单 fixture（添加/刷新/去重与状态保持）', `重复添加同一目录保持 ${before} 条记录；刷新后 ${conversationsAfter.length} 个会话与草稿 SHA-256 原样保留。`))
  }

  // TB-MENU-003 会话菜单 fixture（新建会话）：组件点击关闭菜单并回调；store 新会话保持项目并清空会话状态
  {
    const issues: string[] = []
    const workspaceSnapshot = { id: project.id, name: project.name, displayName: 'workspace', pathLabel: project.root } as unknown as NonNullable<ReturnType<typeof useAppStore.getState>['workspace']>
    useAppStore.setState({
      workspace: workspaceSnapshot,
      conversationId: 'tb-active',
      conversationTitle: '旧标题',
      messages: [{ id: 'old', role: 'user', content: '旧消息', createdAt: Date.now() }],
      error: null,
    })
    useAppStore.getState().newConversation()
    const state = useAppStore.getState()
    if (state.workspace?.id !== project.id) issues.push('新建会话丢失当前项目')
    if (state.conversationId !== null) issues.push('新建会话未清空活动会话 ID')
    if (state.conversationTitle !== '新会话') issues.push('新建会话未恢复“新会话”标题')
    if (state.messages.length !== 0) issues.push('新建会话未清空消息')

    const container = document.createElement('div')
    document.body.append(container)
    let called = 0
    const root = createRoot(container)
    const callbacks = {
      onPageChange: () => undefined,
      onOpenWorkspace: () => undefined,
      onNewConversation: () => { called += 1 },
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => undefined,
      onShowAbout: () => undefined,
      onShowWindowDiagnostics: () => undefined,
      onShowRuntimeDiagnostics: () => undefined,
    }
    root.render(React.createElement(TitleBar, callbacks))
    await idle()
    const trigger = container.querySelector('[data-testid="title-bar-menu-conversation"]') as HTMLButtonElement | null
    if (!trigger) issues.push('未找到会话菜单触发器')
    else {
      trigger.click()
      await idle()
      const item = Array.from(container.querySelectorAll('[data-menu-item-id="newConversation"]')).find((element) => element instanceof HTMLElement && !(element as HTMLButtonElement).disabled) as HTMLButtonElement | undefined
      if (!item) issues.push('会话菜单缺少“新建会话”项')
      else {
        item.click()
        await idle()
        if (called !== 1) issues.push(`“新建会话”回调次数异常：${called}`)
        const openMenu = container.querySelector('[role="menu"]')
        if (openMenu) issues.push('“新建会话”后菜单未关闭')
      }
    }
    root.unmount()
    container.remove()
    cases.push(issues.length > 0
      ? failCase('TB-MENU-003', '会话菜单 fixture（新建会话到对话状态）', issues.join('；'))
      : passCase('TB-MENU-003', '会话菜单 fixture（新建会话到对话状态）', '点击“新建会话”回调一次并关闭菜单；store 保持活动项目同时清空会话与消息。'))
  }

  // TB-MENU-004 编辑焦点分派（标准输入控件 + CodeMirror 桥接 + 无目标禁用）
  {
    const issues: string[] = []
    const input = document.createElement('input')
    input.value = 'first'
    document.body.append(input)
    editCommands.rememberEditTarget(input)
    input.value = 'second'
    input.setSelectionRange(6, 6)
    editCommands.recordEditTarget(input)
    if (!(await editCommands.executeEditCommand(input, 'undo')) || input.value !== 'first') issues.push('撤销未生效')
    if (!(await editCommands.executeEditCommand(input, 'redo')) || input.value !== 'second') issues.push('重做未生效')

    input.value = 'hello world'
    editCommands.rememberEditTarget(input)
    input.setSelectionRange(0, 5)
    if (!(await editCommands.executeEditCommand(input, 'copy'))) issues.push('复制未生效')
    if (!(await editCommands.executeEditCommand(input, 'cut')) || input.value !== ' world') issues.push('剪切未生效')
    if (!(await editCommands.executeEditCommand(input, 'paste')) || input.value !== 'clipboard-paste world') issues.push('粘贴未生效')
    if (!(await editCommands.executeEditCommand(input, 'selectAll')) || [input.selectionStart, input.selectionEnd].join(',') !== `0,${input.value.length}`) issues.push('全选未生效')

    const editor = document.createElement('div')
    editor.className = 'code-editor'
    editor.dataset.editable = 'true'
    editor.dataset.canUndo = 'true'
    editor.dataset.hasSelection = 'true'
    editor.dataset.hasContent = 'true'
    document.body.append(editor)
    const received: string[] = []
    editor.addEventListener(editCommands.EDIT_COMMAND_EVENT, (event) => {
      received.push((event as CustomEvent<{ command: string }>).detail.command)
      event.preventDefault()
    })
    if (!(await editCommands.executeEditCommand(editor, 'undo'))) issues.push('CodeMirror 撤销桥接失败')
    if (!(await editCommands.executeEditCommand(editor, 'cut'))) issues.push('CodeMirror 剪切桥接失败')
    if (received.join(',') !== 'undo,cut') issues.push('CodeMirror 命令桥接顺序错误')
    if (await editCommands.executeEditCommand(null, 'undo')) issues.push('无编辑目标时未禁用命令')
    input.remove()
    editor.remove()
    cases.push(issues.length > 0
      ? failCase('TB-MENU-004', '编辑焦点分派（撤销/重做/剪切/复制/粘贴/全选）', issues.join('；'))
      : passCase('TB-MENU-004', '编辑焦点分派（撤销/重做/剪切/复制/粘贴/全选）', '标准输入控件六项命令与 CodeMirror 事件桥接正确；无编辑目标时返回 false/禁用。'))
  }

  // TB-MENU-005 查看页面切换（三个页面按序回调且不包含设置）
  {
    const issues: string[] = []
    const container = document.createElement('div')
    document.body.append(container)
    const pages: string[] = []
    const root = createRoot(container)
    const tick = () => idle()
    root.render(React.createElement(TitleBar, {
      onPageChange: (page: string) => pages.push(page),
      onOpenWorkspace: () => undefined,
      onNewConversation: () => undefined,
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => undefined,
      onShowAbout: () => undefined,
      onShowWindowDiagnostics: () => undefined,
      onShowRuntimeDiagnostics: () => undefined,
    }))
    await tick()
    const viewTrigger = container.querySelector('[data-testid="title-bar-menu-view"]') as HTMLButtonElement | null
    if (!viewTrigger) issues.push('未找到查看菜单触发器')
    else {
      viewTrigger.click()
      await tick()
      const menu = container.querySelector('[role="menu"]')
      if (!menu) issues.push('查看菜单未展开')
      else {
        const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => (item as HTMLElement).textContent?.trim() ?? '')
        if (labels.includes('设置…') || labels.includes('模型与应用设置')) issues.push('设置仍出现在查看菜单')
        viewTrigger.click()
        await tick()
        for (const itemId of ['chat', 'files', 'logs'] as const) {
          viewTrigger.click()
          await tick()
          const item = container.querySelector(`[data-menu-item-id="${itemId}"]`) as HTMLButtonElement | null
          if (!item) { issues.push(`查看菜单缺少页面项：${itemId}`); continue }
          item.click()
          await tick()
        }
        if (pages.join(',') !== 'chat,file,logs') issues.push(`页面切换回调错误：${pages.join(',')}`)
      }
    }
    root.unmount()
    container.remove()
    cases.push(issues.length > 0
      ? failCase('TB-MENU-005', '查看页面切换（对话/文件/日志，设置不在查看）', issues.join('；'))
      : passCase('TB-MENU-005', '查看页面切换（对话/文件/日志，设置不在查看）', '查看菜单依次回调对话工作台、项目文件、任务与日志；设置不在查看菜单。'))
  }

  // TB-MENU-007 设置进入/返回的壳层状态与业务状态保持
  {
    const issues: string[] = []
    const workspaceSnapshot = { id: project.id, name: project.name, displayName: 'workspace', pathLabel: project.root } as unknown as NonNullable<ReturnType<typeof useAppStore.getState>['workspace']>
    const messages = [{ id: 'keep', role: 'user', content: '设置返回后应保留', createdAt: Date.now() }]
    useAppStore.setState({
      workspace: workspaceSnapshot,
      messages,
      conversationId: 'keep-conversation',
      conversationTitle: '保留会话',
      settingsOpen: false,
      sidebarCollapsed: false,
      settingsSidebarBeforeOpen: null,
    })
    useAppStore.getState().setSettingsOpen(true)
    const openState = useAppStore.getState()
    if (!openState.settingsOpen) issues.push('打开设置未设置 settingsOpen')
    if (!openState.sidebarCollapsed) issues.push('打开设置未折叠侧栏')
    useAppStore.getState().setSettingsOpen(false)
    const closedState = useAppStore.getState()
    if (closedState.settingsOpen) issues.push('返回后设置仍打开')
    if (closedState.sidebarCollapsed) issues.push('返回后未恢复打开设置前的侧栏状态')
    if (closedState.settingsSidebarBeforeOpen !== null) issues.push('返回后未清理侧栏快照')
    if (closedState.workspace?.id !== project.id) issues.push('设置进入/返回丢失项目状态')
    if (closedState.conversationId !== 'keep-conversation' || closedState.messages.length !== 1) issues.push('设置进入/返回丢失会话状态')
    cases.push(issues.length > 0
      ? failCase('TB-MENU-007', '设置进入/返回（壳层与业务状态保持）', issues.join('；'))
      : passCase('TB-MENU-007', '设置进入/返回（壳层与业务状态保持）', '打开设置折叠侧栏并记录返回点；返回恢复侧栏且项目/会话/消息状态不变。'))
  }

  return cases
}

function summarizeCases(cases: CaseResult[]): { caseCount: number; passed: number; failed: number; blocked: number } {
  return {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
  }
}

function computeConclusion(cases: CaseResult[]): CaseStatus {
  const summary = summarizeCases(cases)
  if (summary.failed > 0) return 'FAIL'
  if (summary.blocked > 0) return 'BLOCKED'
  return 'PASS'
}

function defaultLogFile(): string {
  const directory = process.platform === 'win32' ? tmpdir() : '/tmp'
  return join(directory, `vinkey-title-bar-acceptance-${Date.now()}.json`)
}

export async function runTitleBarAcceptance(input: AcceptanceRunInput): Promise<AcceptanceRunOutput> {
  const { options, repository, environment, fixture, cases } = input
  const startedAt = Date.now()
  const machineCases = cases && cases.length > 0 ? cases : await runMachineCases({ dbPath: fixture.dbPath, fixture })
  const allCases = machineCases.map((item) => ({ ...item, durationMs: item.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = options.outputDir ?? join(repository.root, 'artifacts', 'title-bar-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  const logDirectory = dirname(logFile)
  if (logDirectory && !existsSync(logDirectory)) throw new Error(`--log-file 父目录不存在：${logDirectory}`)

  const summary = summarizeCases(allCases)
  const conclusion = computeConclusion(allCases)
  const exitCode = conclusion === 'FAIL' ? 2 : 0

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
      note: 'W0-SHELL-MENU-F fixture/合同验收：使用隔离临时目录与测试数据库，不读写真实应用数据目录与用户作品目录；macOS 原生菜单证据属于 W0-SHELL-MENU-P。',
    },
    provenance: {
      status: repository.gitSha && !repository.dirty ? 'PASS' : 'BLOCKED',
      versionMatch: true,
      gitShaMatch: Boolean(repository.gitSha),
      repositoryClean: !repository.dirty,
    },
    execution: {
      testerId: options.testerId ?? 'local-tester',
      testerIdBasis: 'explicit non-personal identifier',
    },
    environment,
    fixtureManifest: fixture,
    cases: allCases.map((item) => ({
      caseId: item.caseId,
      title: item.title,
      category: item.category,
      status: item.status,
      detail: item.detail,
      evidence: item.evidence ?? null,
      notes: item.notes ?? null,
      durationMs: item.durationMs ?? 0,
      blockedReason: item.blockedReason ?? null,
    })),
    summary,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion,
    elapsedMs: Date.now() - startedAt,
  }

  writeFileSync(logFile, JSON.stringify({
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    cases: allCases.map((item) => ({
      caseId: item.caseId, category: item.category, status: item.status, detail: item.detail, blockedReason: item.blockedReason,
    })),
  }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')

  const shaEntries: Array<{ file: string; hash: string }> = [{ file: 'result.json', hash: sha256OfFile(resultFile) }]
  writeFileSync(sha256File, `${shaEntries.map((entry) => `${entry.hash}  ${entry.file}`).join('\n')}\n`, 'utf8')
  const finalResult = {
    ...result,
    artifacts: { ...result.artifacts, sha256: Object.fromEntries(shaEntries.map((entry) => [entry.file, entry.hash])) },
  }
  writeFileSync(resultFile, JSON.stringify(finalResult, null, 2), 'utf8')

  return { result: finalResult, conclusion, exitCode, outputDir, resultFile, sha256File, logFile }
}

function stdoutSummary(output: AcceptanceRunOutput): string {
  const summary = output.result.summary as { caseCount: number; passed: number; failed: number; blocked: number }
  return [
    `${SUITE_ID} acceptance: ${output.conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked)`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.exitCode}`,
  ].join('\n')
}

function stderrProgress(cases: CaseResult[]): void {
  for (const item of cases) {
    const suffix = item.status === 'BLOCKED' && item.blockedReason ? `（${item.blockedReason}）` : ''
    console.error(`[${item.caseId}] ${item.status} ${item.title}${suffix}`)
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

  let fixtureRoot: string | null = null
  let autoGenerated = false
  try {
    const root = repositoryRoot()
    const repository = collectRepository(root)
    const environment = collectEnvironment(root)

    if (options.workspace) {
      fixtureRoot = options.workspace
    } else {
      fixtureRoot = join(tmpdir(), `vinkey-title-bar-fixture-${Date.now()}`)
      autoGenerated = true
    }
    const fixture = generateFixture(fixtureRoot)
    fixture.cleanup = autoGenerated ? (options.keepFixture ? 'kept' : 'removed') : 'caller-owned'

    let completed = false
    try {
      const output = await runTitleBarAcceptance({ options, repository, environment, fixture })
      stderrProgress(output.result.cases as CaseResult[])
      if (options.json) {
        console.log(JSON.stringify(output.result, null, 2))
      } else {
        console.log(stdoutSummary(output))
      }
      process.exitCode = output.exitCode
      completed = true
    } finally {
      if (completed && autoGenerated && !options.keepFixture) {
        try {
          rmSync(fixtureRoot, { recursive: true, force: true })
        } catch {
          // 清理失败不改变验收结论；fixture 路径已记录在 result.json
        }
      }
    }
  } catch (cause) {
    console.error(`标题栏菜单 fixture 验收失败：${messageOf(cause)}${fixtureRoot ? `（fixture：${fixtureRoot}）` : ''}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_TITLE_BAR_ACCEPTANCE_CLI === '1') {
  main().catch((cause) => {
    console.error(`标题栏菜单 fixture 验收失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
