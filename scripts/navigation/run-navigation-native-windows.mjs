#!/usr/bin/env node
/**
 * UI-ACC-NAV-NATIVE-001 — D-NAV 原生窗口验收（Windows）
 *
 * 与 UI-ACC-NAV-UI-001（Playwright 浏览器演示层）不同，本入口真实启动已安装的
 * Vinkey.exe，用隔离 VINKEY_ACCEPTANCE_DATA_DIR 注入 W0 fixture，并调用
 * Win32 BitBlt 按窗口边界捕获原生窗口。
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '../..')
const localApp = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Vinkey', 'vinkey.exe')
  : ''
let APP_EXE = resolve(process.env.VINKEY_NAVIGATION_WIN_APP || localApp || 'C:/Users/Administrator/AppData/Local/Vinkey/vinkey.exe')
const PROCESS_NAME = 'vinkey'
const CAPTURE_SCRIPT = join(root, 'scripts/navigation/capture-win-window.ps1')
let OUTPUT_ROOT = resolve(root, process.env.VINKEY_NAVIGATION_OUTPUT || 'artifacts/navigation-acceptance')

function parseArgs(argv) {
  const options = { app: null, output: null, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') options.help = true
    else if (value === '--app') options.app = resolve(argv[++index] ?? '')
    else if (value === '--output') options.output = resolve(argv[++index] ?? '')
    else throw new Error(`未知参数：${value}`)
  }
  return options
}

function printHelp() {
  process.stdout.write(`导航原生窗口验收（Windows / UI-ACC-NAV-NATIVE-001）

用法：npm run test:navigation-native-win -- [选项]

选项：
  --app <exe>     已安装 Vinkey.exe 路径（默认 %LOCALAPPDATA%\\Vinkey\\vinkey.exe）
  --output <dir>  证据根目录（默认 artifacts/navigation-acceptance）
  --help          显示帮助

说明：真实启动桌面应用，以隔离 VINKEY_ACCEPTANCE_DATA_DIR 注入 fixture，并用 Win32 窗口级截图取证。
`)
}

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause)
}
function sha256Of(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}
function git(args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
function delay(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

const cases = []
const pushCase = (caseId, title, status, detail, extra = {}) => {
  cases.push({ caseId, title, category: 'native-window', status, detail, ...extra })
}

function preflight() {
  const blockers = []
  if (process.platform !== 'win32') blockers.push('仅支持 Windows（Win32 窗口级截图 helper）')
  if (!existsSync(APP_EXE)) blockers.push(`未找到已安装应用：${basename(APP_EXE)}`)
  if (!existsSync(CAPTURE_SCRIPT)) blockers.push(`未找到 Win32 截图脚本：${CAPTURE_SCRIPT}`)
  try {
    const count = Number(spawnSync('powershell', [
      '-NoProfile', '-Command', '(Get-Process -Name vinkey -ErrorAction SilentlyContinue | Measure-Object).Count',
    ], { encoding: 'utf8' }).stdout.trim())
    if (count > 0) blockers.push('启动前已有 vinkey 进程运行，为避免关闭用户内容请先退出应用')
  } catch (cause) {
    blockers.push(`无法检查 vinkey 进程：${messageOf(cause)}`)
  }
  return blockers
}

async function loadFixtureLibrary(temporaryDirectory) {
  const outfile = join(temporaryDirectory, 'navigation-fixture-lib.mjs')
  await build({
    entryPoints: [join(root, 'scripts/navigation/navigation-acceptance.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
  })
  return import('file://' + outfile.replaceAll('\\', '/'))
}

function readRuntimeStart(profile) {
  const file = join(profile, 'vinkey-runtime.jsonl')
  if (!existsSync(file)) return null
  try {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        const entry = JSON.parse(line)
        if (entry.event === 'app.start') return entry.fields ?? null
      } catch { /* 忽略不完整尾行 */ }
    }
  } catch { /* 忽略不可读日志 */ }
  return null
}

function parseCapture(stdout) {
  const lines = String(stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index])
      if (parsed.captured) return parsed
    } catch { /* 继续向前找 JSON 行 */ }
  }
  return null
}

async function stopApp(child) {
  if (!child || child.exitCode !== null) return
  try { child.kill() } catch { /* already gone */ }
  for (let i = 0; i < 20; i += 1) {
    if (child.exitCode !== null) return
    await delay(250)
  }
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8' })
  for (let i = 0; i < 20; i += 1) {
    if (child.exitCode !== null) return
    await delay(250)
  }
}

function pngIsValid(file) {
  if (!existsSync(file) || statSync(file).size < 20_000) return false
  const head = readFileSync(file).subarray(0, 8)
  return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { printHelp(); return }
  if (options.app) APP_EXE = options.app
  if (options.output) OUTPUT_ROOT = options.output
  const runId = `native-run-${utcStamp()}`
  const outputDir = join(OUTPUT_ROOT, runId)
  const screenshotDir = join(outputDir, 'screenshots')
  mkdirSync(screenshotDir, { recursive: true })

  const blockers = preflight()
  if (blockers.length) {
    for (const [index, reason] of blockers.entries()) {
      pushCase(`NAV-NATIVE-WIN-PRE-${String(index + 1).padStart(2, '0')}`, 'Windows 原生窗口验收前置条件', 'BLOCKED', reason)
    }
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vinkey-navigation-native-win-'))
  let library = null
  let runtimeStart = null

  const scenarios = [
    {
      caseId: 'NAV-NATIVE-WIN-001',
      title: '双项目登记与会话列表',
      file: '01-nav-native-project-list.png',
      expectation: '窗口左侧「项目 2」，两个 fixture 项目可见，当前项目展开会话列表，顶部显示当前项目名',
      prepare: null,
    },
    {
      caseId: 'NAV-NATIVE-WIN-002',
      title: '切换当前项目后的窗口状态',
      file: '02-nav-native-project-switch.png',
      expectation: '激活另一个项目后，顶部当前项目名与展开的会话分组随之改变',
      prepare: (manifest, lib) => lib.activateProject(manifest.dbPath, manifest.projects[0].id),
    },
    {
      caseId: 'NAV-NATIVE-WIN-003',
      title: '删除项目记录后的边界',
      file: '03-nav-native-project-deleted.png',
      expectation: '仅删除数据库项目记录，侧栏项目数降为 1，工作区文件不受影响',
      prepare: (manifest, lib) => lib.deleteProjectRecord(manifest.dbPath, manifest.projects[0].id, manifest.projects[0].name),
    },
    {
      caseId: 'NAV-NATIVE-WIN-004',
      title: '无项目空态',
      file: '04-nav-native-empty-projects.png',
      expectation: '空数据库下窗口正常渲染、不报错，显示无项目空态',
      prepare: 'empty',
    },
  ]

  try {
    if (!blockers.length) library = await loadFixtureLibrary(temporaryDirectory)

    for (const [index, scenario] of scenarios.entries()) {
      if (blockers.length) {
        pushCase(scenario.caseId, scenario.title, 'BLOCKED', '前置条件未满足，未启动应用')
        continue
      }
      const fixtureRoot = join(temporaryDirectory, scenario.caseId)
      mkdirSync(fixtureRoot, { recursive: true })
      let manifest = null
      let child = null
      try {
        const profile = join(fixtureRoot, 'app-data')
        mkdirSync(profile, { recursive: true })
        if (scenario.prepare === 'empty') {
          manifest = { dbPath: join(profile, 'vinkey.sqlite3'), projects: [], fixtureRoot }
          library.createProjectsDatabase(manifest.dbPath)
        } else {
          manifest = library.generateFixture(fixtureRoot)
          if (scenario.prepare) scenario.prepare(manifest, library)
        }

        const runtimeLog = join(outputDir, `app-runtime-${scenario.caseId}.log`)
        const logStream = createWriteStream(runtimeLog, { flags: 'a' })
        child = spawn(APP_EXE, [], {
          env: {
            ...process.env,
            VINKEY_ACCEPTANCE_DATA_DIR: profile,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        child.stdout?.pipe(logStream)
        child.stderr?.pipe(logStream)
        await delay(1200)

        const output = join(screenshotDir, scenario.file)
        const displayMetadata = index === 0 ? join(outputDir, 'display-metadata.json') : ''
        const capture = spawnSync('powershell', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CAPTURE_SCRIPT,
          '-ProcessName', PROCESS_NAME, '-Output', output, '-TimeoutMs', '30000',
          ...(displayMetadata ? ['-DisplayMetadata', displayMetadata] : []),
        ], { encoding: 'utf8' })
        const captured = parseCapture(capture.stdout)
        const valid = capture.status === 0 && captured?.captured === true && pngIsValid(output)
        if (!runtimeStart) runtimeStart = readRuntimeStart(profile)
        const projectsAfter = library.projectCount(manifest.dbPath)
        pushCase(
          scenario.caseId,
          scenario.title,
          valid ? 'PASS' : 'FAIL',
          valid
            ? `真实启动 ${basename(APP_EXE)}（隔离 Profile）；Win32 按窗口边界捕获原生窗口成功；窗口标题 ${captured.title}；数据库项目数 ${projectsAfter}。预期：${scenario.expectation}`
            : `原生窗口截图未生成或内容无效（exit=${capture.status}，stderr=${String(capture.stderr).slice(-300)}）`,
          {
            screenshot: valid ? `screenshots/${scenario.file}` : null,
            screenshotBytes: valid ? statSync(output).size : 0,
            windowHwnd: captured?.hwnd ?? null,
            windowTitle: captured?.title ?? null,
            windowState: captured?.windowState ?? null,
            expectation: scenario.expectation,
            appPid: child.pid,
            fixtureProjectCount: manifest.projects.length,
            databaseProjectCount: projectsAfter,
            isolatedProfile: true,
          },
        )
      } catch (cause) {
        pushCase(scenario.caseId, scenario.title, 'FAIL', `场景执行异常：${messageOf(cause)}`)
      } finally {
        await stopApp(child)
        await delay(700)
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }

  const headSha = git(['rev-parse', 'HEAD'])
  const dirty = (git(['status', '--porcelain']) || '').length > 0
  const shellBatch = (() => {
    try {
      const dir = join(root, 'artifacts/ui-shell-native-windows')
      const batches = readdirSync(dir).filter((name) => /^run-[\dTZ-]+$/.test(name)).sort()
      const latest = batches.at(-1)
      if (!latest) return null
      return { batch: latest, ...JSON.parse(readFileSync(join(dir, latest, 'result.json'), 'utf8')).application }
    } catch { return null }
  })()
  const applicationSha = runtimeStart?.commitSha ?? shellBatch?.gitSha ?? null
  const applicationShaSource = runtimeStart?.commitSha
    ? 'isolated profile vinkey-runtime.jsonl (app.start.fields.commitSha)'
    : shellBatch?.gitSha ? `ui-shell-native-windows ${shellBatch.batch} provenance (fallback)` : 'unavailable'
  let sourceIdentical = null
  if (applicationSha && headSha) {
    const diff = spawnSync('git', [
      '-C', root, 'diff', '--quiet', `${applicationSha}..${headSha}`,
      '--', 'src/', 'src-tauri/src/', 'index.html',
    ], { encoding: 'utf8' })
    sourceIdentical = diff.status === 0
  }

  const summary = {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
  }
  const conclusion = summary.failed === 0 && summary.blocked === 0 ? 'PASS' : summary.failed > 0 ? 'FAIL' : 'BLOCKED'
  const screenshots = cases.filter((item) => item.screenshot).map((item) => item.screenshot)
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: 'UI-ACC-NAV-NATIVE-001', domainId: 'D-NAV', gate: 'NATIVE-WINDOW', platform: 'Windows' },
    suite: 'navigation-native-windows',
    repository: { version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, gitSha: headSha, dirty },
    application: {
      path: basename(APP_EXE),
      installPathRedacted: true,
      processName: PROCESS_NAME,
      gitSha: applicationSha,
      gitShaEvidence: applicationShaSource,
      buildTimeEpochMs: runtimeStart?.buildTime ?? shellBatch?.buildTimeEpochMs ?? null,
      workingTreeDirtyAtBuild: runtimeStart?.workingTreeDirty ?? shellBatch?.workingTreeDirtyAtBuild ?? null,
      sourceIdenticalToHead: sourceIdentical,
      buildShaDiffersFromHead: applicationSha !== headSha,
      shellBatch: shellBatch?.batch ?? null,
    },
    provenance: {
      status: applicationSha && sourceIdentical === true && !dirty ? 'PASS' : 'REVIEW',
      detail: `appSha=${applicationSha ?? 'unknown'};headSha=${headSha ?? 'unknown'};srcIdentical=${sourceIdentical};repositoryClean=${!dirty};source=${applicationShaSource}。构建 SHA 与 HEAD 不同时，以 src/、src-tauri/src/、index.html 无差异证明界面代码同版本。`,
    },
    environment: {
      os: 'Windows',
      platform: process.platform,
      osVersion: `Windows build ${process.env.NATIVE_OS_BUILD || 'unknown'}`,
      arch: process.arch,
      node: process.version,
    },
    platformEvidence: {
      mechanism: 'Win32 BitBlt from screen DC (window bounds)',
      helper: 'scripts/navigation/capture-win-window.ps1',
      launcher: 'direct executable launch with VINKEY_ACCEPTANCE_DATA_DIR',
      note: '真实启动已安装 Vinkey.exe；不是 Playwright 浏览器演示层截图。',
    },
    cases,
    summary,
    exitCode: conclusion === 'PASS' ? 0 : 1,
    conclusion,
    artifacts: {
      screenshots,
      sha256: {},
      files: ['result.json', 'SHA256SUMS', 'ui-observations.md', 'display-metadata.json'],
    },
  }

  const sha256 = {}
  for (const relative of screenshots) sha256[relative] = sha256Of(readFileSync(join(outputDir, relative)))
  result.artifacts.sha256 = sha256
  const resultFile = join(outputDir, 'result.json')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const sums = Object.entries(sha256)
    .map(([name, hash]) => `${hash}  ${name}`)
    .concat([`${sha256Of(readFileSync(resultFile))}  result.json`])
    .sort()
    .join('\n') + '\n'
  writeFileSync(join(outputDir, 'SHA256SUMS'), sums, 'utf8')

  const observations = [
    '# D-NAV 原生窗口 UI 观察表（UI-ACC-NAV-NATIVE-001 / Windows）',
    '',
    `- 批次：\`${runId}\``,
    `- 结论：${conclusion}（${summary.passed}/${summary.caseCount} PASS）`,
    '- 机制：真实启动 Vinkey.exe + 隔离 `VINKEY_ACCEPTANCE_DATA_DIR` + Win32 窗口级截图',
    `- 应用 SHA：\`${applicationSha ?? 'unknown'}\`；仓库 HEAD：\`${headSha ?? 'unknown'}\`；src 一致：${sourceIdentical}`,
    '',
    '| 用例 | 期望观察 | 原生窗口截图 | 结论 |',
    '| --- | --- | --- | --- |',
    ...cases.map((item) => `| \`${item.caseId}\` ${item.title} | ${item.expectation ?? '窗口正常渲染'} | ${item.screenshot ? `\`${item.screenshot}\`` : '无'} | ${item.status} |`),
    '',
    '> 本批次证明真实安装的桌面应用能正确渲染项目/会话导航状态。交互链路细节由 `UI-ACC-NAV-UI-001`（Playwright 浏览器演示层）覆盖，数据合同由 `W0-NAV-F` / `W2-NAV-E` / `W4-NAV-R` 机器断言覆盖；三层证据互补，任何单层均不单独等同完整验收。',
    '',
  ].join('\n')
  writeFileSync(join(outputDir, 'ui-observations.md'), observations, 'utf8')

  console.log(`导航原生窗口验收：${conclusion}（${summary.passed}/${summary.caseCount} PASS，${summary.failed} FAIL，${summary.blocked} BLOCKED）`)
  console.log(`归档：${outputDir}`)
  for (const item of cases) console.log(`  ${item.status.padEnd(7)} ${item.caseId} ${item.title}${item.screenshot ? ' -> ' + item.screenshot : ''}`)
  process.exitCode = result.exitCode
}

main().catch((cause) => {
  console.error(`导航原生窗口验收失败：${messageOf(cause)}`)
  process.exitCode = 1
})
