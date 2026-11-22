#!/usr/bin/env node
// NT-WIN-001~005 桌面原生复验 runner（Windows）。
// 真实 Tauri app + 隔离 fixture + Windows UI Automation；只判定可机器判定的
// 客观子断言，主观/观感保留 BLOCKED 并归总计划 §8.5。
//
// Windows 对应 macOS 的 run-task-process-native-macos.mjs：
//   AX helper (Swift)          -> uia-helper.ps1 (UIAutomation, InvokePattern)
//   CoreGraphics capture       -> capture-win-window.ps1 (BitBlt)
//   pgrep/osascript            -> taskkill / Start-Process
// 目标 app 必须以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--force-renderer-accessibility
// 启动，WebView2 才向 UIA 暴露可访问性树。
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync, writeFileSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '../..')
const localApp = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Vinkey', 'vinkey.exe') : ''
const APP_EXE = process.env.VINKEY_TASK_NATIVE_WIN_APP || localApp || 'C:/Users/Administrator/AppData/Local/Vinkey/vinkey.exe'
const PROCESS_NAME = 'vinkey'
const UIA_HELPER = join(root, 'scripts/task-process/uia-helper.ps1')
const CAPTURE_SCRIPT = join(root, 'scripts/navigation/capture-win-window.ps1')
const OUTPUT_ROOT = resolve(root, process.env.VINKEY_TASK_NATIVE_OUTPUT || 'artifacts/task-process-native')
const SOURCE_CHANGED_MESSAGE = '原文已变化，无法沿用此前进度。请重新发起分析。'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const git = (...args) => {
  try { return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).stdout.trim() } catch { return '' }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

function parseArgs(argv) {
  const o = { driverWorkspace: null, jobId: null, app: APP_EXE, db: null, output: null, dryRun: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--help' || value === '-h') { o.help = true; continue }
    if (value === '--dry-run') { o.dryRun = true; continue }
    const needs = {
      '--driver-workspace': 'driverWorkspace', '--job-id': 'jobId', '--app': 'app',
      '--db': 'db', '--output': 'output',
    }
    if (needs[value]) {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) throw new Error(`选项 ${value} 缺少参数`)
      o[needs[value]] = resolve(next)
      i += 1
      continue
    }
    throw new Error(`未知参数：${value}`)
  }
  return o
}

function usage() {
  return [
    '用法：npm run test:task-process-native-win -- [选项]',
    '  --driver-workspace <path>  真实 Ollama CLI 驱动工作区（含 .vinkey/analysis/jobs/<jobId>/）',
    '  --job-id <id>              指定作业 id（缺省取最新一个）',
    '  --app <exe>                目标 app（默认 %LOCALAPPDATA%\\Vinkey\\vinkey.exe）',
    '  --db <path>                真实 SQLite（只读模型配置/溯源）',
    '  --output <dir>             归档目录',
    '  --dry-run                  只播种与解析参数，不启动 app、不采集 UIA',
    '  --help                     显示帮助',
    '',
    '证据边界：真实 Tauri app + 隔离 fixture + Windows UI Automation（invoke/读文本/读树/读展开态）；',
    '只判定客观子断言，主观/观感保留 BLOCKED 并归 §8.5。非真实用户发起的桌面端到端任务。',
  ].join('\n')
}

function pickJob(workspace, jobId) {
  const jobsRoot = join(workspace, '.vinkey', 'analysis', 'jobs')
  if (!existsSync(jobsRoot)) throw new Error(`驱动工作区无 jobs 目录：${jobsRoot}`)
  const dirs = readdirSync(jobsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
  if (dirs.length === 0) throw new Error(`驱动工作区无作业：${jobsRoot}`)
  const chosen = jobId ?? dirs.sort().at(-1)
  if (!dirs.includes(chosen)) throw new Error(`作业不存在：${chosen}`)
  return { jobDir: join(jobsRoot, chosen), jobId: chosen }
}

/** 从真实 CLI 驱动作业的 worker-events.json 构造 ChatActivity[]（与生产 appendWorkerActivity 同形）。 */
function buildActivityLog(realEvents, jobId) {
  return realEvents.map((event) => ({
    id: `worker:${jobId}:${event.sequence}`,
    segment: event.segment,
    status: event.stage === 'chunking' ? 'fetching' : 'tool_calling',
    message: event.message,
    timestamp: event.sequence,
    completedAt: ['completed', 'failed', 'cancelled'].includes(event.status) ? event.sequence : undefined,
    worker: {
      sequence: event.sequence, jobId, stage: event.stage, status: event.status,
      message: event.message, segment: event.segment,
    },
    artifacts: [], cacheHits: 0, modelRequests: 0,
  }))
}

function writeTaskJobs(fixtureJobDir, jobId, workspaceId, conversationId, realTerminalStatus, sourceFingerprints = {}, instructionHash = 'native-fixture') {
  mkdirSync(fixtureJobDir, { recursive: true })
  const now = Date.now()
  const make = (suffix, status) => ({
    taskId: `${jobId}-${suffix}`, workspaceId, taskType: 'long-text-analysis',
    instructionHash, status, cancelRequested: false,
    sourceFingerprints: { ...sourceFingerprints }, steps: [], events: [], error: null,
    displayTitle: status === 'paused' ? '分析全文人物关系（暂停态样本）' : '分析全文人物关系',
    conversationId, createdAt: now, updatedAt: now,
  })
  const pausedDir = join(fixtureJobDir, `${jobId}-paused`)
  mkdirSync(pausedDir, { recursive: true })
  writeFileSync(join(pausedDir, 'task.json'), JSON.stringify(make('paused', 'paused'), null, 2))
  const runningDir = join(fixtureJobDir, `${jobId}-running`)
  mkdirSync(runningDir, { recursive: true })
  writeFileSync(join(runningDir, 'task.json'), JSON.stringify(make('running', 'running'), null, 2))
}

function killVinkey() {
  spawnSync('taskkill', ['/F', '/IM', 'vinkey.exe', '/T'], { encoding: 'utf8', stdio: 'ignore' })
}

function vinkeyRunning() {
  try {
    const out = spawnSync('powershell', [
      '-NoProfile', '-Command', '(Get-Process -Name vinkey -ErrorAction SilentlyContinue | Measure-Object).Count',
    ], { encoding: 'utf8' }).stdout.trim()
    return Number(out) > 0
  } catch { return false }
}

/** 调用 UIA helper；把 JSON 结果写入 states/ 并返回解析对象。
 *  非 ASCII 参数（会话/按钮中文标题）经 UTF-8 ArgFile 传递，避免 PS 5.1 GBK 命令行污染。 */
function uia(helperBin, outputDir, command, outName, args = [], timeout = 30000) {
  const outPath = join(outputDir, 'states', outName)
  mkdirSync(dirname(outPath), { recursive: true })
  let binary = []
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^-/, '').toLowerCase()
    const value = args[i + 1]
    binary.push([key, value])
  }
  let argFile = null
  if (binary.length > 0) {
    const argObj = {}
    for (const [key, value] of binary) argObj[key] = value
    argFile = join(outputDir, 'states', `.args-${outName.replace(/\.json$/u, '')}.json`)
    writeFileSync(argFile, JSON.stringify(argObj), 'utf8')
  }
  const cmd = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperBin,
    '-Command', command, '-OutJson', outPath,
  ]
  if (argFile) cmd.push('-ArgFile', argFile)
  const result = spawnSync('powershell', cmd, { encoding: 'utf8', timeout })
  try { return JSON.parse(readFileSync(outPath, 'utf8')) } catch {
    return { ok: false, command, exit: result.status, stderr: String(result.stderr || '').slice(0, 200) }
  }
}

/** 窗口级截图（BitBlt），返回相对路径或 null。 */
function capture(outputDir, captureBin, name) {
  const file = join(outputDir, 'screenshots', name)
  mkdirSync(dirname(file), { recursive: true })
  const result = spawnSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', captureBin,
    '-ProcessName', PROCESS_NAME, '-Output', file, '-TimeoutMs', '20000',
  ], { encoding: 'utf8', timeout: 25000 })
  if (result.status === 0 && existsSync(file) && statSync(file).size > 20_000) {
    return join('screenshots', name)
  }
  return null
}

/** 等待窗口渲染（截图探针 > 20KB）。 */
async function waitWindowReady(outputDir, captureBin, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    const probe = join(outputDir, 'states', '.window-probe.png')
    const r = spawnSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', captureBin,
      '-ProcessName', PROCESS_NAME, '-Output', probe, '-TimeoutMs', '12000',
    ], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0 && existsSync(probe) && statSync(probe).size > 20_000) return true
    await sleep(700)
  }
  return false
}

function launchApp(appExe, profile, logFile) {
  const stream = createWriteStream(logFile, { flags: 'a' })
  const env = { ...process.env, VINKEY_ACCEPTANCE_DATA_DIR: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--force-renderer-accessibility' }
  const child = spawn(appExe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.pipe(stream); child.stderr?.pipe(stream)
  return { child, stream }
}

async function stopApp(child, stream, waitedMs = 1500) {
  killVinkey()
  await sleep(Math.min(waitedMs, 1200))
  try { if (child && child.exitCode === null) child.kill() } catch { /* ignore */ }
  try { stream?.end() } catch { /* ignore */ }
}

/** 轮询等待目标按钮出现在 UIA 树中，避免 WebView2 内容尚未渲染时按压落空。 */
async function waitForButton(uiaBin, outputDir, title, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    const tree = uia(uiaBin, outputDir, 'ax-tree', '.wait-button-tree.json')
    const buttons = Array.isArray(tree?.axTree)
      ? tree.axTree.filter((n) => n.role === 'ControlType.Button').map((n) => String(n.title ?? ''))
      : []
    if (buttons.includes(title)) return true
    await sleep(600)
  }
  return false
}

/** NT-WIN-003：修改真实源文件后，在真实 app 上 UIA 点「继续处理」，读回生产后端拒绝结果。 */
async function collectSourceChange({ outputDir, uiaBin, captureBin, jobsRoot, jobId, sourcePath, sourceFile, fingerprintBefore, observation, log }) {
  const pausedJobDir = join(jobsRoot, `${jobId}-paused`)
  const result = {
    documentPath: sourceFile.relativePath, fingerprintBefore, fingerprintAfter: '',
    resumePressed: false, taskStatusAfter: null, failureMessage: null, failureCode: null,
    failureRetryable: null, jobJsonCreated: false, workerOutputCreated: false,
    checkpointReuseEvents: 0, uiMessageVisible: false,
  }
  try {
    const changed = `${readFileSync(sourcePath, 'utf8')}\n\n<!-- NT-WIN-003 source-change probe: resume must reject stale checkpoint -->\n`
    writeFileSync(sourcePath, changed, 'utf8')
    result.fingerprintAfter = sha256(changed)
    log(`sourceChanged doc=${sourceFile.relativePath} ${fingerprintBefore.slice(0, 8)}->${result.fingerprintAfter.slice(0, 8)}`)

    const resumeAppeared = await waitForButton(uiaBin, outputDir, '继续处理')
    log(`resumeButtonAppeared=${resumeAppeared}`)
    const press = uia(uiaBin, outputDir, 'press-ax', 'press-resume-source-change.json', ['role', '*', 'title', '继续处理'])
    result.resumePressed = Boolean(press?.pressAx?.ok)
    log(`resumePressed=${result.resumePressed}`)
    if (!result.resumePressed) observation.errors.push('NT-WIN-003: 未读到「继续处理」按钮的 UIA 按压回执')

    const taskPath = join(pausedJobDir, 'task.json')
    for (let i = 0; i < 24; i += 1) {
      const task = existsSync(taskPath) ? JSON.parse(readFileSync(taskPath, 'utf8')) : null
      if (task?.status === 'failed' || task?.status === 'running') {
        result.taskStatusAfter = task.status
        result.failureMessage = task.error ?? task.failure?.message ?? null
        result.failureCode = task.failure?.code ?? null
        result.failureRetryable = typeof task.failure?.retryable === 'boolean' ? task.failure.retryable : null
        if (task.status === 'failed') break
      }
      await sleep(500)
    }
    const eventsPath = join(pausedJobDir, 'worker-events.json')
    const raw = existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, 'utf8')) : []
    const events = Array.isArray(raw) ? raw : (raw.events ?? [])
    result.checkpointReuseEvents = events.filter((event) => event?.cacheSource === 'checkpoint').length
    result.jobJsonCreated = existsSync(join(pausedJobDir, 'job.json'))
    result.workerOutputCreated = existsSync(join(pausedJobDir, 'worker-output.json'))

    const texts = uia(uiaBin, outputDir, 'texts', 'texts-source-change.json', ['limit', '500'])
    const tree = uia(uiaBin, outputDir, 'ax-tree', 'ax-tree-source-change.json')
    const visible = [
      ...(Array.isArray(texts?.texts) ? texts.texts.map((t) => String(t)) : []),
      ...(Array.isArray(tree?.axTree) ? tree.axTree.filter((n) => n.role === 'ControlType.Button').map((n) => String(n.title ?? '')) : []),
    ].join('\n')
    result.uiMessageVisible = visible.includes(SOURCE_CHANGED_MESSAGE)
    const shot = capture(outputDir, captureBin, '05-source-change-rejected.png')
    if (shot) observation.screenshots.push(shot)
    log(`sourceChangeResult status=${result.taskStatusAfter} cp35=${result.uiMessageVisible} code=${result.failureCode ?? 'null'}`)
  } catch (error) {
    observation.errors.push(`NT-WIN-003 采集失败：${(error && error.message) || error}`)
  }
  observation.sourceChange = result
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { console.log(usage()); return }
  if (process.platform !== 'win32') {
    console.error('本 runner 仅支持 Windows（UIAutomation + Win32）。')
    process.exitCode = 2
    return
  }
  if (!existsSync(options.app)) {
    console.error(`未找到目标 app：${options.app}`)
    process.exitCode = 2
    return
  }
  for (const helper of [UIA_HELPER, CAPTURE_SCRIPT]) {
    if (!existsSync(helper)) { console.error(`缺少辅助脚本：${helper}`); process.exitCode = 2; return }
  }

  const { jobDir, jobId } = pickJob(options.driverWorkspace, options.jobId)
  const headSha = git('rev-parse', 'HEAD')
  const dirty = Boolean(git('status', '--porcelain'))
  const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version) ?? '0.0.0'
  const outputDir = options.output ?? join(OUTPUT_ROOT, `${stamp()}-win32`)
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(join(outputDir, 'states'), { recursive: true })
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true })

  const logLines = []
  const log = (line) => { logLines.push(`[${new Date().toISOString()}] ${line}`) }
  log(`jobId=${jobId} headSha=${headSha.slice(0, 12)} dirty=${dirty} app=${basename(options.app)}`)

  const rawEvents = existsSync(join(jobDir, 'worker-events.json')) ? JSON.parse(readFileSync(join(jobDir, 'worker-events.json'), 'utf8')) : []
  const realEvents = (Array.isArray(rawEvents) ? rawEvents : rawEvents.events ?? []).map((e) => ({
    sequence: Number(e.sequence ?? 0), stage: String(e.stage ?? ''), status: String(e.status ?? ''),
    message: String(e.message ?? ''), segment: e.segment
      ? { id: String(e.segment.id ?? ''), label: String(e.segment.label ?? ''), startedAt: e.segment.startedAt, endedAt: e.segment.endedAt }
      : null,
  }))
  let terminalStatus = 'completed'
  const jobJson = join(jobDir, 'job.json')
  if (existsSync(jobJson)) terminalStatus = String(JSON.parse(readFileSync(jobJson, 'utf8')).status ?? terminalStatus)
  log(`realEvents=${realEvents.length} terminal=${terminalStatus}`)

  // 生成隔离 fixture（复用导航验收的 fixture 生成器），再播种任务与轨迹。
  const tempDir = join(tmpdir(), `vinkey-native-win-${stamp()}`)
  mkdirSync(tempDir, { recursive: true })
  const bundleEntry = join(tempDir, 'navigation-fixture-lib.mjs')
  await build({ entryPoints: [join(root, 'scripts/navigation/navigation-acceptance.ts')], outfile: bundleEntry, bundle: true, platform: 'node', format: 'esm', target: 'node22' })
  const fixtureLib = await import('file://' + bundleEntry.replaceAll('\\', '/'))
  const fixtureRoot = join(outputDir, 'fixture')
  const manifest = fixtureLib.generateFixture(fixtureRoot)
  const profile = join(fixtureRoot, 'app-data')
  writeFileSync(join(outputDir, 'fixture-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  const { DatabaseSync } = await import('node:sqlite')
  let activeId = null
  try {
    const db = new DatabaseSync(manifest.dbPath, { readOnly: true })
    try { activeId = db.prepare('SELECT active_id AS id FROM project_selection WHERE singleton = 1').get()?.id ?? null }
    finally { db.close() }
  } catch { /* fallback to first project */ }
  const project = manifest.projects.find((p) => p.id === activeId) ?? manifest.projects[0]
  if (!project) throw new Error('fixture 未生成任何项目')
  log(`activeProject=${project.name} id=${project.id}`)
  const jobsRoot = join(project.root, '.vinkey', 'analysis', 'jobs')
  const conversationId = project.conversations[0]?.id ?? 'conv-native'
  const sourceFile = (project.files ?? []).find((file) => /\.md$/iu.test(file.relativePath)) ?? project.files?.[0]
  if (!sourceFile) throw new Error('fixture 活动项目无可用源文件，无法执行 NT-WIN-003')
  const sourcePath = join(project.root, sourceFile.relativePath)
  const sourceFingerprintBefore = sha256(readFileSync(sourcePath, 'utf8'))
  const driverSnapshot = existsSync(join(jobDir, 'worker-input.json')) ? JSON.parse(readFileSync(join(jobDir, 'worker-input.json'), 'utf8')) : null
  const instructionHash = String(driverSnapshot?.input?.instructionHash ?? 'native-fixture')
  writeTaskJobs(jobsRoot, jobId, project.id, conversationId, terminalStatus,
    { [sourceFile.relativePath]: sourceFingerprintBefore }, instructionHash)

  const canonicalJobDir = join(jobsRoot, jobId)
  mkdirSync(canonicalJobDir, { recursive: true })
  for (const name of ['worker-events.json', 'worker-output.json', 'job.json']) {
    const src = join(jobDir, name)
    if (existsSync(src)) copyFileSync(src, join(canonicalJobDir, name))
  }
  const pausedJobId = `${jobId}-paused`
  if (driverSnapshot) {
    const snapshot = JSON.parse(JSON.stringify(driverSnapshot))
    snapshot.workspaceId = project.id
    snapshot.input.jobId = pausedJobId
    snapshot.input.conversationId = conversationId
    snapshot.input.instructionHash = instructionHash
    snapshot.input.documents = [{ path: sourceFile.relativePath, sourceFingerprint: sourceFingerprintBefore }]
    snapshot.input.dispatch = { ...(snapshot.input.dispatch ?? {}), jobId: pausedJobId, workspaceId: project.id }
    writeFileSync(join(jobsRoot, pausedJobId, 'worker-input.json'), JSON.stringify(snapshot, null, 2), 'utf8')
  }
  log(`sourceChangeSeed=${sourceFile.relativePath} fingerprint=${sourceFingerprintBefore.slice(0, 12)}`)

  // Windows 失真修正：真实 app 通过 workspace_from_root(canonicalize()) 把工作区
  // root 以 \\?\ 前缀写入 projects 表；generateFixture 写的是普通路径。resume 时
  // resolve_existing 用 canonicalize 结果做 starts_with(root) 校验，普通路径会被
  // 「路径超出已授权工作区」提前拦截，使 NT-WIN-003 无法到达指纹复核。这里把
  // fixture 的 root 更新为 canonicalize 形式，贴近真实 app 行为（不改 project id）。
  {
    const mainDb = new DatabaseSync(manifest.dbPath)
    try {
      const rows = mainDb.prepare('SELECT id, root FROM projects').all()
      for (const row of rows) {
        const canonical = `\\\\?\\${String(row.root).replace(/\//gu, '\\')}`
        mainDb.prepare('UPDATE projects SET root = ? WHERE id = ?').run(canonical, row.id)
      }
      log(`canonicalized project roots (${rows.length}) to \\\\?\\ form for Windows policy check`)
    } finally { mainDb.close() }
  }

  const recordPath = (manifest.dbSummary?.projectRecords ?? []).find((r) => r.projectId === project.id)?.path
  if (recordPath && project.conversations[0]) {
    const database = new DatabaseSync(recordPath)
    try {
      const activityLog = buildActivityLog(realEvents, jobId)
      const convId = project.conversations[0].id
      const row = database.prepare('SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(convId)
      if (row) {
        database.prepare('UPDATE messages SET activity_log = ?, task_ref = ? WHERE id = ? AND conversation_id = ?')
          .run(JSON.stringify(activityLog), JSON.stringify({ taskId: `${jobId}-paused`, workspaceId: project.id }), row.id, convId)
        log(`seeded activity_log events=${activityLog.length} into conv=${convId}`)
      } else {
        log('WARN: 未能播种 activity_log（会话无消息）')
      }
    } finally { database.close() }
  }

  const observation = {
    launched: false, windowReady: false, axTextCount: 0, axTexts: [], axNodeCount: 0, axButtonTitles: [],
    segmentExpanded: null, screenshots: [], realEvents, realTerminalStatus: terminalStatus,
    collapsePress: null, expandPress: null, restartTextsBefore: [], restartTextsAfter: [],
    restartSucceeded: false, sourceChange: null, errors: [],
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true, jobId, outputDir, project: { id: project.id, root: project.root, name: project.name },
      realEventCount: realEvents.length, terminalStatus, seededJobs: readdirSync(jobsRoot),
      sourceChangeSeed: sourceFile.relativePath,
      note: '只完成参数解析与 fixture 播种，未启动 app、未采集 UIA。',
    }, null, 2))
    return
  }

  if (vinkeyRunning()) {
    observation.errors.push('已有 vinkey 进程运行，请先退出后重试')
    console.error('已有 vinkey 进程运行，请先退出后重试。')
    await finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines)
    return
  }

  let firstRun = null
  try {
    firstRun = launchApp(options.app, profile, join(outputDir, 'app-runtime-first.log'))
    observation.launched = true
    log('app launched with isolated profile + force-renderer-accessibility')
    const ready = await waitWindowReady(outputDir, CAPTURE_SCRIPT)
    observation.windowReady = ready
    log(`windowReady=${ready}`)
    if (!ready) observation.errors.push('目标应用窗口在 30 次探测内未出现')

    if (ready) {
      await sleep(1200)
      uia(UIA_HELPER, outputDir, 'activate', 'activate-first.json')
      await sleep(900)

      const conv = project.conversations[0]
      if (conv) {
        const buttonTitle = `${conv.title} ${conv.messageCount} 条消息`
        const appeared = await waitForButton(UIA_HELPER, outputDir, buttonTitle)
        log(`openConversation buttonAppeared=${appeared} title=${buttonTitle}`)
        const opened = uia(UIA_HELPER, outputDir, 'press-ax', 'press-conversation.json', ['role', '*', 'title', buttonTitle])
        log(`openConversation ok=${Boolean(opened?.pressAx?.ok)}`)
        await sleep(2000)
      }
      const shot0 = capture(outputDir, CAPTURE_SCRIPT, '00-conversation-open.png')
      if (shot0) observation.screenshots.push(shot0)

      const texts = uia(UIA_HELPER, outputDir, 'texts', 'texts-initial.json', ['limit', '500'])
      observation.axTexts = Array.isArray(texts?.texts) ? texts.texts.map((t) => String(t)) : []
      observation.axTextCount = observation.axTexts.length
      const tree = uia(UIA_HELPER, outputDir, 'ax-tree', 'ax-tree-initial.json')
      const nodes = Array.isArray(tree?.axTree) ? tree.axTree : []
      observation.axNodeCount = nodes.length
      observation.axButtonTitles = nodes.filter((n) => n.role === 'ControlType.Button').map((n) => String(n.title ?? '')).filter(Boolean)
      const shot1 = capture(outputDir, CAPTURE_SCRIPT, '01-initial.png')
      if (shot1) observation.screenshots.push(shot1)
      log(`axTexts=${observation.axTextCount} axNodes=${observation.axNodeCount} buttons=${observation.axButtonTitles.length}`)

      const expanded = nodes.filter((n) => n.role === 'ControlType.Button' && /条记录/.test(String(n.title ?? '')))
        .map((n) => n.expanded === 'Expanded')
      observation.segmentExpanded = expanded.length > 0 ? expanded : null

      await waitForButton(UIA_HELPER, outputDir, '收起全部过程')
      const collapse = uia(UIA_HELPER, outputDir, 'press-ax', 'press-collapse.json', ['role', '*', 'title', '收起全部过程'])
      observation.collapsePress = { ok: Boolean(collapse?.pressAx?.ok) }
      await sleep(500)
      const shot2 = capture(outputDir, CAPTURE_SCRIPT, '02-collapsed.png')
      if (shot2) observation.screenshots.push(shot2)
      const expand = uia(UIA_HELPER, outputDir, 'press-ax', 'press-expand.json', ['role', '*', 'title', '展开全部过程'])
      observation.expandPress = { ok: Boolean(expand?.pressAx?.ok) }
      await sleep(500)
      const shot3 = capture(outputDir, CAPTURE_SCRIPT, '03-expanded.png')
      if (shot3) observation.screenshots.push(shot3)

      observation.restartTextsBefore = [...observation.axTexts, ...observation.axButtonTitles]
    }
  } finally {
    await stopApp(firstRun?.child, firstRun?.stream)
  }

  // 重启：同一数据目录，验证历史恢复。
  let relaunch = null
  if (observation.windowReady) {
    try {
      relaunch = launchApp(options.app, profile, join(outputDir, 'app-runtime-restart.log'))
      await sleep(3500)
      const ready2 = await waitWindowReady(outputDir, CAPTURE_SCRIPT, 20)
      if (ready2) {
        observation.restartSucceeded = true
        const shot4 = capture(outputDir, CAPTURE_SCRIPT, '04-restarted.png')
        if (shot4) observation.screenshots.push(shot4)
        uia(UIA_HELPER, outputDir, 'activate', 'activate-restart.json')
        await sleep(900)
        const conv = project.conversations[0]
        if (conv) {
          const buttonTitle = `${conv.title} ${conv.messageCount} 条消息`
          await waitForButton(UIA_HELPER, outputDir, buttonTitle)
          uia(UIA_HELPER, outputDir, 'press-ax', 'press-conversation-after-restart.json', ['role', '*', 'title', buttonTitle])
          await sleep(2000)
        }
        const textsAfter = uia(UIA_HELPER, outputDir, 'texts', 'texts-after-restart.json', ['limit', '500'])
        const treeAfter = uia(UIA_HELPER, outputDir, 'ax-tree', 'ax-tree-after-restart.json')
        const afterTexts = Array.isArray(textsAfter?.texts) ? textsAfter.texts.map((t) => String(t)) : []
        const afterButtons = (Array.isArray(treeAfter?.axTree) ? treeAfter.axTree : [])
          .filter((n) => n.role === 'ControlType.Button').map((n) => String(n.title ?? '')).filter(Boolean)
        observation.restartTextsAfter = [...afterTexts, ...afterButtons]
        log(`restart textsAfter=${afterTexts.length} buttonsAfter=${afterButtons.length}`)
        await collectSourceChange({
          outputDir, uiaBin: UIA_HELPER, captureBin: CAPTURE_SCRIPT, jobsRoot, jobId,
          sourcePath, sourceFile, fingerprintBefore: sourceFingerprintBefore, observation, log,
        })
      } else {
        observation.errors.push('重启后窗口未渲染')
      }
    } finally {
      await stopApp(relaunch?.child, relaunch?.stream)
    }
  }

  await finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines)
}

async function finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines) {
  writeFileSync(join(outputDir, 'observation.json'), JSON.stringify(observation, null, 2), 'utf8')
  writeFileSync(join(outputDir, 'automation.log'), logLines.join('\n') + '\n', 'utf8')
  const bundle = join(tmpdir(), `vinkey-native-win-accept-${stamp()}.mjs`)
  await build({ entryPoints: [join(root, 'scripts/task-process/task-process-native-acceptance.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22' })
  const mod = await import('file://' + bundle.replaceAll('\\', '/'))
  const output = mod.assembleNativeResult({
    observation,
    repository: { gitSha: headSha || null, dirty, version },
    application: {
      path: basename(options.app), installPathRedacted: true, processName: PROCESS_NAME,
      provenanceNote: '目标 app 由外部按最终 HEAD 构建；本 runner 以隔离 fixture 驱动，不重算 appSha。',
      uiaForceRendererAccessibility: true,
    },
    sourceBatch: { driverWorkspace: options.driverWorkspace, jobId },
    outputDir,
    platform: 'win32',
    platformTaskPrefix: 'NT-WIN',
    platformTasks: ['NT-WIN-001', 'NT-WIN-002', 'NT-WIN-003', 'NT-WIN-004', 'NT-WIN-005'],
    evidenceBoundaryText: {
      fixture: '真实 Tauri app + 隔离数据目录 + fixture 项目；暂停态为播种前置条件',
      interaction: 'Windows UI Automation（uia-helper.ps1：texts/ax-tree/press-ax/activate，InvokePattern 按压）',
      screenshots: 'Win32 BitBlt 按窗口边界采集（capture-win-window.ps1）',
      events: '真实 Ollama CLI 驱动作业产物，非新造事件',
      sourceChange: '修改真实源文件后，在真实 app 中 UIA 点击「继续处理」，由生产后端复核指纹并拒绝；脚本只读回结果',
      notProven: '非真实用户发起的初始端到端任务；暂停恢复后的新段推进、观感与易理解性仍归 §8.5',
    },
  })
  console.log([
    `${mod.SUITE_ID} native acceptance (Windows): ${output.result.decision.overallConclusion} (${output.summary.passed}/${output.summary.caseCount} passed, ${output.summary.failed} failed, ${output.summary.blocked} blocked; specialityPass=${output.result.decision.specialityPass})`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.conclusion === 'FAIL' ? 2 : 0}`,
  ].join('\n'))
  process.exitCode = output.conclusion === 'FAIL' ? 2 : 0
}

main().catch((error) => {
  console.error(`runner 失败：${(error && error.message) || error}`)
  process.exitCode = 1
})
