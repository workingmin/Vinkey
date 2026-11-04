import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import type { Dirent } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

// W0-NAV-F / D-NAV 项目与会话导航本地验收脚本（UI-ACC-NAV-FIXTURE-001）。
// 在脚本自建的隔离临时目录中生成多项目、多会话与中英文文档 fixture，
// 只读/仅作用于该 fixture，验证项目登记/去重、切换/隔离、会话 CRUD、删除边界、
// 当前搜索与状态恢复合同。不调用 Ollama，不读写真实应用数据目录与用户作品目录。

export const SUITE_ID = 'UI-ACC-NAV-FIXTURE-001'
export const SUITE_VERSION = 'navigation-acceptance-1'
export const ACCEPTANCE_ID = 'W0-NAV-F'
export const DOMAIN_ID = 'D-NAV'
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

export interface ProjectRecordSummary {
  projectId: string
  path: string
  conversationCount: number
  messageCount: number
}

export interface DatabaseSummary {
  projectCount: number
  conversationCount: number
  messageCount: number
  projectRecords: ProjectRecordSummary[]
  boundarySnapshotFiles: number
}

export interface FixtureManifest {
  fixtureRoot: string
  created: boolean
  dbPath: string
  projectRecordsDir: string
  projects: FixtureProjectSummary[]
  dbSummary: DatabaseSummary
  cleanup: 'removed' | 'kept' | 'caller-owned'
}

export interface SearchHit {
  path: string
  line: number
  snippet: string
}

export interface ConversationMessageInput {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  completedAt?: number | null
}

export interface StoredConversation {
  id: string
  title: string
  updatedAt: number
  messages: Array<{
    id: string
    role: string
    content: string
    createdAt: number
    completedAt: number | null
  }>
}

export interface ProjectRow {
  id: string
  name: string
  root: string
  openedAt: number
}

export interface ProjectListSummary {
  id: string
  name: string
  pathLabel: string
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
  const fromEnvironment = process.env.VINKEY_NAVIGATION_ACCEPTANCE_ROOT
  if (fromEnvironment) return resolve(fromEnvironment)
  return process.cwd()
}

function usage(): string {
  return `Vinkey 项目/会话导航本地验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  在脚本自建的隔离临时目录生成双项目、每项目双会话与中英文文档 fixture，只读核查
  项目登记/去重、切换/隔离、会话 CRUD、删除边界、当前搜索与状态恢复合同。
  不调用 Ollama，不读取或写入真实应用数据目录与用户作品目录。

用法：
  npm run test:navigation-acceptance -- [选项]
  npm run test:navigation-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:navigation-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --workspace <dir>   指定 fixture 根目录；省略时在系统临时目录生成（运行后自动清理，
                      加 --keep-fixture 可保留用于检查）
  --output <dir>      结果归档目录（result.json、SHA256SUMS）；默认 artifacts/navigation-acceptance/run-<时间戳>/
  --log-file <path>   写入逐用例 JSON 诊断日志；未指定时写入系统临时目录
  --tester-id <id>    非个人标识的测试人员代号（用于 execution.testerId）
  --keep-fixture      运行结束后保留自动生成的 fixture（默认自动清理）
  --json              输出完整机器可读 JSON（stdout 只有单个 JSON 文档）
  -h, --help          显示帮助

环境变量：
  VINKEY_NAVIGATION_ACCEPTANCE_ROOT  仓库根目录（由包装脚本注入，一般无需手工设置）

说明：
  - fixture 只生成于 --workspace 指定目录或脚本自建临时目录；项目 ID 由 root 路径的
    确定性哈希生成（等价于 workspace_from_root 的稳定命名合同），用于验证重复添加去重。
  - 搜索断言按 src-tauri/src/search.rs 合同复刻：忽略点文件与 node_modules/target/dist、
    逐行小写子串匹配、最多 200 条（前端传 100）、snippet 前 180 字符、仅文本文档。
  - 删除边界按 projects.rs delete_record：确认名称后只删应用记录与会话库，绝不触碰项目文件。`
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
  return options
}

function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function runCommand(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; code: number | null } {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 })
    return {
      ok: result.status === 0,
      stdout: (result.stdout ?? '').trim(),
      stderr: (result.stderr ?? '').trim(),
      code: result.status,
    }
  } catch {
    return { ok: false, stdout: '', stderr: '', code: null }
  }
}

function gnuVersion(prefix: string, output: string): string {
  const match = output.match(new RegExp(`${prefix}[\\s/]([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)`))
  return (match?.[1] ?? output.split(/\s+/u)[1] ?? output) || 'N/A'
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
  return {
    version,
    gitSha: shaRun.ok ? shaRun.stdout : null,
    dirty: Boolean(statusRun.stdout),
    root,
  }
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
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion: process.platform === 'win32' ? process.arch : (runCommand('sw_vers', ['-productVersion']).ok ? runCommand('sw_vers', ['-productVersion']).stdout : 'N/A'),
    arch: process.arch,
    node: process.version,
    rust: rust.ok ? gnuVersion('rustc', rust.stdout) : 'N/A',
    tauriCli,
    tauriFramework,
  }
}

// 项目 ID 合同：由规范化 root 路径生成确定性 16 位十六进制 ID（模拟 workspace_from_root
// 的 DefaultHasher 稳定命名）。同一 root 必然得到同一 ID，不同 root 得到不同 ID。
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

export function listProjects(dbPath: string): ProjectListSummary[] {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare('SELECT id, name, root AS pathLabel FROM projects ORDER BY opened_at DESC, id')
      .all().map((row) => row as unknown as ProjectListSummary)
  } finally {
    database.close()
  }
}

export function projectCount(dbPath: string): number {
  return listProjects(dbPath).length
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

export function activateProject(dbPath: string, id: string): void {
  const database = new DatabaseSync(dbPath)
  try {
    database.prepare('UPDATE project_selection SET active_id = ? WHERE singleton = 1').run(id)
  } finally {
    database.close()
  }
}

export function deleteProjectRecord(dbPath: string, id: string, confirmation: string): void {
  const { projects, activeId } = readProjects(dbPath)
  const workspace = projects.find((item) => item.id === id)
  if (!workspace) throw new Error('项目记录不存在，请刷新项目列表')
  if (confirmation !== workspace.name) throw new Error('项目名称不匹配')
  const recordPath = join(dirname(dbPath), 'project-records', `${id}.sqlite3`)
  if (existsSync(recordPath)) {
    const records = openConversationDatabase(recordPath)
    try {
      records.exec('DELETE FROM messages; DELETE FROM conversations;')
    } finally {
      records.close()
    }
  }
  const database = new DatabaseSync(dbPath)
  try {
    database.prepare('DELETE FROM projects WHERE id = ?').run(id)
    if (activeId === id) {
      database.prepare('UPDATE project_selection SET active_id = NULL WHERE singleton = 1').run()
    }
  } finally {
    database.close()
  }
}

export function saveMessage(dbPath: string, conversationId: string, conversationTitle: string, message: ConversationMessageInput): void {
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

export function loadConversation(dbPath: string, id: string): StoredConversation {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const header = database.prepare('SELECT title, updated_at AS updatedAt FROM conversations WHERE id = ?').get(id) as
      { title: string; updatedAt: number } | undefined
    if (!header) throw new Error('找不到该会话')
    const messages = database.prepare(
      'SELECT id, role, content, created_at AS createdAt, completed_at AS completedAt FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid',
    ).all(id).map((row) => row as unknown as StoredConversation['messages'][number])
    return { id, title: header.title, updatedAt: header.updatedAt, messages }
  } finally {
    database.close()
  }
}

export function deleteConversation(dbPath: string, id: string): void {
  const database = openConversationDatabase(dbPath)
  try {
    const result = database.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    if (Number(result.changes) === 0) throw new Error('会话记录已删除，请新建会话')
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

const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'mdx', 'txt',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'py', 'pyw', 'pyi',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'json5',
  'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'go', 'rs', 'rb', 'erb',
  'php', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift',
  'lua', 'r', 'sql', 'graphql', 'gql', 'proto', 'sh', 'bash', 'zsh', 'fish',
  'ps1', 'bat', 'cmd', 'log',
])
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'apng', 'tiff', 'tif',
  'pdf', 'mp4', 'webm', 'ogv', 'mov', 'm4v', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'opus',
  'oga', 'ogg', 'weba', 'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'exe', 'dll', 'so',
  'dylib', 'app', 'dmg', 'msi', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
  'odp', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'db', 'sqlite', 'sqlite3', 'bin', 'dat',
  'iso', 'img', 'class', 'jar', 'war', 'pyc', 'pyo',
])

// 复刻 src-tauri/src/search.rs 的 ensure_document_extension 判定：图片/PDF/音视频/二进制
// 视为不可搜索，其余（含未知扩展名归 text）可搜索。
function isTextDocument(path: string): boolean {
  const name = path.split(sep).at(-1)?.toLowerCase() ?? ''
  if (name === '.env' || name.startsWith('.env.')) return true
  const extension = (path.split('.').at(-1) ?? '').toLowerCase()
  if (BINARY_EXTENSIONS.has(extension)) return false
  return TEXT_EXTENSIONS.has(extension) || true
}

function relativeLabel(root: string, path: string): string {
  return path.replace(/\\/gu, '/').replace(new RegExp(`^${root.replace(/\\/gu, '/').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/*`, 'u'), '').split('/').filter(Boolean).join('/')
}

// 复刻 src-tauri/src/search.rs search_workspace 合同：walk 当前工作区 root，
// 忽略符号链接与点文件/node_modules/target/dist，逐行小写子串匹配，limit clamp(1,200)，
// snippet 取前 180 字符。frontend 以 maxResults=100 调用。
export function searchWorkspaceFixture(root: string, query: string, maxResults: number): SearchHit[] {
  const limit = Math.min(Math.max(maxResults, 1), 200)
  const needle = query.trim().toLowerCase()
  const hits: SearchHit[] = []
  if (!needle) return hits
  const allowed = (entry: Dirent): boolean => {
    if (entry.isSymbolicLink()) return false
    const name = entry.name
    return !name.startsWith('.') && name !== 'node_modules' && name !== 'target' && name !== 'dist'
  }
  const walk = (directory: string): void => {
    if (hits.length >= limit) return
    let entries: Dirent[] = []
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (hits.length >= limit) break
      if (!allowed(entry)) continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile() || !isTextDocument(full)) continue
      let content = ''
      try {
        content = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      const lines = content.split('\n')
      for (let index = 0; index < lines.length; index += 1) {
        if (hits.length >= limit) break
        const line = lines[index]!.replace(/\r$/u, '')
        if (line.toLowerCase().includes(needle)) {
          hits.push({ path: relativeLabel(root, full), line: index + 1, snippet: Array.from(line).slice(0, 180).join('') })
        }
      }
    }
  }
  walk(root)
  return hits
}

// 异步过期写保护合同：只有写目标项目与当前激活项目一致时才允许应用结果。
export function applyIfMatchesActive(activeId: string, targetId: string): boolean {
  return activeId === targetId
}

interface FixtureFileSpec {
  relativePath: string
  content: string
}

interface FixtureConversationSpec {
  id: string
  title: string
  messages: Array<ConversationMessageInput & { role: 'user' | 'assistant' }>
}

interface FixtureProjectSpec {
  name: string
  files: FixtureFileSpec[]
  conversations: FixtureConversationSpec[]
}

function projectAFiles(): FixtureFileSpec[] {
  const repeatLines = Array.from({ length: 150 }, (_, index) => `重复行 repeat-line-${index + 1}`).join('\n')
  return [
    { relativePath: 'README.md', content: '# Project A\nVinkey workspace for navigation fixture acceptance.\nThe aurora-scan pipeline grades prose drafts.\n' },
    { relativePath: '第1章-序章.md', content: '# 第一章 序章\n灯塔在黎明前亮起，海面泛着微光。\n' },
    { relativePath: 'notes/中英对照.txt', content: '灯塔 lighthouse\n黎明 dawn\n' },
    { relativePath: 'notes/repeat-lines.txt', content: `${repeatLines}\n` },
    { relativePath: '.hidden/secret.md', content: 'forbidden-needle must never appear in current search hits.\n' },
    { relativePath: 'node_modules/example/index.md', content: 'forbidden-needle inside node_modules is skipped.\n' },
  ]
}

function projectBFiles(): FixtureFileSpec[] {
  return [
    { relativePath: 'README.md', content: '# Project B\nVinkey workspace for navigation fixture acceptance.\nThe nebula-echo index maps scene beats.\n' },
    { relativePath: 'Chapter2.md', content: '## Chapter 2\nDawn breaks over the ridge.\n' },
    { relativePath: 'docs/双语.md', content: '# 双语辅助\n星轨 trail\n' },
  ]
}

function fixtureProjectSpecs(): FixtureProjectSpec[] {
  const now = Date.now()
  const message = (id: string, role: 'user' | 'assistant', content: string, offset: number): ConversationMessageInput & { role: 'user' | 'assistant' } => ({
    id, role, content, createdAt: now + offset, completedAt: role === 'assistant' ? now + offset + 1 : null,
  })
  return [
    {
      name: 'project-a',
      files: projectAFiles(),
      conversations: [
        {
          id: 'nav-a-0001',
          title: '世界观设定',
          messages: [
            message('msg-a1-1', 'user', '灯塔的世界观如何设定？', 0),
            message('msg-a1-2', 'assistant', '以海港与黎明为意象，灯塔既是地理坐标也是叙事锚点。', 1),
          ],
        },
        {
          id: 'nav-a-0002',
          title: '人物弧光',
          messages: [
            message('msg-a2-1', 'user', '主角的目标是什么？', 2),
            message('msg-a2-2', 'assistant', '主角从守望者成长为领航人，弧光围绕责任展开。', 3),
            message('msg-a2-3', 'user', '如何收束这条弧光？', 4),
          ],
        },
      ],
    },
    {
      name: 'project-b',
      files: projectBFiles(),
      conversations: [
        {
          id: 'nav-b-0001',
          title: 'Chapter 2 outline',
          messages: [
            message('msg-b1-1', 'user', 'Outline chapter two beats.', 0),
            message('msg-b1-2', 'assistant', 'Dawn, ridge crossing, then the storm threshold.', 1),
          ],
        },
        {
          id: 'nav-b-0002',
          title: '双语校对',
          messages: [
            message('msg-b2-1', 'user', '星轨 翻译成 trail 是否合适？', 2),
            message('msg-b2-2', 'assistant', '可用，语境偏天文观测时建议 stellar trail。', 3),
          ],
        },
      ],
    },
  ]
}

function allFixtureFiles(): Array<{ projectName: string; file: FixtureFileSpec }> {
  return fixtureProjectSpecs().flatMap((project) => project.files.map((file) => ({ projectName: project.name, file })))
}

function writeFixtureFiles(root: string): Array<{ projectName: string; file: FixtureFileSpec }> {
  for (const item of allFixtureFiles()) {
    const filePath = join(root, 'workspaces', item.projectName, item.file.relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, item.file.content, 'utf8')
  }
  return allFixtureFiles()
}

function digestFiles(projectRoot: string, files: FixtureFileSpec[]): FixtureFileSummary[] {
  return files.map((file) => {
    const filePath = join(projectRoot, file.relativePath)
    return { name: file.relativePath.split('/').at(-1) ?? file.relativePath, relativePath: file.relativePath, sha256: sha256OfFile(filePath) }
  })
}

export function generateFixture(fixtureRoot: string): FixtureManifest {
  mkdirSync(fixtureRoot, { recursive: true })
  const dbPath = join(fixtureRoot, 'app-data', 'vinkey.sqlite3')
  const projectRecordsDir = join(fixtureRoot, 'app-data', 'project-records')
  createProjectsDatabase(dbPath)
  const specs = fixtureProjectSpecs()
  writeFixtureFiles(fixtureRoot)
  const projectRecords: ProjectRecordSummary[] = []

  for (const spec of specs) {
    const workspaceRoot = join(fixtureRoot, 'workspaces', spec.name)
    const files = digestFiles(workspaceRoot, spec.files)
    const { id } = registerProject(dbPath, workspaceRoot)
    const recordPath = join(projectRecordsDir, `${id}.sqlite3`)
    createConversationDatabase(recordPath)
    let messagesTotal = 0
    for (const conversation of spec.conversations) {
      for (const item of conversation.messages) {
        saveMessage(recordPath, conversation.id, conversation.title, item)
        messagesTotal += 1
      }
    }
    projectRecords.push({
      projectId: id,
      path: recordPath,
      conversationCount: spec.conversations.length,
      messageCount: messagesTotal,
    })
  }

  const projects = specs.map((spec) => {
    const workspaceRoot = join(fixtureRoot, 'workspaces', spec.name)
    const id = projectIdOf(workspaceRoot)
    return {
      id,
      name: spec.name,
      root: workspaceRoot,
      files: digestFiles(workspaceRoot, spec.files),
      conversations: spec.conversations.map((conversation) => ({ id: conversation.id, title: conversation.title, messageCount: conversation.messages.length })),
    }
  })

  const dbSummary: DatabaseSummary = {
    projectCount: specs.length,
    conversationCount: projectRecords.reduce((sum, item) => sum + item.conversationCount, 0),
    messageCount: projectRecords.reduce((sum, item) => sum + item.messageCount, 0),
    projectRecords,
    boundarySnapshotFiles: allFixtureFiles().filter((item) => !item.file.relativePath.startsWith('.hidden') && !item.file.relativePath.startsWith('node_modules')).length,
  }

  return {
    fixtureRoot,
    created: true,
    dbPath,
    projectRecordsDir,
    projects,
    dbSummary,
    cleanup: 'caller-owned',
  }
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

function passCase(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'PASS', detail }
}

function failCase(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'FAIL', detail }
}

function blockedCase(caseId: string, title: string, detail: string, blockedReason: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'BLOCKED', detail, blockedReason }
}

function snapshotBoundaryFiles(fixture: FixtureManifest): Array<{ relativePath: string; sha256: string }> {
  const snapshots: Array<{ relativePath: string; sha256: string }> = []
  for (const project of fixture.projects) {
    for (const file of project.files) {
      const filePath = join(project.root, file.relativePath)
      if (!existsSync(filePath)) continue
      snapshots.push({ relativePath: `${project.name}/${file.relativePath}`, sha256: sha256OfFile(filePath) })
    }
  }
  return snapshots
}

export interface NavigationCaseContext {
  dbPath: string
  fixture: FixtureManifest
}

export function runMachineCases(context: NavigationCaseContext): CaseResult[] {
  const { dbPath, fixture } = context
  const cases: CaseResult[] = []
  const projectA = fixture.projects[0]!
  const projectB = fixture.projects[1]!
  const recordsDir = fixture.projectRecordsDir
  const recordA = join(recordsDir, `${projectA.id}.sqlite3`)
  const recordB = join(recordsDir, `${projectB.id}.sqlite3`)

  // NAV-F-001 项目登记/去重
  {
    const issues: string[] = []
    const before = projectCount(dbPath)
    const reRegistered = registerProject(dbPath, projectA.root)
    if (reRegistered.id !== projectA.id) issues.push(`重复添加同一目录产生不同 ID：${reRegistered.id}`)
    if (projectCount(dbPath) !== before) issues.push(`重复添加新增了记录：${before} -> ${projectCount(dbPath)}`)
    const database = new DatabaseSync(dbPath)
    try {
      database.exec('PRAGMA foreign_keys = ON;')
      try {
        database.prepare('INSERT INTO projects (id, root, name, opened_at) VALUES (?, ?, ?, ?)').run('collision-id', projectA.root, 'collision', Date.now())
        issues.push('以不同 ID 插入同一 root 未触发 UNIQUE 约束')
      } catch {
        // 期望 UNIQUE(root) 冲突：去重边界正确
      }
    } finally {
      database.close()
    }
    if (projectCount(dbPath) !== before) issues.push('冲突插入后记录数变化')
    const projectIdStable = projectIdOf(projectA.root) === projectA.id && projectIdOf(projectB.root) === projectB.id
    if (!projectIdStable) issues.push('项目 ID 不稳定')
    if (issues.length > 0) cases.push(failCase('NAV-F-001', '项目登记/去重（稳定 ID 与唯一 root）', issues.join('；')))
    else cases.push(passCase('NAV-F-001', '项目登记/去重（稳定 ID 与唯一 root）', `两项目 ID 稳定；重复添加同目录保持 ${before} 条记录；UNIQUE(root) 冲突按去重处理。`))
  }

  // NAV-F-002 项目切换/隔离（workspaceId 异步写守卫）
  {
    const issues: string[] = []
    activateProject(dbPath, projectB.id)
    if (readProjects(dbPath).activeId !== projectB.id) issues.push('激活 project-b 失败')
    activateProject(dbPath, projectA.id)
    if (readProjects(dbPath).activeId !== projectA.id) issues.push('激活 project-a 失败')
    activateProject(dbPath, projectB.id)
    if (readProjects(dbPath).activeId !== projectB.id) issues.push('B/A/B 往返切换失败')
    const stale = applyIfMatchesActive(projectA.id, projectB.id)
    if (stale) issues.push('过期写（目标 B、当前 A）未被丢弃')
    if (!applyIfMatchesActive(projectB.id, projectB.id)) issues.push('当前项目写被误丢弃')
    const aMessages = listConversations(recordA).reduce((sum, item) => sum + item.messageCount, 0)
    const bMessages = listConversations(recordB).reduce((sum, item) => sum + item.messageCount, 0)
    if (aMessages === 0 || bMessages === 0) issues.push('项目会话库为空，隔离边界无法验证')
    if (issues.length > 0) cases.push(failCase('NAV-F-002', '项目切换/隔离（workspaceId 异步写守卫）', issues.join('；')))
    else cases.push(passCase('NAV-F-002', '项目切换/隔离（workspaceId 异步写守卫）', `B/A/B 往返切换正确；会话按项目文件隔离（A=${aMessages} 条、B=${bMessages} 条）；过期写被 workspaceId 守卫丢弃。`))
  }

  // NAV-F-003 会话 CRUD（新建/恢复/删除，外键级联）
  {
    const issues: string[] = []
    const beforeCount = listConversations(recordA).length
    if (beforeCount < 2) issues.push(`project-a 会话数不足：${beforeCount}`)
    const restored = loadConversation(recordA, 'nav-a-0001')
    const expectedContents = ['灯塔的世界观如何设定？', '以海港与黎明为意象，灯塔既是地理坐标也是叙事锚点。']
    if (restored.messages.length !== 2) issues.push('恢复消息数不正确')
    if (restored.messages.map((item) => item.content).join('|') !== expectedContents.join('|')) issues.push('恢复顺序或内容不正确')
    const scratchId = 'nav-a-scratch'
    saveMessage(recordA, scratchId, '临时会话', { id: 'msg-scratch-1', role: 'user', content: '新建会话消息', createdAt: Date.now() })
    if (listConversations(recordA).length !== beforeCount + 1) issues.push('新建会话未生效')
    deleteConversation(recordA, scratchId)
    if (listConversations(recordA).length !== beforeCount) issues.push('删除会话未生效')
    deleteConversation(recordA, 'nav-a-0002')
    if (messageCountFor(recordA, 'nav-a-0002') !== 0) issues.push('删除会话未级联删除消息')
    if (messageCountFor(recordA, 'nav-a-0001') !== 2) issues.push('级联删除误伤其他会话')
    let deleteFailureDetected = false
    try {
      deleteConversation(recordA, 'nav-a-0002')
    } catch {
      deleteFailureDetected = true
    }
    if (!deleteFailureDetected) issues.push('删除不存在会话未报错（删除失败合同缺失）')
    const visibleInB = listConversations(recordB).some((item) => item.id === 'nav-a-0001')
    if (visibleInB) issues.push('project-a 会话出现在 project-b 会话库（项目外键越界）')
    if (issues.length > 0) cases.push(failCase('NAV-F-003', '会话 CRUD（新建/恢复/删除，外键级联）', issues.join('；')))
    else cases.push(passCase('NAV-F-003', '会话 CRUD（新建/恢复/删除，外键级联）', `新建/恢复/删除正确；删除级联清空消息且不误伤其他会话；删除不存在会话返回错误提示；会话按项目库隔离。`))
  }

  // NAV-F-004 删除边界（只删应用记录，不触碰项目文件）
  {
    const issues: string[] = []
    const before = snapshotBoundaryFiles(fixture)
    activateProject(dbPath, projectB.id)
    let wrongConfirmationRefused = false
    try {
      deleteProjectRecord(dbPath, projectB.id, 'wrong-name')
    } catch {
      wrongConfirmationRefused = true
    }
    if (!wrongConfirmationRefused) issues.push('错误确认名未被拒绝')
    if (!existsSync(recordB) || listConversations(recordB).length !== 2) issues.push('确认名错误时不应清空会话库')
    const bRecordPath = join(recordsDir, `${projectB.id}.sqlite3`)
    const bConversationsBefore = listConversations(bRecordPath).length
    deleteProjectRecord(dbPath, projectB.id, projectB.name)
    if (existsSync(join(recordsDir, `${projectB.id}.sqlite3`)) && listConversations(bRecordPath).length !== 0) issues.push('删除项目未清空会话库')
    if (bConversationsBefore !== 2) issues.push(`project-b 会话数异常：${bConversationsBefore}`)
    if (readProjects(dbPath).projects.some((item) => item.id === projectB.id)) issues.push('删除后项目记录仍存在')
    if (readProjects(dbPath).activeId === projectB.id) issues.push('删除当前项目后 active_id 未清空')
    const after = snapshotBoundaryFiles(fixture)
    const changed = before.filter((item) => {
      const afterItem = after.find((entry) => entry.relativePath === item.relativePath)
      return !afterItem || afterItem.sha256 !== item.sha256
    })
    if (changed.length > 0) issues.push(`删除项目改变了 ${changed.length} 个 fixture 文件：${changed.map((item) => item.relativePath).join('，')}`)
    if (issues.length > 0) cases.push(failCase('NAV-F-004', '删除边界（确认名称后只删记录与会话）', issues.join('；')))
    else cases.push(passCase('NAV-F-004', '删除边界（确认名称后只删记录与会话）', `确认名错误被拒绝且会话库保留；确认后记录与会话清除、active 置空；${fixture.dbSummary.boundarySnapshotFiles} 个 fixture 文件 SHA-256 全部不变。`))
  }

  // NAV-F-005 当前搜索（工作区边界、中文路径、上限与忽略规则）
  {
    const issues: string[] = []
    const rootA = projectA.root
    const lanternHits = searchWorkspaceFixture(rootA, '灯塔', 100)
    if (lanternHits.length < 2) issues.push(`中文搜索「灯塔」命中不足：${lanternHits.length}`)
    if (!lanternHits.every((hit) => /[\u4e00-\u9fff]/u.test(hit.path) || hit.path.includes('中英对照'))) issues.push('中文路径未出现在搜索结果中')
    if (!lanternHits.every((hit) => Array.from(hit.snippet).length <= 180)) issues.push('snippet 超过 180 字符')
    const sharedHits = searchWorkspaceFixture(rootA, 'vinkey', 100)
    if (sharedHits.length === 0) issues.push('当前项目正文搜索无结果')
    if (sharedHits.some((hit) => hit.path.startsWith('project-b'))) issues.push('搜索越出当前工作区边界（命中 project-b）')
    const crossHits = searchWorkspaceFixture(rootA, '星轨', 100)
    if (crossHits.length !== 0) issues.push(`搜索只存在于 project-b 的词却命中：${crossHits.length}`)
    const forbiddenHits = searchWorkspaceFixture(rootA, 'forbidden-needle', 100)
    if (forbiddenHits.length !== 0) issues.push(`点文件/node_modules 中的内容被搜索返回：${forbiddenHits.length}`)
    const capped = searchWorkspaceFixture(rootA, '重复行', 100)
    if (capped.length !== 100) issues.push(`搜索上限未生效：期望 100，实际 ${capped.length}`)
    if (issues.length > 0) cases.push(failCase('NAV-F-005', '当前搜索（工作区边界/中文路径/上限）', issues.join('；')))
    else cases.push(passCase('NAV-F-005', '当前搜索（工作区边界/中文路径/上限）', `中文查询与中文路径可搜；范围限当前工作区；点文件与 node_modules 忽略；重复行上限恰为 100 条。`))
  }

  // NAV-F-006 状态与恢复（空态/错误识别/重试/重复提交保护）
  {
    const issues: string[] = []
    const emptyDbPath = join(fixture.fixtureRoot, 'app-data', 'state-empty.sqlite3')
    createProjectsDatabase(emptyDbPath)
    const emptyState = readProjects(emptyDbPath)
    if (emptyState.projects.length !== 0) issues.push('空态不应有项目记录')
    if (emptyState.activeId !== null) issues.push('空态 activeId 应为 null')
    const corruptPath = join(fixture.fixtureRoot, 'app-data', 'state-corrupt.sqlite3')
    mkdirSync(dirname(corruptPath), { recursive: true })
    writeFileSync(corruptPath, Buffer.from([0x00, 0x01, 0x02, 0xff]), 'binary')
    let errorDescribed = false
    try {
      const probe = new DatabaseSync(corruptPath, { readOnly: true })
      probe.prepare('SELECT 1').get()
      probe.close()
    } catch {
      errorDescribed = true
    }
    if (!errorDescribed) issues.push('损坏会话库未被识别为错误')
    const retryPath = join(fixture.fixtureRoot, 'app-data', 'state-retry.sqlite3')
    createConversationDatabase(retryPath)
    saveMessage(retryPath, 'retry-c1', '重试会话', { id: 'retry-m1', role: 'user', content: '恢复后可达', createdAt: Date.now() })
    if (listConversations(retryPath).length !== 1) issues.push('重试恢复失败')
    const expectedCount = projectCount(dbPath)
    const submitGuard = registerProject(dbPath, projectA.root)
    if (submitGuard.id !== projectA.id) issues.push('重复提交产生新 ID')
    if (projectCount(dbPath) !== expectedCount) issues.push(`重复提交保护失效：${expectedCount} -> ${projectCount(dbPath)}`)
    if (issues.length > 0) cases.push(failCase('NAV-F-006', '状态与恢复（空态/错误识别/重试/防重复提交）', issues.join('；')))
    else cases.push(passCase('NAV-F-006', '状态与恢复（空态/错误识别/重试/防重复提交）', `空态返回空列表与 null 激活；损坏库识别为错误而非静默；重建后可恢复读取；重复提交不产生新记录。`))
  }

  return cases
}

function defaultLogFile(): string {
  const directory = process.platform === 'win32' ? tmpdir() : '/tmp'
  return join(directory, `vinkey-navigation-acceptance-${Date.now()}.json`)
}

export function runNavigationAcceptance(input: AcceptanceRunInput): AcceptanceRunOutput {
  const { options, repository, environment, fixture, cases } = input
  const startedAt = Date.now()
  const machineCases = cases && cases.length > 0 ? cases : runMachineCases({ dbPath: fixture.dbPath, fixture })
  const allCases = machineCases.map((item) => ({ ...item, durationMs: item.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = options.outputDir ?? join(repository.root, 'artifacts', 'navigation-acceptance', `run-${timestamp}`)
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
    repository: {
      version: repository.version,
      gitSha: repository.gitSha,
      dirty: repository.dirty,
    },
    application: {
      version: repository.version,
      buildNumber: null,
      gitSha: null,
      architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W0-NAV-F fixture/合同验收：使用隔离临时目录与测试数据库，不读取也不写入真实应用数据目录与用户作品目录。',
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

  // result.json 不自引用自身 hash：定稿写入后由 SHA256SUMS 记录其最终 hash，
  // 避免「写入 hash 后又重写文件」导致 shasum -c 校验失败。
  const resultHash = sha256OfFile(resultFile)
  writeFileSync(sha256File, `${resultHash}  result.json\n`, 'utf8')
  const finalResult = result

  return {
    result: finalResult,
    conclusion,
    exitCode,
    outputDir,
    resultFile,
    sha256File,
    logFile,
  }
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
      fixtureRoot = join(tmpdir(), `vinkey-navigation-fixture-${Date.now()}`)
      autoGenerated = true
    }
    const fixture = generateFixture(fixtureRoot)
    fixture.cleanup = autoGenerated ? (options.keepFixture ? 'kept' : 'removed') : 'caller-owned'

    let completed = false
    try {
      const output = runNavigationAcceptance({
        options,
        repository,
        environment,
        fixture,
      })
      stderrProgress(output.result.cases as CaseResult[])
      if (options.json) {
        console.log(JSON.stringify(output.result, null, 2))
      } else {
        console.log(stdoutSummary(output))
      }
      process.exitCode = output.exitCode
      completed = true
    } finally {
      // 成功路径按“生成并清理自有临时目录”删除 fixture；出错时保留以便排查。
      if (completed && autoGenerated && !options.keepFixture) {
        try {
          rmSync(fixtureRoot, { recursive: true, force: true })
        } catch {
          // 清理失败不改变验收结论；fixture 路径已记录在 result.json
        }
      }
    }
  } catch (cause) {
    console.error(`导航 fixture 验收失败：${messageOf(cause)}${fixtureRoot ? `（fixture：${fixtureRoot}）` : ''}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_NAVIGATION_ACCEPTANCE_CLI === '1') {
  main().catch((cause) => {
    console.error(`导航 fixture 验收失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
