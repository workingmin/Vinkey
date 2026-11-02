import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { workerStageLabel } from '../../src/lib/chatActivity'

// W4-TASK-E / D-TASK-LOG 本地验收脚本（UI-ACC-LOGS-001）。
// 只读核查真实长文本分析任务产物（.vinkey/analysis/jobs/<jobId>/）与 SQLite 模型配置，
// 并采集测试人员的桌面人工观察（暂停/恢复、停止确认、折叠/自动跟随、产物预览、
// 重启恢复、源变化拒绝、失败重试、窄栏/键盘）。脚本不调用模型、不改写任务产物。

export const SUITE_ID = 'UI-ACC-LOGS-001'
export const SUITE_VERSION = 'task-process-acceptance-1'
export const ACCEPTANCE_ID = 'W4-TASK-E'
export const DOMAIN_ID = 'D-TASK-LOG'
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
  dbPath: string
  profileId: string | null
  workspace: string | null
  jobId: string | null
  timeoutMs: number
  json: boolean
  listProfiles: boolean
  logFile: string | null
  manualFile: string | null
  dumpManual: string | null
  outputDir: string | null
  testerId: string | null
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

export interface ConfiguredProfileSummary {
  id: string
  name: string
  model: string
  updatedAt: number
}

export interface SelectedModelSummary {
  profileId: string
  profileName: string
  model: string
  contextWindow: number
  connectionKind: 'ollama' | 'openai-compatible' | null
  connectionBaseUrl: string | null
  hasApiKey: boolean
}

export interface FixtureFileSummary {
  name: string
  relativePath: string
  sha256: string
}

export interface FixtureManifest {
  workspaceRoot: string
  created: boolean
  files: FixtureFileSummary[]
}

export interface JobSummary {
  jobId: string
  status: string
  createdAt: number | null
  updatedAt: number | null
  eventCount: number
  segmentLabels: string[]
  artifactNames: string[]
  terminalStatus: string | null
  pipelineCompleted: boolean | null
  jobDir: string
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function defaultDatabasePath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'com.vinkey.desktop', 'vinkey.sqlite3')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) throw new Error('无法确定 Windows APPDATA，请使用 --db 显式指定 vinkey.sqlite3。')
    return join(appData, 'com.vinkey.desktop', 'vinkey.sqlite3')
  }
  const xdg = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(xdg, 'com.vinkey.desktop', 'vinkey.sqlite3')
}

function repositoryRoot(): string {
  const fromEnvironment = process.env.VINKEY_TASK_PROCESS_ACCEPTANCE_ROOT
  if (fromEnvironment) return resolve(fromEnvironment)
  return process.cwd()
}

function usage(): string {
  return `Vinkey 长任务/日志中心本地验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  在具备 Tauri 桌面端、已配置模型与本机文件的环境下，只读核查真实长文本分析任务的
  事件/段/终态/产物（.vinkey/analysis/jobs/<jobId>/），并导出测试人员的人工 UI 观察清单。

用法：
  npm run test:task-process-acceptance -- [选项]
  npm run test:task-process-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:task-process-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --workspace <dir>   指定工作区（项目）根目录；省略时在系统临时目录生成一份自带本地
                      文件的 fixture 工作区（脚本不会写入已有真实项目目录）
  --job-id <id>       指定要核查的分析任务；省略时选择最近更新的任务并列出全部任务
  --manual <path>     合并测试人员人工观察结果 JSON（可用 --dump-manual 生成模板）
  --dump-manual <path> 导出人工 UI 观察回填模板并退出，不执行核查
  --output <dir>      结果归档目录（result.json、SHA256SUMS）；默认 artifacts/task-process-acceptance/run-<时间戳>/
  --profile-id <id>   指定要验收的模型 profile；未传时读取 SQLite 当前值
  --db <path>         指定只读的 vinkey.sqlite3；默认使用当前系统的 Vinkey 应用数据目录
  --timeout-ms <ms>   单用例超时（预留合同参数，本脚本默认不调用模型），默认 120000
  --log-file <path>   写入逐用例 JSON 诊断日志；未指定时写入系统临时目录
  --tester-id <id>    非个人标识的测试人员代号（用于 execution.testerId）
  --list-profiles     只读列出已配置模型 profile，不核查任务产物
  --json              输出完整机器可读 JSON（stdout 只有单个 JSON 文档）
  -h, --help          显示帮助

环境变量：
  VINKEY_DB_PATH         与 --db 相同，命令行参数优先
  VINKEY_PROFILE_ID      与 --profile-id 相同，命令行参数优先
  VINKEY_MODEL_API_KEY   本脚本不调用模型，不需要；若后续扩展模型连通性探针时使用
  VINKEY_TASK_PROCESS_ACCEPTANCE_ROOT  仓库根目录（由包装脚本注入，一般无需手工设置）

说明：
  - 前置门槛：W1-MODEL-E / W2-CHAT-E / W3-CONTEXT-E 已具备真实链路；工作区内至少发起过
    一次长文本分析并保留 .vinkey/analysis/jobs/<jobId>/ 产物。
  - 脚本只读 SQLite 与任务产物，不修改用户文件；fixture 仅生成于脚本自建的临时目录。
  - 未实现的暂停安全点回执按 CP-42 降级验证，不得将“已暂停后续步骤”写成 CP-05“已暂停”。`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    dbPath: resolve(process.env.VINKEY_DB_PATH ?? defaultDatabasePath()),
    profileId: process.env.VINKEY_PROFILE_ID?.trim() || null,
    workspace: null,
    jobId: null,
    timeoutMs: 120_000,
    json: false,
    listProfiles: false,
    logFile: null,
    manualFile: null,
    dumpManual: null,
    outputDir: null,
    testerId: null,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    if (value === '--list-profiles') { options.listProfiles = true; continue }
    if (value === '--workspace' || value === '--job-id' || value === '--manual' || value === '--dump-manual'
      || value === '--output' || value === '--db' || value === '--profile-id' || value === '--timeout-ms'
      || value === '--log-file' || value === '--tester-id') {
      const argument = values[index + 1]
      if (!argument) throw new Error(`参数 ${value} 缺少值。`)
      index += 1
      if (value === '--workspace') options.workspace = resolve(argument)
      if (value === '--job-id') options.jobId = argument.trim()
      if (value === '--manual') options.manualFile = resolve(argument)
      if (value === '--dump-manual') options.dumpManual = resolve(argument)
      if (value === '--output') options.outputDir = resolve(argument)
      if (value === '--db') options.dbPath = resolve(argument)
      if (value === '--profile-id') options.profileId = argument.trim()
      if (value === '--timeout-ms') options.timeoutMs = Number(argument)
      if (value === '--log-file') options.logFile = resolve(argument)
      if (value === '--tester-id') options.testerId = argument.trim()
      continue
    }
    throw new Error(`未知参数 ${value}。`)
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 900_000) {
    throw new Error('--timeout-ms 必须是 1000 到 900000 之间的整数。')
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
  const ollama = runCommand('ollama', ['--version'])
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion: process.platform === 'win32' ? process.arch : (runCommand('sw_vers', ['-productVersion']).ok ? runCommand('sw_vers', ['-productVersion']).stdout : 'N/A'),
    arch: process.arch,
    node: process.version,
    rust: rust.ok ? gnuVersion('rustc', rust.stdout) : 'N/A',
    tauriCli,
    tauriFramework,
    ollama: ollama.ok ? (ollama.stdout.match(/version\s+([0-9][^\s]*)/u)?.[1] ?? ollama.stdout) : 'N/A',
  }
}

export function readPersistedActiveProfileId(dbPath: string): string | null {
  if (!existsSync(dbPath)) throw new Error(`未找到 Vinkey 数据库：${dbPath}`)
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const table = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_preferences'").get()
    if (!table) return null
    return (database.prepare('SELECT value FROM app_preferences WHERE key = ?').get('activeModelId') as { value?: string } | undefined)?.value ?? null
  } finally {
    database.close()
  }
}

export function listConfiguredProfiles(dbPath: string): ConfiguredProfileSummary[] {
  if (!existsSync(dbPath)) throw new Error(`未找到 Vinkey 数据库：${dbPath}`)
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare(`
      SELECT id, name, model, updated_at AS updatedAt
      FROM model_profiles
      ORDER BY updated_at DESC, id ASC
    `).all().map((row) => row as unknown as ConfiguredProfileSummary)
  } finally {
    database.close()
  }
}

export function formatProfileListReport(dbPath: string, profiles: ConfiguredProfileSummary[], activeProfileId: string | null = null): string {
  const lines = [
    'Vinkey 长任务/日志中心本地验收 - 模型配置检查',
    `数据库：${dbPath}`,
    `已配置模型：${profiles.length} 个`,
  ]
  profiles.forEach((profile, index) => {
    lines.push(`[${index + 1}] ${profile.id}${profile.id === activeProfileId ? '（当前）' : ''}`)
    lines.push(`    名称：${profile.name}`)
    lines.push(`    模型：${profile.model}`)
  })
  if (profiles.length === 0) lines.push('没有已配置的模型 profile。')
  lines.push('说明：--list-profiles 仅检查配置，未调用模型，也未核查任务产物。')
  return lines.join('\n')
}

export function resolveSelectedModel(dbPath: string, profileId: string | null): SelectedModelSummary {
  if (!existsSync(dbPath)) throw new Error(`未找到 Vinkey 数据库：${dbPath}`)
  const selectedProfileId = profileId?.trim() || readPersistedActiveProfileId(dbPath)
  if (!selectedProfileId) {
    throw new Error('数据库中没有已持久化的当前模型。请先启动新版 Vinkey 完成 activeModelId 迁移，或显式传入 --profile-id <id>。')
  }
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const row = database.prepare(`
      SELECT
        p.id AS profile_id,
        p.name AS profile_name,
        p.model AS model,
        p.context_window AS context_window,
        c.kind AS connection_kind,
        c.base_url AS connection_base_url,
        c.has_api_key AS connection_has_api_key
      FROM model_profiles p
      LEFT JOIN model_profile_connections pc ON pc.profile_id = p.id
      LEFT JOIN model_connections c ON c.id = pc.connection_id
      WHERE p.id = ?
      ORDER BY p.updated_at DESC, p.id ASC
      LIMIT 1
    `).get(selectedProfileId) as unknown as {
      profile_id: string; profile_name: string; model: string; context_window: number
      connection_kind: 'ollama' | 'openai-compatible' | null
      connection_base_url: string | null; connection_has_api_key: number | null
    } | undefined
    if (!row) throw new Error(selectedProfileId ? `数据库中找不到模型 profile：${selectedProfileId}` : '数据库中没有已配置的模型 profile。')
    if (!row.connection_kind || !row.connection_base_url) {
      throw new Error(`模型 profile ${row.profile_id} 没有完整的 connection 关联。`)
    }
    return {
      profileId: row.profile_id,
      profileName: row.profile_name,
      model: row.model,
      contextWindow: Number(row.context_window ?? 0),
      connectionKind: row.connection_kind,
      connectionBaseUrl: row.connection_base_url,
      hasApiKey: row.connection_has_api_key !== 0,
    }
  } finally {
    database.close()
  }
}

function jobsRootOf(workspace: string): string {
  return join(workspace, '.vinkey', 'analysis', 'jobs')
}

function readJsonFile(file: string): unknown {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export interface AnalysisEventSegment {
  id?: string
  label?: string
  startedAt?: number
  endedAt?: number
}

export interface AnalysisEventLoose {
  sequence?: number
  timestamp?: number
  jobId?: string
  stage?: string
  status?: string
  message?: string
  segment?: AnalysisEventSegment | null
  artifact?: string | null
}

interface JobStartLoose {
  jobId?: string
  workspaceId?: string
  status?: string
  createdAt?: number
  updatedAt?: number
}

interface WorkerOutputLoose {
  pipelineCompleted?: boolean
  content?: string
  modelInvocationCount?: number
  chunkCount?: number
  summaryCount?: number
  durationMs?: number
}

interface CheckpointManifestLoose {
  schemaVersion?: string
  entries?: Array<{ artifact?: string }> | null
}

function summarizeJob(jobRoot: string, jobId: string): JobSummary {
  const start = readJsonFile(join(jobRoot, 'job-start.json')) as JobStartLoose | null
  const events = readJsonFile(join(jobRoot, 'worker-events.json')) as AnalysisEventLoose[] | null
  const output = readJsonFile(join(jobRoot, 'worker-output.json')) as WorkerOutputLoose | null
  let artifactNames: string[] = []
  try {
    artifactNames = readdirSync(jobRoot).filter((name) => !name.startsWith('.'))
  } catch {
    artifactNames = []
  }
  let entries: Array<{ artifact?: string }> = []
  const checkpoints = readJsonFile(join(jobRoot, 'worker-checkpoints.json')) as CheckpointManifestLoose | null
  if (Array.isArray(checkpoints?.entries)) entries = checkpoints.entries.filter((item) => item?.artifact)
  const checkpointArtifacts = [...new Set(entries.map((item) => item.artifact as string))]
  const labels = (events ?? [])
    .map((event) => event.segment?.label)
    .filter((label): label is string => Boolean(label))
  return {
    jobId,
    status: start?.status ?? 'unknown',
    createdAt: start?.createdAt ?? null,
    updatedAt: start?.updatedAt ?? null,
    eventCount: events?.length ?? 0,
    segmentLabels: [...new Set(labels)],
    artifactNames: [...new Set([...artifactNames, ...checkpointArtifacts])],
    terminalStatus: events?.at(-1)?.status ?? null,
    pipelineCompleted: typeof output?.pipelineCompleted === 'boolean' ? output.pipelineCompleted : null,
    jobDir: join('.vinkey', 'analysis', 'jobs', jobId),
  }
}

function fixtureSampleFiles(): Array<{ name: string; content: string }> {
  return [
    { name: 'README.md', content: '# 本地验收样本工作区\n\n本目录用于 W4-TASK-E 长文本分析验收。\n' },
    { name: '章节一.txt', content: '第一章 开场\n\n这一段足够长，用于触发阅读与分段、分析文本片段与后续汇总阶段。\n'.repeat(12) },
    { name: '章节二.md', content: '## 第二章 发展\n\n人物、叙事与主题线索分散在多个段落中，便于验证产物清单与引用核对。\n'.repeat(10) },
  ]
}

export function generateFixtureWorkspace(root: string): FixtureManifest {
  mkdirSync(root, { recursive: true })
  const files = fixtureSampleFiles().map((file) => {
    const filePath = join(root, file.name)
    writeFileSync(filePath, file.content, 'utf8')
    return {
      name: file.name,
      relativePath: file.name,
      sha256: sha256OfFile(filePath),
    }
  })
  return { workspaceRoot: root, created: true, files }
}


export function inspectWorkspace(root: string): FixtureManifest {
  const files: FixtureFileSummary[] = []
  try {
    for (const name of readdirSync(root).sort()) {
      const filePath = join(root, name)
      const stat = statSync(filePath)
      if (!stat.isFile()) continue
      files.push({ name, relativePath: name, sha256: sha256OfFile(filePath) })
    }
  } catch {
    // 目录不可读时返回空清单，由 CHK-003 提示
  }
  return { workspaceRoot: root, created: false, files }
}

function latestJobId(workspace: string): string | null {
  const jobsRoot = jobsRootOf(workspace)
  if (!existsSync(jobsRoot)) return null
  let directories: string[] = []
  try {
    directories = readdirSync(jobsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return null
  }
  if (directories.length === 0) return null
  return directories
    .map((jobId) => ({ jobId, updatedAt: summarizeJob(join(jobsRoot, jobId), jobId).updatedAt ?? 0 }))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]!.jobId
}


export interface WorkspaceScan {
  fixture: FixtureManifest
  jobs: JobSummary[]
  targetJob: JobSummary | null
}

export function scanWorkspace(workspace: string, jobId: string | null): WorkspaceScan {
  const fixture = inspectWorkspace(workspace)
  const jobsRoot = jobsRootOf(workspace)
  let jobs: JobSummary[] = []
  if (existsSync(jobsRoot)) {
    jobs = readdirSync(jobsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => summarizeJob(join(jobsRoot, entry.name), entry.name))
  }
  let targetJob: JobSummary | null = null
  if (jobId) {
    targetJob = jobs.find((job) => job.jobId === jobId) ?? null
    if (jobs.length > 0 && !targetJob) throw new Error(`在 ${jobsRoot} 中找不到任务 ${jobId}`)
  } else {
    const latest = latestJobId(workspace)
    targetJob = latest ? jobs.find((job) => job.jobId === latest) ?? null : null
  }
  return { fixture, jobs, targetJob }
}

export interface ManualCaseInput {
  caseId: string
  status: string
  evidence?: string | null
  notes?: string | null
}

const MANUAL_CASE_DEFINITIONS: Array<{ caseId: string; title: string; expected: string; evidence: string }> = [
  {
    caseId: 'TASK-UI-001',
    title: '暂停/继续快照（NT-002 / UX-08 / CP-41/42/05/29）',
    expected: '发起长文本分析并暂停：原生端当前仅调度暂停时显示“已暂停后续步骤”（CP-42），不宣称在途调用已停止；恢复后出现新推进段（继续动作段）且不覆盖暂停前记录；普通短回答无暂停按钮。',
    evidence: '暂停与恢复前后截图/录屏；暂停文案原文；恢复后新段与旧记录对照。',
  },
  {
    caseId: 'TASK-UI-002',
    title: '停止确认与部分结果保留（UX-09/UX-13 / CP-49/52/07）',
    expected: '控制区与输入区停止均弹“停止此任务？已生成的内容和已保存的分析文件会保留。”；确认后任务终态“已停止”；无结果时不创建空结果卡片；确有输出时显示“部分结果”。',
    evidence: '停止确认框截图；终态与结果卡片截图。',
  },
  {
    caseId: 'TASK-UI-003',
    title: '两层折叠与自动跟随（UX-04/UX-05 / CP-48/09）',
    expected: '“展开全部过程/收起全部过程”只控制第一层，不清空第二层详情选择；滚动/翻页/展开详情即停止跟随；新记录出现“有新记录 · 查看最新记录”；点击回到最新并保持选择。',
    evidence: '折叠/展开与自动跟随录屏；新记录通知截图。',
  },
  {
    caseId: 'TASK-UI-004',
    title: '分页与历史边界（UX-05/UX-12 / CP-10/33/34/47/53）',
    expected: '超过一页记录可分页且页码准确；历史缺失/读取失败/为空/保存失败分别用 CP-33/34/47/53 文案；不补造记录、不覆盖已确认任务终态。',
    evidence: '分页交互录屏；异常场景截图或说明。',
  },
  {
    caseId: 'TASK-UI-005',
    title: '产物预览与只读（UX-14 / CP-28/51）',
    expected: '查看分析文件为只读预览，文件名与实际一致；文件不存在/读取异常给出对应提示；关闭返回触发按钮；原始文稿不被静默覆盖。',
    evidence: '产物预览前后截图；失效/异常提示截图。',
  },
  {
    caseId: 'TASK-UI-006',
    title: '源变化拒绝恢复（NT-003 / UX-13 / CP-35）',
    expected: '修改源文件后恢复提示“原文已变化，无法沿用此前进度。请重新发起分析。”且不沿用旧检查点。',
    evidence: '修改源文件前后指纹、恢复提示与状态截图。',
  },
  {
    caseId: 'TASK-UI-007',
    title: '失败重试与步骤重跑（UX-10 / CP-50/32/31）',
    expected: '失败任务可从指定步骤重试，确认文案“从「{步骤名}」重新执行？此步骤及依赖它的后续步骤将重新处理，已有过程记录会保留。”；尝试次数对应当前调用；重跑范围先说明。',
    evidence: '失败任务控制区、步骤选择与确认框截图；重跑后事件对照。',
  },
  {
    caseId: 'TASK-UI-008',
    title: '重启恢复历史（NT-005 / UX-15）',
    expected: '重启应用并重开会话，任务事件、产物与终态完整可见；默认折叠按设计，无跨会话偏好承诺。',
    evidence: '重启前后会话状态与产物对照截图/录屏。',
  },
  {
    caseId: 'TASK-UI-009',
    title: '窄栏/键盘/无障碍（UX-16/UX-17）',
    expected: '360px 对话栏、200% 缩放、长中文文件名可读可点、无整页横向溢出；键盘操作两层按钮语义正确；关键状态播报一次，等待和终态无执行动画。',
    evidence: '窄栏/缩放截图；键盘与读屏观察记录。',
  },
]

export function buildManualCases(): CaseResult[] {
  return MANUAL_CASE_DEFINITIONS.map((definition) => ({
    caseId: definition.caseId,
    title: definition.title,
    category: 'manual' as const,
    status: 'BLOCKED' as const,
    detail: definition.expected,
    blockedReason: '待测试人员在桌面环境回填人工观察（--manual 合并）',
  }))
}

export function mergeManualCases(cases: CaseResult[], manualFile: string | null): CaseResult[] {
  if (!manualFile) return cases
  if (!existsSync(manualFile)) throw new Error(`未找到人工观察回填文件：${manualFile}`)
  const parsed = JSON.parse(readFileSync(manualFile, 'utf8')) as { cases?: ManualCaseInput[] }
  if (!Array.isArray(parsed.cases)) throw new Error(`人工观察回填文件缺少 cases 数组：${manualFile}`)
  const byId = new Map(parsed.cases.map((item) => [item.caseId, item]))
  return cases.map((item) => {
    if (item.category !== 'manual') return item
    const input = byId.get(item.caseId)
    if (!input) return item
    const status = (String(input.status ?? '').toUpperCase()) as CaseStatus
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(status)) throw new Error(`人工观察回填状态无效：${item.caseId} = ${input.status}`)
    return {
      ...item,
      status,
      evidence: input.evidence ?? null,
      notes: input.notes ?? null,
      blockedReason: status === 'BLOCKED' ? '测试人员标记为阻断且未提供通过证据' : null,
    }
  })
}

export function writeManualTemplate(file: string): void {
  const payload = {
    schemaVersion: 1,
    suite: SUITE_ID,
    generatedAt: new Date().toISOString(),
    instructions: '在具备 Tauri 桌面端、已配置模型与本机文件的环境执行用例后，把 status 填为 PASS/FAIL/BLOCKED，并补充 evidence 与 notes。未执行项保持 BLOCKED 并由测试人员说明原因。',
    cases: MANUAL_CASE_DEFINITIONS.map((definition) => ({
      caseId: definition.caseId,
      title: definition.title,
      expected: definition.expected,
      status: 'BLOCKED',
      evidence: '',
      notes: '',
    })),
  }
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
}

export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  selectedModel: SelectedModelSummary | null
  fixture: FixtureManifest | null
  jobs: JobSummary[]
  targetJob: JobSummary | null
  cases: CaseResult[]
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

function passCase(caseId: string, title: string, detail: string, durationMs?: number): CaseResult {
  return { caseId, title, category: 'machine', status: 'PASS', detail, durationMs }
}

function blockedCase(caseId: string, title: string, detail: string, blockedReason: string, durationMs?: number): CaseResult {
  return { caseId, title, category: 'machine', status: 'BLOCKED', detail, blockedReason, durationMs }
}

function failCase(caseId: string, title: string, detail: string, durationMs?: number): CaseResult {
  return { caseId, title, category: 'machine', status: 'FAIL', detail, durationMs }
}

function runMachineCases(input: {
  repository: RepositoryInfo
  environment: EnvironmentInfo
  selectedModel: SelectedModelSummary | null
  workspaceRoot: string | null
  jobs: JobSummary[]
  targetJob: JobSummary | null
  selectedModelError: string | null
}): CaseResult[] {
  const { repository, environment, selectedModel, workspaceRoot, jobs, targetJob, selectedModelError } = input
  const cases: CaseResult[] = []

  const probeDetail = [
    `os=${environment.os} ${environment.osVersion} ${environment.arch}`,
    `node=${environment.node}`,
    `rust=${environment.rust}`,
    `tauriCli=${environment.tauriCli}`,
    `tauriFramework=${environment.tauriFramework}`,
    `ollama=${environment.ollama}`,
    `vinkey=${repository.version}@${repository.gitSha ?? 'unknown'}`,
    repository.dirty ? '工作区有未提交变更' : '工作区干净',
  ].join('；')
  cases.push(passCase('TASK-CHK-001', '环境与版本探针', probeDetail))

  if (selectedModelError) {
    cases.push(blockedCase('TASK-CHK-002', '模型配置可读（只读 SQLite）', `当前环境不满足“已配置模型”前置：${selectedModelError}`, '前置条件不成立：未解析到可用的模型 profile/connection。'))
  } else if (selectedModel) {
    cases.push(passCase('TASK-CHK-002', '模型配置可读（只读 SQLite）', `profile=${selectedModel.profileId} ｜ 模型=${selectedModel.model} ｜ 连接=${selectedModel.connectionKind}`))
  } else {
    cases.push(blockedCase('TASK-CHK-002', '模型配置可读（只读 SQLite）', '未解析到模型配置。', '前置条件不成立：未解析到可用的模型 profile/connection。'))
  }

  if (!workspaceRoot) {
    cases.push(blockedCase('TASK-CHK-003', '任务目录定位（.vinkey/analysis/jobs）', '未提供 --workspace，也未成功生成 fixture 工作区。', '缺少工作区前置。'))
  } else if (jobs.length === 0) {
    cases.push(blockedCase('TASK-CHK-003', '任务目录定位（.vinkey/analysis/jobs）', `工作区 ${workspaceRoot} 下没有分析任务目录。`, '需先在 Vinkey 中对工作区发起至少一次长文本分析，保留 .vinkey/analysis/jobs/<jobId>/ 产物。'))
  } else {
    cases.push(passCase('TASK-CHK-003', '任务目录定位（.vinkey/analysis/jobs）', `找到 ${jobs.length} 个任务；目标任务 ${targetJob?.jobId ?? '未知'}。`))
  }

  if (jobs.length === 0 || !targetJob) {
    cases.push(blockedCase('TASK-CHK-004', '任务产物完整性', '无目标任务可核查。', '缺少任务产物前置。'))
    cases.push(blockedCase('TASK-CHK-005', '事件序列与段标签（CP-13/19~25/27）', '无目标任务可核查。', '缺少任务产物前置。'))
    cases.push(blockedCase('TASK-CHK-006', '任务终态与产物快照', '无目标任务可核查。', '缺少任务产物前置。'))
    return cases
  }

  const jobRoot = join(jobsRootOf(workspaceRoot!), targetJob.jobId)
  const required = ['job-start.json', 'worker-events.json', 'worker-input.json', 'worker-checkpoints.json']
  const missing = required.filter((name) => !existsSync(join(jobRoot, name)))
  if (missing.length > 0) {
    cases.push(failCase('TASK-CHK-004', '任务产物完整性', `缺失产物：${missing.join('，')}。`))
  } else {
    cases.push(passCase('TASK-CHK-004', '任务产物完整性', `必需产物齐全（${required.join('，')}）；checkpoint 清单登记 ${targetJob.artifactNames.length} 个条目。`))
  }

  const events = (readJsonFile(join(jobRoot, 'worker-events.json')) as AnalysisEventLoose[] | null) ?? []
  const sequenceIssues: string[] = []
  events.forEach((event, index) => {
    const expected = index + 1
    if (event.sequence !== expected) sequenceIssues.push(`#${expected} 期望 sequence=${expected}，实际=${String(event.sequence)}`)
    if (typeof event.timestamp !== 'number' || event.timestamp <= 0) sequenceIssues.push(`#${expected} 缺少有效 timestamp`)
    if (!event.stage) sequenceIssues.push(`#${expected} 缺少 stage`)
    if (!event.status) sequenceIssues.push(`#${expected} 缺少 status`)
  })
  const labelIssues: string[] = []
  events.forEach((event, index) => {
    const label = event.segment?.label
    if (!label) return
    const expectedLabel = event.stage ? workerStageLabel(event.stage) : ''
    const prefixOk = label.startsWith('继续') || label.startsWith('重新')
    if (label !== expectedLabel && !prefixOk) {
      labelIssues.push(`#${index + 1} 段标签="${label}" 与阶段映射"${expectedLabel}"不一致`)
    }
    if (event.segment && typeof event.segment.startedAt !== 'number') {
      labelIssues.push(`#${index + 1} 段缺少 startedAt`)
    }
  })
  const completedWithoutEndedAt = events.filter((event) => event.status === 'completed' && event.segment && typeof event.segment.endedAt !== 'number')
  if (completedWithoutEndedAt.length > 0) {
    labelIssues.push(`${completedWithoutEndedAt.length} 个已完成段缺少 endedAt（CP-27/R8）`)
  }
  const issues = [...sequenceIssues, ...labelIssues]
  if (events.length === 0) {
    cases.push(failCase('TASK-CHK-005', '事件序列与段标签（CP-13/19~25/27）', 'worker-events.json 为空，缺少执行事件记录。'))
  } else if (issues.length > 0) {
    cases.push(failCase('TASK-CHK-005', '事件序列与段标签（CP-13/19~25/27）', issues.slice(0, 8).join('；')))
  } else {
    const labels = [...new Set(events.map((event) => event.segment?.label).filter((label): label is string => Boolean(label)))]
    cases.push(passCase('TASK-CHK-005', '事件序列与段标签（CP-13/19~25/27）', `${events.length} 个事件 sequence 连续；段标签：${labels.join('，') || '无'}。`))
  }

  const output = readJsonFile(join(jobRoot, 'worker-output.json')) as WorkerOutputLoose | null
  if (targetJob.status !== 'completed') {
    cases.push(blockedCase('TASK-CHK-006', '任务终态与产物快照', `目标任务终态为 ${targetJob.status}，尚未形成完整产物证据。`, '需完整完成一次分析（终态 completed）后再核查产物快照。'))
  } else if (!output || output.pipelineCompleted !== true || typeof output.content !== 'string' || output.content.length === 0) {
    cases.push(failCase('TASK-CHK-006', '任务终态与产物快照', '任务已 completed 但 worker-output.json 缺失、pipelineCompleted=false 或内容为空。'))
  } else {
    cases.push(passCase('TASK-CHK-006', '任务终态与产物快照', `终态 completed；产物 ${output.content.length} 字，模型调用 ${output.modelInvocationCount ?? 0} 次，chunk ${output.chunkCount ?? 0}，汇总 ${output.summaryCount ?? 0}，耗时 ${output.durationMs ?? 0}ms。`))
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
  return join(directory, `vinkey-task-process-acceptance-${Date.now()}.json`)
}

export function runTaskProcessAcceptance(input: {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  fixture: FixtureManifest | null
  workspaceRoot: string | null
  jobs: JobSummary[]
  targetJob: JobSummary | null
  selectedModel: SelectedModelSummary | null
  selectedModelError: string | null
  cases: CaseResult[]
}): AcceptanceRunOutput {
  const { options, repository, environment, fixture, workspaceRoot, jobs, targetJob, selectedModel, selectedModelError, cases } = input
  const startedAt = Date.now()
  const machineCases = runMachineCases({
    repository, environment, selectedModel, workspaceRoot, jobs, targetJob, selectedModelError,
  })
  const manualCases = mergeManualCases(buildManualCases(), options.manualFile)
  const allCases = [...machineCases, ...manualCases].map((item) => ({ ...item, durationMs: item.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = options.outputDir ?? join(repository.root, 'artifacts', 'task-process-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  const logDirectory = dirname(logFile)
  if (logDirectory && !existsSync(logDirectory)) throw new Error(`--log-file 父目录不存在：${logDirectory}`)

  // TASK-CHK-007：结果与清单已写入（写入成功即通过），在写出前计入用例。
  const chk007: CaseResult = passCase('TASK-CHK-007', '结果与 SHA-256 清单写入', `result.json 与 SHA256SUMS 写入 ${outputDir}。`)
  const finalCases = [...allCases.filter((item) => item.caseId !== 'TASK-CHK-007'), chk007]
  const summary = summarizeCases(finalCases)
  const conclusion = computeConclusion(finalCases)
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
      note: '本脚本以仓库开发运行方式核查任务产物；已装安装包嵌入 gitSha 的证明由 W0-SHELL-P 原生窗口验收负责，不属于本门槛。',
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
    selectedModel: selectedModel ?? null,
    fixtureManifest: fixture ?? null,
    jobs: jobs.map((job) => ({ ...job })),
    targetJobId: targetJob?.jobId ?? null,
    cases: finalCases.map((item) => ({
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
    cases: finalCases.map((item) => ({
      caseId: item.caseId, category: item.category, status: item.status, detail: item.detail, blockedReason: item.blockedReason,
    })),
  }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')

  const shaEntries: Array<{ file: string; hash: string }> = [{ file: 'result.json', hash: sha256OfFile(resultFile) }]
  if (options.manualFile && existsSync(options.manualFile)) {
    shaEntries.push({ file: options.manualFile.replace(/\\/gu, '/'), hash: sha256OfFile(options.manualFile) })
  }
  const manifestLines = shaEntries.map((entry) => `${entry.hash}  ${entry.file}`)
  writeFileSync(sha256File, `${manifestLines.join('\n')}\n`, 'utf8')
  const finalResult = {
    ...result,
    artifacts: { ...result.artifacts, sha256: Object.fromEntries(shaEntries.map((entry) => [entry.file, entry.hash])) },
  }
  writeFileSync(resultFile, JSON.stringify(finalResult, null, 2), 'utf8')

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

  if (options.listProfiles) {
    try {
      const profiles = listConfiguredProfiles(options.dbPath)
      const activeProfileId = readPersistedActiveProfileId(options.dbPath)
      if (options.json) console.log(JSON.stringify({ database: options.dbPath, activeProfileId, profiles }, null, 2))
      else console.log(formatProfileListReport(options.dbPath, profiles, activeProfileId))
    } catch (cause) {
      console.error(`配置检查失败：${messageOf(cause)}`)
      process.exitCode = 1
    }
    return
  }

  if (options.dumpManual) {
    try {
      writeManualTemplate(options.dumpManual)
      if (options.json) console.log(JSON.stringify({ dumpedManual: options.dumpManual, caseCount: MANUAL_CASE_DEFINITIONS.length }, null, 2))
      else console.log(`已生成人工 UI 观察回填模板：${options.dumpManual}（${MANUAL_CASE_DEFINITIONS.length} 个用例）`)
    } catch (cause) {
      console.error(`导出人工回填模板失败：${messageOf(cause)}`)
      process.exitCode = 1
    }
    return
  }

  try {
    const root = repositoryRoot()
    const repository = collectRepository(root)
    const environment = collectEnvironment(root)

    let workspace: string | null = options.workspace
    let fixture: FixtureManifest | null = null
    if (!workspace) {
      workspace = join(tmpdir(), `vinkey-task-process-fixture-${Date.now()}`)
      fixture = generateFixtureWorkspace(workspace)
    } else {
      if (!existsSync(workspace)) mkdirSync(workspace, { recursive: true })
      fixture = inspectWorkspace(workspace)
    }

    let selectedModel: SelectedModelSummary | null = null
    let selectedModelError: string | null = null
    try {
      selectedModel = resolveSelectedModel(options.dbPath, options.profileId)
    } catch (cause) {
      selectedModelError = messageOf(cause)
    }

    const scan = scanWorkspace(workspace, options.jobId)
    const jobs = scan.jobs
    const targetJob = scan.targetJob

    const machineCases = runMachineCases({
      repository, environment, selectedModel, workspaceRoot: workspace, jobs, targetJob, selectedModelError,
    })
    const manualCases = mergeManualCases(buildManualCases(), options.manualFile)
    const output = runTaskProcessAcceptance({
      options, repository, environment, fixture, workspaceRoot: workspace, jobs, targetJob, selectedModel, selectedModelError,
      cases: [...machineCases, ...manualCases],
    })
    stderrProgress(output.result.cases as CaseResult[])
    if (options.json) {
      console.log(JSON.stringify(output.result, null, 2))
    } else {
      console.log(stdoutSummary(output))
    }
    process.exitCode = output.exitCode
  } catch (cause) {
    console.error(`长任务/日志中心验收失败：${messageOf(cause)}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_TASK_PROCESS_ACCEPTANCE_CLI === '1') {
  main().catch((cause) => {
    console.error(`长任务/日志中心验收失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
