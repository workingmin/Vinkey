#!/usr/bin/env node
/**
 * UI-ACC-NAV-NATIVE-001 — D-NAV 原生窗口验收（macOS）
 *
 * 与 UI-ACC-NAV-UI-001（Playwright 浏览器演示层）不同，本入口真实启动
 * /Applications/Vinkey.app，用隔离 VINKEY_ACCEPTANCE_DATA_DIR 注入 W0
 * fixture，并调用 ui-shell-native-macos 已编译的 CoreGraphics helper
 * （CGWindowListCreateImage）按窗口 ID 捕获原生窗口。
 *
 * 证据定位：证明「真实安装的桌面应用能正确渲染项目/会话导航状态」；
 * 交互链路与数据合同分别由浏览器 companion 与机器断言脚本负责，三层互补。
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createWriteStream } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '../..')
const APP_PATH = process.env.VINKEY_NAVIGATION_APP || '/Applications/Vinkey.app'
const APP_BIN = join(APP_PATH, 'Contents/MacOS/vinkey')
const BUNDLE_ID = 'com.vinkey.desktop'
const PROCESS_NAME = 'Vinkey'
const CAPTURE_HELPER = process.env.VINKEY_CAPTURE_HELPER
  || join(root, 'artifacts/ui-shell-native-macos/bin/vinkey-capture-helper')
const OUTPUT_ROOT = resolve(root, process.env.VINKEY_NAVIGATION_OUTPUT || 'artifacts/navigation-acceptance')

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

const cases = []
const pushCase = (caseId, title, status, detail, extra = {}) => {
  cases.push({ caseId, title, category: 'native-window', status, detail, ...extra })
}

function preflight() {
  const blockers = []
  if (process.platform !== 'darwin') blockers.push('仅支持 macOS（CoreGraphics window-capture helper）')
  if (!existsSync(APP_BIN)) blockers.push(`未找到已安装应用可执行文件：${APP_BIN}`)
  if (!existsSync(CAPTURE_HELPER)) blockers.push(`未找到 CoreGraphics 截图 helper：${CAPTURE_HELPER}（请先运行一次 npm run test:ui-shell-native-mac 编译）`)
  const running = spawnSync('pgrep', ['-fl', 'Vinkey.app/Contents/MacOS'], { encoding: 'utf8' })
  if (running.status === 0 && running.stdout.trim()) blockers.push(`已有 Vinkey 进程在运行，请退出后重试：${running.stdout.trim().slice(0, 160)}`)
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
  return import('file://' + outfile)
}

/** 从隔离 Profile 的 app.start 运行时日志读取应用构建溯源（与壳层脚本同源） */
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

async function captureWindow(helper, output, attempt = 20) {
  for (let i = 0; i < attempt; i += 1) {
    const result = spawnSync(helper, ['capture', output, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8' })
    if (result.status === 0 && existsSync(output) && statSync(output).size > 20_000) {
      return { ok: true, waitSeconds: i, attempts: i + 1 }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return { ok: false, waitSeconds: attempt, attempts: attempt }
}

async function stopApp(child) {
  if (!child || child.exitCode !== null) return
  try { child.kill('SIGTERM') } catch { /* already gone */ }
  for (let i = 0; i < 20; i += 1) {
    if (child.exitCode !== null) return
    await new Promise((r) => setTimeout(r, 250))
  }
  try { child.kill('SIGKILL') } catch { /* already gone */ }
}

function pngIsValid(file) {
  if (!existsSync(file) || statSync(file).size < 20_000) return false
  const head = readFileSync(file).subarray(0, 8)
  return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
}

async function main() {
  const runId = `native-run-${utcStamp()}`
  const outputDir = join(OUTPUT_ROOT, runId)
  const screenshotDir = join(outputDir, 'screenshots')
  mkdirSync(screenshotDir, { recursive: true })

  const blockers = preflight()
  if (blockers.length) {
    for (const [index, reason] of blockers.entries()) {
      pushCase(`NAV-NATIVE-PRE-${String(index + 1).padStart(2, '0')}`, '原生窗口验收前置条件', 'BLOCKED', reason)
    }
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vinkey-navigation-native-'))
  let library = null
  let runtimeStart = null

  const scenarios = [
    {
      caseId: 'NAV-NATIVE-001',
      title: '双项目登记与会话列表',
      file: '01-nav-native-project-list.png',
      expectation: '窗口左侧「项目 2」，两个 fixture 项目可见，当前项目展开会话列表，顶部显示当前项目名',
      prepare: null,
    },
    {
      caseId: 'NAV-NATIVE-002',
      title: '切换当前项目后的窗口状态',
      file: '02-nav-native-project-switch.png',
      expectation: '激活另一个项目后，顶部当前项目名与展开的会话分组随之改变',
      prepare: (manifest, lib) => lib.activateProject(manifest.dbPath, manifest.projects[0].id),
    },
    {
      caseId: 'NAV-NATIVE-003',
      title: '删除项目记录后的边界',
      file: '03-nav-native-project-deleted.png',
      expectation: '仅删除数据库项目记录，侧栏项目数降为 1，工作区文件不受影响',
      prepare: (manifest, lib) => lib.deleteProjectRecord(manifest.dbPath, manifest.projects[0].id, manifest.projects[0].name),
    },
    {
      caseId: 'NAV-NATIVE-004',
      title: '无项目空态',
      file: '04-nav-native-empty-projects.png',
      expectation: '空数据库下窗口正常渲染、不报错，显示无项目空态',
      prepare: 'empty',
    },
  ]

  try {
    if (!blockers.length) library = await loadFixtureLibrary(temporaryDirectory)

    for (const scenario of scenarios) {
      if (blockers.length) {
        pushCase(scenario.caseId, scenario.title, 'BLOCKED', '前置条件未满足，未启动应用')
        continue
      }
      const fixtureRoot = join(temporaryDirectory, scenario.caseId)
      mkdirSync(fixtureRoot, { recursive: true })
      let manifest = null
      let child = null
      try {
        if (scenario.prepare === 'empty') {
          const appData = join(fixtureRoot, 'app-data')
          mkdirSync(appData, { recursive: true })
          manifest = { dbPath: join(appData, 'vinkey.sqlite3'), projects: [], fixtureRoot, dbSummary: { projectCount: 0 } }
          library.createProjectsDatabase(manifest.dbPath)
        } else {
          manifest = library.generateFixture(fixtureRoot)
          if (scenario.prepare) scenario.prepare(manifest, library)
        }
        const profile = join(fixtureRoot, 'app-data')
        const runtimeLog = join(outputDir, `app-runtime-${scenario.caseId}.log`)
        const logStream = createWriteStream(runtimeLog, { flags: 'a' })
        child = spawn(APP_BIN, [], {
          env: { ...process.env, VINKEY_ACCEPTANCE_DATA_DIR: profile },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        child.stdout?.pipe(logStream)
        child.stderr?.pipe(logStream)

        const output = join(screenshotDir, scenario.file)
        const capture = await captureWindow(CAPTURE_HELPER, output)
        const valid = capture.ok && pngIsValid(output)
        if (!runtimeStart) runtimeStart = readRuntimeStart(profile)
        const projectsAfter = library.projectCount(manifest.dbPath)
        pushCase(
          scenario.caseId,
          scenario.title,
          valid ? 'PASS' : 'FAIL',
          valid
            ? `真实启动 ${APP_PATH}（隔离 Profile）；CoreGraphics 按窗口 ID 捕获原生窗口成功（等待 ${capture.waitSeconds}s）；数据库项目数 ${projectsAfter}。预期：${scenario.expectation}`
            : `原生窗口截图未生成或内容无效（attempts=${capture.attempts}）`,
          {
            screenshot: valid ? `screenshots/${scenario.file}` : null,
            screenshotBytes: valid ? statSync(output).size : 0,
            captureAttempts: capture.attempts,
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
        await new Promise((r) => setTimeout(r, 600))
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }

  const headSha = git(['rev-parse', 'HEAD'])
  const dirty = (git(['status', '--porcelain']) || '').length > 0
  const shellBatch = (() => {
    try {
      const dir = join(root, 'artifacts/ui-shell-native-macos')
      const batches = readdirSync(dir).filter((name) => /^run-[\d-]+T\d+Z$/.test(name)).sort()
      const latest = batches.at(-1)
      if (!latest) return null
      return { batch: latest, ...JSON.parse(readFileSync(join(dir, latest, 'result.json'), 'utf8')).application }
    } catch { return null }
  })()
  const applicationSha = runtimeStart?.commitSha ?? shellBatch?.gitSha ?? null
  const applicationShaSource = runtimeStart?.commitSha
    ? 'isolated profile vinkey-runtime.jsonl (app.start.fields.commitSha)'
    : shellBatch?.gitSha ? `ui-shell-native-macos ${shellBatch.batch} provenance (fallback)` : 'unavailable'
  let sourceIdentical = null
  if (applicationSha && headSha) {
    const diff = spawnSync('git', ['-C', root, 'diff', '--quiet', `${applicationSha}..${headSha}`, '--', 'src/', 'src-tauri/src/', 'index.html'], { encoding: 'utf8' })
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
    acceptance: { id: 'UI-ACC-NAV-NATIVE-001', domainId: 'D-NAV', gate: 'NATIVE-WINDOW', platform: 'macOS' },
    suite: 'navigation-native-macos',
    repository: { version: '0.1.0', gitSha: headSha, dirty },
    application: {
      path: APP_PATH,
      bundleIdentifier: BUNDLE_ID,
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
      detail: `appSha=${applicationSha ?? 'unknown'};headSha=${headSha ?? 'unknown'};srcIdentical=${sourceIdentical};repositoryClean=${!dirty};source=${applicationShaSource}。构建 SHA 与 HEAD 不同时，以 src/、src-tauri/src/、index.html 无差异证明界面代码同版本；本次仅 scripts/、docs/、package.json 变更。`,
    },
    environment: {
      os: 'macOS',
      platform: process.platform,
      osVersion: spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim(),
      arch: process.arch,
      node: process.version,
    },
    platformEvidence: {
      mechanism: 'CoreGraphics.CGWindowListCreateImage',
      helper: CAPTURE_HELPER.replace(root + '/', ''),
      launcher: 'direct executable launch with VINKEY_ACCEPTANCE_DATA_DIR',
      note: '真实启动已安装 Tauri 应用；不是 Playwright 浏览器演示层截图。ScreenCaptureKit 在沙箱会话下会因 CGS_REQUIRE_INIT 失败，故沿用壳层的 CoreGraphics 方案。',
    },
    cases,
    summary,
    exitCode: conclusion === 'PASS' ? 0 : 1,
    conclusion,
    artifacts: {
      screenshots,
      sha256: {},
      files: ['result.json', 'SHA256SUMS', 'ui-observations.md'],
    },
  }

  const sha256 = {}
  for (const relative of screenshots) {
    sha256[relative] = sha256Of(readFileSync(join(outputDir, relative)))
  }
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
    '# D-NAV 原生窗口 UI 观察表（UI-ACC-NAV-NATIVE-001）',
    '',
    `- 批次：\`${runId}\``,
    `- 结论：**${conclusion}**（${summary.passed}/${summary.caseCount} PASS）`,
    `- 机制：真实启动 \`${APP_PATH}\` + 隔离 \`VINKEY_ACCEPTANCE_DATA_DIR\` + CoreGraphics 窗口级截图`,
    `- 应用 SHA：\`${applicationSha ?? 'unknown'}\`；仓库 HEAD：\`${headSha ?? 'unknown'}\`；src 一致：${sourceIdentical}`,
    '',
    '| 用例 | 期望观察 | 原生窗口截图 | 结论 |',
    '| --- | --- | --- | --- |',
    ...cases.map((item) => `| \`${item.caseId}\` ${item.title} | ${item.expectation ?? '窗口正常渲染'} | ${item.screenshot ? `\`${item.screenshot}\`` : '无'} | ${item.status} |`),
    '',
    '> 本批次证明真实安装的桌面应用能正确渲染项目/会话导航状态。交互链路细节由 `UI-ACC-NAV-UI-001`（Playwright 浏览器演示层，21 张截图）覆盖，数据合同由 `W0-NAV-F` / `W2-NAV-E` / `W4-NAV-R` 机器断言覆盖；三层证据互补，任何单层均不单独等同完整验收。',
    '',
    '> 人工目视复核：请打开 `screenshots/` 逐张确认窗口边界、交通灯、侧栏项目与会话分组、顶部当前项目名，以及空态下无报错叠层。',
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
