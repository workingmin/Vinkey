import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

// W4-TASK-E / UI-ACC-LOGS-001 前置驱动：
// 用真实 Ollama 模型执行生产长文本 Worker pipeline，产出真实
// .vinkey/analysis/jobs/<jobId>/ 产物，供只读验收脚本核查。
//
// 证据边界：CLI 发起、非桌面 UI 发起；不证明桌面暂停/停止/折叠/预览/重启行为。

const [majorVersion, minorVersion] = process.versions.node.split('.').map(Number)
if (!Number.isInteger(majorVersion) || majorVersion < 22 || (majorVersion === 22 && minorVersion < 5)) {
  console.error(`真实 Ollama Worker 驱动需要 Node.js 22.5 或更高版本；当前为 ${process.version}。`)
  process.exit(1)
}

const root = resolve(import.meta.dirname, '../..')
const crateDirectory = join(root, 'scripts', 'task-process', 'ollama-worker-cli')
const crateManifest = join(crateDirectory, 'Cargo.toml')
const binary = join(
  crateDirectory,
  'target',
  'debug',
  process.platform === 'win32' ? 'vinkey-ollama-worker-cli.exe' : 'vinkey-ollama-worker-cli',
)

function usage() {
  return `Vinkey 长任务真实 Ollama CLI 驱动（W4-TASK-E 前置）

用法：
  npm run test:task-process-ollama-driver -- [选项]

参数：
  --workspace <dir>      工作区根目录；默认在 artifacts/task-process-acceptance/ 下新建独立目录
  --job-id <id>          任务 ID；默认由 Rust 驱动生成 cli-ollama-<毫秒时间戳>
  --db <path>            只读 Vinkey SQLite；默认取当前系统应用数据目录
  --profile-id <id>      模型 profile ID；默认读 activeModelId
  --base-url <url>       Ollama 服务地址；默认读模型 connection
  --model <name>         Ollama 模型名；默认读模型 profile
  --context-window <n>   上下文窗口；默认读模型 profile
  --instruction <text>   分析任务指令
  --timeout-secs <n>     整任务等待上限，默认 900
  --request-timeout-secs <n> 单次模型请求超时，默认 180
  --output <path>        driver-summary.json 输出路径
  --dry-run              只输出解析后的模型配置与驱动参数，不编译/不调用模型
  -h, --help             显示帮助

 证据边界：复用生产 worker_service.rs pipeline 与持久化代码，仅替换桌面事件传输
      与模型传输；模型传输为真实 Ollama HTTP，非 stub。分析由 CLI 发起，
      非桌面 UI 发起，不证明桌面暂停/停止/折叠/预览/重启恢复行为。
 说明：模型参数默认从真实 Vinkey 数据库的当前模型读取，保证与桌面端配置一致；
      驱动只读取数据库，不写入用户数据。每次运行使用全新工作区，避免生产
      pipeline 的 map 缓存/检查点复用导致「零模型调用」的伪证据。`
}

function defaultDatabasePath() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'com.vinkey.desktop', 'vinkey.sqlite3')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) throw new Error('无法确定 Windows APPDATA，请使用 --db 显式指定 vinkey.sqlite3。')
    return join(appData, 'com.vinkey.desktop', 'vinkey.sqlite3')
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'com.vinkey.desktop', 'vinkey.sqlite3')
}

function parseArguments(values) {
  const options = {
    workspace: null,
    jobId: null,
    dbPath: defaultDatabasePath(),
    profileId: null,
    baseUrl: null,
    model: null,
    contextWindow: null,
    instruction: '概括正文中的关键事实，并逐条保留原文证据。',
    timeoutSecs: '900',
    requestTimeoutSecs: '180',
    output: null,
    dryRun: false,
    help: false,
  }
  const flags = new Set([
    '--workspace', '--job-id', '--db', '--profile-id', '--base-url', '--model',
    '--context-window', '--instruction', '--timeout-secs', '--request-timeout-secs', '--output',
  ])
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index]
    if (flag === '-h' || flag === '--help') { options.help = true; continue }
    if (flag === '--dry-run') { options.dryRun = true; continue }
    if (!flags.has(flag)) throw new Error(`未知参数 ${flag}。`)
    const value = values[index + 1]
    if (!value) throw new Error(`参数 ${flag} 缺少值。`)
    index += 1
    if (flag === '--workspace') options.workspace = resolve(value)
    if (flag === '--job-id') options.jobId = value
    if (flag === '--db') options.dbPath = resolve(value)
    if (flag === '--profile-id') options.profileId = value
    if (flag === '--base-url') options.baseUrl = value
    if (flag === '--model') options.model = value
    if (flag === '--context-window') options.contextWindow = value
    if (flag === '--instruction') options.instruction = value
    if (flag === '--timeout-secs') options.timeoutSecs = value
    if (flag === '--request-timeout-secs') options.requestTimeoutSecs = value
    if (flag === '--output') options.output = resolve(value)
  }
  return options
}

function readDatabaseModel(dbPath, requestedProfileId) {
  if (!existsSync(dbPath)) return { profile: null, reason: `未找到 Vinkey 数据库：${dbPath}` }
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const profileId = requestedProfileId
      ?? (database.prepare('SELECT value FROM app_preferences WHERE key = ?').get('activeModelId')?.value ?? null)
    if (!profileId) return { profile: null, reason: '数据库中没有 activeModelId，请用 --profile-id 指定。' }
    const row = database.prepare(`
      SELECT p.id AS profileId, p.model AS model, p.context_window AS contextWindow,
             c.kind AS connectionKind, c.base_url AS baseUrl
      FROM model_profiles p
      LEFT JOIN model_profile_connections pc ON pc.profile_id = p.id
      LEFT JOIN model_connections c ON c.id = pc.connection_id
      WHERE p.id = ? LIMIT 1
    `).get(profileId)
    if (!row) return { profile: null, reason: `数据库中找不到模型 profile：${profileId}` }
    if (!row.baseUrl) return { profile: null, reason: `模型 profile ${profileId} 缺少 connection。` }
    return {
      profile: {
        profileId: String(row.profileId),
        model: String(row.model),
        contextWindow: Number(row.contextWindow),
        connectionKind: String(row.connectionKind ?? 'ollama'),
        baseUrl: String(row.baseUrl),
      },
      reason: null,
    }
  } finally {
    database.close()
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) throw new Error(`${label} 启动失败：${result.error.message}`)
  return result
}

const options = parseArguments(process.argv.slice(2))
if (options.help) {
  console.log(usage())
  process.exit(0)
}

const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
const workspace = options.workspace
  ?? join(root, 'artifacts', 'task-process-acceptance', `workspace-ollama-cli-${timestamp}`)

const { profile, reason } = readDatabaseModel(options.dbPath, options.profileId)
if (!profile) {
  console.error(`无法从真实 Vinkey 数据库解析模型配置：${reason}`)
  process.exit(1)
}

const model = options.model ?? profile.model
const baseUrl = options.baseUrl ?? profile.baseUrl
const contextWindow = options.contextWindow ?? String(profile.contextWindow)

const buildResult = run('cargo', ['build', '--quiet', '--manifest-path', crateManifest], 'cargo build')
if (buildResult.status !== 0) {
  console.error(buildResult.stderr || buildResult.stdout || 'cargo build 失败')
  process.exit(buildResult.status ?? 1)
}

const driverArguments = [
  '--workspace', workspace,
  '--document', 'sample.md',
  '--write-sample',
  '--instruction', options.instruction,
  '--profile-id', profile.profileId,
  '--base-url', baseUrl,
  '--model', model,
  '--context-window', contextWindow,
  '--timeout-secs', options.timeoutSecs,
  '--request-timeout-secs', options.requestTimeoutSecs,
]
if (options.jobId) driverArguments.push('--job-id', options.jobId)

if (options.dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    workspace,
    driver: binary,
    driverArguments,
    databaseModel: {
      profileId: profile.profileId,
      model: profile.model,
      contextWindow: profile.contextWindow,
      connectionKind: profile.connectionKind,
      baseUrl: profile.baseUrl,
    },
    resolved: { model, baseUrl, contextWindow },
    note: '只解析参数，未编译、未创建工作区、未调用模型。',
  }, null, 2))
  process.exit(0)
}

mkdirSync(workspace, { recursive: true })
console.error(`[ollama-worker-cli] 模型=${model} ｜ 服务=${baseUrl} ｜ profile=${profile.profileId} ｜ ctx=${contextWindow}`)
console.error(`[ollama-worker-cli] 工作区=${workspace}`)
const driver = run(binary, driverArguments, 'CLI 驱动')
if (driver.stderr) process.stderr.write(driver.stderr)
if (driver.status !== 0) {
  console.error(driver.stdout || 'CLI 驱动未产生 summary。')
  process.exit(driver.status ?? 2)
}

let summary
try {
  summary = JSON.parse(driver.stdout)
} catch (cause) {
  console.error(`CLI 驱动 stdout 不是合法 JSON：${cause.message}`)
  console.error(driver.stdout.slice(0, 4000))
  process.exit(2)
}

summary.wrapper = {
  name: 'run-ollama-worker-cli.mjs',
  database: options.dbPath,
  databaseModel: {
    profileId: profile.profileId,
    model: profile.model,
    contextWindow: profile.contextWindow,
    connectionKind: profile.connectionKind,
    baseUrl: profile.baseUrl,
  },
  overrides: {
    model: options.model,
    baseUrl: options.baseUrl,
    contextWindow: options.contextWindow,
  },
  note: '模型配置只读取自真实 Vinkey SQLite；CLI 驱动使用真实 Ollama HTTP，非 stub。',
}

const outputFile = options.output
  ?? join(root, 'artifacts', 'task-process-acceptance', `driver-${timestamp}`, 'driver-summary.json')
mkdirSync(dirname(outputFile), { recursive: true })
writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({
  status: summary.status,
  jobId: summary.jobId,
  workspace: summary.workspace,
  jobRoot: summary.jobRoot,
  eventCount: summary.eventCount,
  modelInvocationCount: summary.workerOutput?.modelInvocationCount ?? null,
  requiredArtifactsPresent: summary.requiredArtifactsPresent,
  driverSummary: outputFile,
}, null, 2))
