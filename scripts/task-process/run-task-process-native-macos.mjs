#!/usr/bin/env node
// NT-MAC-001~005 桌面原生复验 runner（macOS）。
// 真实 Tauri app + 隔离 fixture + AX 原生自动化；只判定可机器判定的客观子断言，
// 主观/观感保留 BLOCKED 并归总计划 §8.5。详见 task-process-native-acceptance.ts。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

const APP_PATH = process.env.VINKEY_TASK_NATIVE_APP || '/Applications/Vinkey.app'
const APP_BIN = join(APP_PATH, 'Contents/MacOS/vinkey')
const BUNDLE_ID = 'com.vinkey.desktop'
const PROCESS_NAME = 'Vinkey'
const CAPTURE_HELPER = process.env.VINKEY_CAPTURE_HELPER || join(root, 'artifacts/ui-shell-native-macos/bin/vinkey-capture-helper')
const HELPER_SRC = join(root, 'scripts/title-bar/menu-ax-helper.swift')
const OUTPUT_ROOT = resolve(root, process.env.VINKEY_TASK_NATIVE_OUTPUT || 'artifacts/task-process-native')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const git = (...args) => {
  try { return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).stdout.trim() } catch { return '' }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

function parseArgs(argv) {
  const o = {
    driverWorkspace: null, jobId: null, app: APP_PATH, db: null,
    output: null, dryRun: false, help: false,
  }
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
      o[needs[value]] = resolve(next.startsWith('/') || next.startsWith('./') || next.startsWith('../') ? next : join(process.cwd(), next))
      i += 1
      continue
    }
    throw new Error(`未知参数：${value}`)
  }
  return o
}

function usage() {
  return [
    '用法：node scripts/task-process/run-task-process-native-macos.mjs [选项]',
    '  --driver-workspace <path>  真实 Ollama CLI 驱动工作区（含 .vinkey/analysis/jobs/<jobId>/）',
    '  --job-id <id>              指定作业 id（缺省取最新一个）',
    '  --app <path>               目标 app（默认 /Applications/Vinkey.app）',
    '  --db <path>                真实 SQLite（只读模型配置/溯源）',
    '  --output <dir>             归档目录',
    '  --dry-run                  只播种与解析参数，不启动 app、不采集 AX',
    '  --help                     显示帮助',
    '',
    '证据边界：真实 Tauri app + 隔离 fixture + AX 原生自动化；只判定客观子断言，',
    '主观/观感保留 BLOCKED 并归 §8.5。非真实用户发起的桌面端到端任务。',
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

/** 用 node:sqlite 直接把 activity_log 播种进 fixture 会话，使真实 app 渲染过程轨迹。 */
function seedActivityLog(database, conversationId, messageId, activityLog, taskRef) {
  if (!conversationId || !messageId) return false
  const stmt = database.prepare('UPDATE messages SET activity_log = ?, task_ref = ? WHERE id = ? AND conversation_id = ?')
  stmt.run(JSON.stringify(activityLog), taskRef ? JSON.stringify(taskRef) : null, messageId, conversationId)
  return true
}

function buildActivityLog(realEvents, jobId) {
  // 直接按 appendWorkerActivity 的形状构造 ChatActivity[]，不调用模型。
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

function writeTaskJobs(fixtureJobDir, jobId, workspaceId, conversationId, realTerminalStatus) {
  mkdirSync(fixtureJobDir, { recursive: true })
  const now = Date.now()
  const make = (suffix, status) => ({
    taskId: `${jobId}-${suffix}`, workspaceId, taskType: 'long-text-analysis',
    instructionHash: 'native-fixture', status, cancelRequested: false,
    sourceFingerprints: {}, steps: [], events: [], error: null,
    displayTitle: status === 'paused' ? '分析全文人物关系（暂停态样本）' : '分析全文人物关系',
    conversationId, createdAt: now, updatedAt: now,
  })
  // paused 任务不会被 restore_running() 自动恢复，稳定显示「继续处理」；
  // running 任务不写 worker-input.json，避免被 startup 恢复逻辑改成 failed。
  const pausedDir = join(fixtureJobDir, `${jobId}-paused`)
  mkdirSync(pausedDir, { recursive: true })
  writeFileSync(join(pausedDir, 'task.json'), JSON.stringify(make('paused', 'paused'), null, 2))
  const runningDir = join(fixtureJobDir, `${jobId}-running`)
  mkdirSync(runningDir, { recursive: true })
  writeFileSync(join(runningDir, 'task.json'), JSON.stringify(make('running', 'running'), null, 2))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { console.log(usage()); return }
  if (process.platform !== 'darwin') {
    console.error('本 runner 仅支持 macOS（AX + CoreGraphics）。')
    process.exitCode = 2
    return
  }

  const { jobDir, jobId } = pickJob(options.driverWorkspace, options.jobId)
  const headSha = git('rev-parse', 'HEAD')
  const dirty = Boolean(git('status', '--porcelain'))
  const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version) ?? '0.0.0'
  const outputDir = options.output ?? join(OUTPUT_ROOT, `${stamp()}-macos`)
  mkdirSync(outputDir, { recursive: true })
  // 截图探针直接写入 states/ 与 screenshots/，须先建目录（capture() 内部才建目录，探针在它之前）。
  mkdirSync(join(outputDir, 'states'), { recursive: true })
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true })

  const logLines = []
  const log = (line) => { logLines.push(`[${new Date().toISOString()}] ${line}`) }
  log(`jobId=${jobId} headSha=${headSha.slice(0, 12)} dirty=${dirty}`)

  // 读取真实事件（只读，不造事件）。
  const eventsFile = join(jobDir, 'worker-events.json')
  const rawEvents = existsSync(eventsFile) ? JSON.parse(readFileSync(eventsFile, 'utf8')) : []
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
  const { build } = await import('esbuild')
  const bundleEntry = join(tmpdir(), `vinkey-native-fixture-${stamp()}.mjs`)
  await build({
    entryPoints: [join(root, 'scripts/navigation/navigation-acceptance.ts')],
    outfile: bundleEntry, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  })
  const fixtureLib = await import('file://' + bundleEntry)
  const fixtureRoot = join(outputDir, 'fixture')
  const manifest = fixtureLib.generateFixture(fixtureRoot)
  const profile = join(fixtureRoot, 'app-data')
  writeFileSync(join(outputDir, 'fixture-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // app 启动后默认选中 project_selection.active_id 的项目；必须播种到该活动项目，
  // 否则任务与过程轨迹在 project-b 打开时不可见（AX 文本里只有欢迎页）。
  const { DatabaseSync } = await import('node:sqlite')
  let activeId = null
  try {
    const db = new DatabaseSync(manifest.dbPath, { readOnly: true })
    try { activeId = db.prepare('SELECT active_id AS id FROM project_selection WHERE singleton = 1').get()?.id ?? null }
    finally { db.close() }
  } catch { /* 回退到第一个项目 */ }
  const project = manifest.projects.find((p) => p.id === activeId) ?? manifest.projects[0]
  if (!project) throw new Error('fixture 未生成任何项目')
  log(`activeProject=${project.name} id=${project.id}`)
  const jobsRoot = join(project.root, '.vinkey', 'analysis', 'jobs')
  writeTaskJobs(jobsRoot, jobId, project.id, project.conversations[0]?.id ?? 'conv-native', terminalStatus)
  // 复制真实产物作为过程轨迹证据（不复制 worker-input.json，避免启动恢复）。
  const canonicalJobDir = join(jobsRoot, jobId)
  mkdirSync(canonicalJobDir, { recursive: true })
  for (const name of ['worker-events.json', 'worker-output.json', 'job.json']) {
    const src = join(jobDir, name)
    if (existsSync(src)) copyFileSync(src, join(canonicalJobDir, name))
  }
  // 把真实事件轨迹播种进首个会话的消息，令真实 app 渲染「处理过程」。
  const recordPath = (manifest.dbSummary?.projectRecords ?? []).find((r) => r.projectId === project.id)?.path
  if (recordPath && project.conversations[0]) {
    const database = new DatabaseSync(recordPath)
    try {
      const activityLog = buildActivityLog(realEvents, jobId)
      const convId = project.conversations[0].id
      const row = database.prepare('SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(convId)
      if (row && seedActivityLog(database, convId, row.id, activityLog, { taskId: `${jobId}-paused`, workspaceId: project.id })) {
        log(`seeded activity_log events=${activityLog.length} into conv=${convId}`)
      } else {
        log('WARN: 未能播种 activity_log（会话无消息）')
      }
    } finally { database.close() }
  }

  const observation = {
    launched: false, windowReady: false, axTextCount: 0, axTexts: [], axNodeCount: 0, axButtonTitles: [],
    segmentExpanded: null, screenshots: [], realEvents,
    realTerminalStatus: terminalStatus, collapsePress: null, expandPress: null,
    restartTextsBefore: [], restartTextsAfter: [], restartSucceeded: false, errors: [],
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true, jobId, outputDir, project: { id: project.id, root: project.root },
      realEventCount: realEvents.length, terminalStatus, seededJobs: readdirSync(jobsRoot),
      note: '只完成参数解析与 fixture 播种，未启动 app、未采集 AX。',
    }, null, 2))
    return
  }

  // 前置：无残留 app 进程；显示器需外部 caffeinate 保持唤醒。
  const running = spawnSync('pgrep', ['-fl', 'Vinkey.app/Contents/MacOS'], { encoding: 'utf8' })
  if (running.stdout && running.stdout.trim()) {
    observation.errors.push('已有 Vinkey 进程运行，请退出后重试')
    console.error('已有 Vinkey 进程运行，请退出后重试。')
    await finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines)
    return
  }
  if (!existsSync(CAPTURE_HELPER)) {
    observation.errors.push(`未找到截图 helper：${CAPTURE_HELPER}`)
    await finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines)
    return
  }

  // 编译 AX helper。
  const helperBin = join(tmpdir(), `vinkey-native-ax-${stamp()}`)
  const compiled = spawnSync('swiftc', ['-O', '-target', 'arm64-apple-macosx14.0', HELPER_SRC, '-o', helperBin], { encoding: 'utf8', timeout: 120000 })
  if (compiled.status !== 0) {
    observation.errors.push(`swiftc 编译失败：${(compiled.stderr || '').slice(0, 200)}`)
    await finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines)
    return
  }
  copyFileSync(HELPER_SRC, join(outputDir, 'native-automation.swift'))
  const helper = (command, args = [], outName = null, timeout = 30000) => {
    const outPath = outName ? join(outputDir, 'states', outName) : join(outputDir, 'states', `${command}-${stamp()}.json`)
    mkdirSync(dirname(outPath), { recursive: true })
    const result = spawnSync(helperBin, [command, outPath, ...args], { encoding: 'utf8', timeout })
    try { return JSON.parse(readFileSync(outPath, 'utf8')) } catch { return { command, exit: result.status, stderr: (result.stderr || '').slice(0, 200) } }
  }
  const capture = (name) => {
    const file = join(outputDir, 'screenshots', name)
    mkdirSync(dirname(file), { recursive: true })
    const result = spawnSync(CAPTURE_HELPER, ['capture', file, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 20000 })
    if (result.status === 0 && existsSync(file) && statSync(file).size > 1000) {
      observation.screenshots.push(join('screenshots', name))
      return statSync(file).size
    }
    return 0
  }

  // 启动真实 app（隔离数据目录）。
  const stream = (await import('node:fs')).createWriteStream(join(outputDir, 'app-runtime.log'), { flags: 'a' })
  const appChild = spawn(APP_BIN, [], { env: { ...process.env, VINKEY_ACCEPTANCE_DATA_DIR: profile }, stdio: ['ignore', 'pipe', 'pipe'] })
  appChild.stdout?.pipe(stream); appChild.stderr?.pipe(stream)
  observation.launched = true
  log('app launched with isolated profile')

  try {
    // 等窗口渲染（截图探针 > 20KB 视为可见）。
    let ready = false
    for (let i = 0; i < 30; i += 1) {
      const probe = join(outputDir, 'states', '.window-probe.png')
      const r = spawnSync(CAPTURE_HELPER, ['capture', probe, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 15000 })
      if (r.status === 0 && existsSync(probe) && statSync(probe).size > 20_000) {
        try { (await import('node:fs')).unlinkSync(probe) } catch { /* ignore */ }
        ready = true; break
      }
      await sleep(700)
    }
    observation.windowReady = ready
    log(`windowReady=${ready}`)
    if (!ready) observation.errors.push('目标应用窗口在 30 次探测内未出现（检查显示器唤醒）')

    if (ready) {
      await sleep(1200) // 等 WKWebView AX 树就绪
      helper('activate', [], 'activate.json')
      await sleep(900)

      // 打开播种了过程轨迹的会话：AX 按钮标题为「{会话标题} {消息数} 条消息」。
      const conv = project.conversations[0]
      if (conv) {
        const buttonTitle = `${conv.title} ${conv.messageCount} 条消息`
        const opened = helper('press-ax', ['AXButton', buttonTitle], 'press-conversation.json')
        log(`openConversation title=${buttonTitle} ok=${Boolean(opened?.pressAx?.ok)}`)
        await sleep(1600)
      }
      capture('00-conversation-open.png')

      // 采集 AX 文本与树（状态栏 / 按钮 / 段标签）。
      const texts = helper('texts', ['400'], 'texts-initial.json')
      observation.axTexts = Array.isArray(texts?.texts) ? texts.texts.map((t) => String(t?.text ?? '')) : []
      observation.axTextCount = observation.axTexts.length
      const tree = helper('ax-tree', [], 'ax-tree-initial.json')
      const nodes = Array.isArray(tree?.axTree) ? tree.axTree : []
      observation.axNodeCount = nodes.length
      observation.axButtonTitles = nodes
        .filter((n) => n.role === 'AXButton')
        .map((n) => String(n.title ?? ''))
        .filter((title) => title.length > 0)
      capture('01-initial.png')
      log(`axTexts=${observation.axTextCount} axNodes=${observation.axNodeCount}`)

      // 展开态读回：第一层段切换按钮的 AXExpanded 属性。
      const expanded = nodes
        .filter((n) => n.role === 'AXButton' && /条记录/.test(String(n.title ?? '')))
        .map((n) => Boolean(n.expanded))
      observation.segmentExpanded = expanded.length > 0 ? expanded : null

      // 折叠批量按压（客观回执）。
      const collapse = helper('press-ax', ['AXButton', '收起全部过程'], 'press-collapse.json')
      observation.collapsePress = { ok: Boolean(collapse?.pressAx?.ok) }
      await sleep(500)
      capture('02-collapsed.png')
      const expand = helper('press-ax', ['AXButton', '展开全部过程'], 'press-expand.json')
      observation.expandPress = { ok: Boolean(expand?.pressAx?.ok) }
      await sleep(500)
      capture('03-expanded.png')

      // 重启前文本快照。
      observation.restartTextsBefore = observation.axTexts.slice()
    }
  } finally {
    // 优雅退出应用进程。
    try { spawnSync('osascript', ['-e', 'tell application "Vinkey" to quit'], { encoding: 'utf8', timeout: 10000 }) } catch { /* ignore */ }
    await sleep(1500)
    const pids = spawnSync('pgrep', ['-f', 'Vinkey.app/Contents/MacOS'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean)
    for (const pid of pids) { try { process.kill(Number(pid), 'SIGTERM') } catch { /* ignore */ } }
    stream.end()
  }

  // 重启：同一数据目录，验证历史恢复。
  if (observation.windowReady) {
    const relaunch = spawn(APP_BIN, [], { env: { ...process.env, VINKEY_ACCEPTANCE_DATA_DIR: profile }, stdio: ['ignore', 'pipe', 'pipe'] })
    await sleep(3500)
    try {
      const probe = join(outputDir, 'states', '.restart-probe.png')
      const r = spawnSync(CAPTURE_HELPER, ['capture', probe, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 15000 })
      if (r.status === 0 && existsSync(probe) && statSync(probe).size > 20_000) {
        observation.restartSucceeded = true
        capture('04-restarted.png')
        helper('activate', [], 'activate-restart.json')
        await sleep(900)
        // 重启后重新打开同一会话，验证历史轨迹与终态完整可见。
        const conv = project.conversations[0]
        if (conv) {
          const buttonTitle = `${conv.title} ${conv.messageCount} 条消息`
          helper('press-ax', ['AXButton', buttonTitle], 'press-conversation-after-restart.json')
          await sleep(1500)
        }
        const textsAfter = helper('texts', ['400'], 'texts-after-restart.json')
        const afterTexts = Array.isArray(textsAfter?.texts) ? textsAfter.texts.map((t) => String(t?.text ?? '')) : []
        // 过程默认折叠：段标签在 AX 树按钮标题里，静态 texts 不含；合并两通道才完整。
        const treeAfter = helper('ax-tree', [], 'ax-tree-after-restart.json')
        const afterButtons = (Array.isArray(treeAfter?.axTree) ? treeAfter.axTree : [])
          .filter((n) => n.role === 'AXButton')
          .map((n) => String(n.title ?? ''))
          .filter(Boolean)
        observation.restartTextsAfter = [...afterTexts, ...afterButtons]
        log(`restart textsAfter=${afterTexts.length} buttonsAfter=${afterButtons.length}`)
      } else {
        observation.errors.push('重启后窗口未渲染')
      }
    } finally {
      try { spawnSync('osascript', ['-e', 'tell application "Vinkey" to quit'], { encoding: 'utf8', timeout: 10000 }) } catch { /* ignore */ }
      await sleep(1200)
      const pids = spawnSync('pgrep', ['-f', 'Vinkey.app/Contents/MacOS'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean)
      for (const pid of pids) { try { process.kill(Number(pid), 'SIGTERM') } catch { /* ignore */ } }
      try { relaunch.kill('SIGTERM') } catch { /* ignore */ }
    }
  }

  await finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines)
}

async function finish(observation, options, outputDir, headSha, dirty, version, jobId, logLines) {
  writeFileSync(join(outputDir, 'observation.json'), JSON.stringify(observation, null, 2), 'utf8')
  writeFileSync(join(outputDir, 'automation.log'), logLines.join('\n') + '\n', 'utf8')

  // Node 不能直接 import .ts：用 esbuild 现场打包纯逻辑模块。
  const { build } = await import('esbuild')
  const bundle = join(tmpdir(), `vinkey-native-accept-${stamp()}.mjs`)
  await build({
    entryPoints: [join(root, 'scripts/task-process/task-process-native-acceptance.ts')],
    outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  })
  const mod = await import('file://' + bundle)
  const output = mod.assembleNativeResult({
    observation,
    repository: { gitSha: headSha || null, dirty, version },
    application: {
      path: options.app, bundleIdentifier: BUNDLE_ID,
      provenanceNote: '目标 app 由外部按最终 HEAD 构建；本 runner 以隔离 fixture 驱动，不重算 appSha。',
    },
    sourceBatch: { driverWorkspace: options.driverWorkspace, jobId },
    outputDir,
  })

  console.log([
    `${mod.SUITE_ID} native acceptance: ${output.conclusion} (${output.summary.passed}/${output.summary.caseCount} passed, ${output.summary.failed} failed, ${output.summary.blocked} blocked)`,
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
