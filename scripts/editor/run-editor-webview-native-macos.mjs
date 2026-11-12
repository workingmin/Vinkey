#!/usr/bin/env node
/**
 * UI-ACC-EDITOR-WEBVIEW-001 — W0-EDITOR-F 目标平台 WebView 客观证据（macOS 原生）
 *
 * 目的：补齐 fixture / 文件桥接合同层之外的「真实 Tauri WebView」结构证据。
 * 证据全部来自 /Applications/Vinkey.app 真实窗口：
 *   - ApplicationServices AX 树（menu-ax-helper.swift 的 ax-tree / texts）
 *   - 原生菜单 click（查看 > 项目文件）与 AXPress（README.md）
 *   - CoreGraphics 窗口截图
 *   - 隔离 Profile 的 app.start 构建溯源日志
 *
 * 不使用 Playwright / jsdom / 合成节点；人工 UI 观察不由脚本判定，platformPass 恒为 false。
 * 归档目录与 artifacts/editor-acceptance/run-* 分开，避免干扰 UI-ACC-TITLE-BAR-FIXTURE-001
 * 对 W0-EDITOR-F fixture 合同批次的最新批次解析。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, statSync, writeFileSync,
} from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { build } from 'esbuild'
import { evaluateEditorWebViewEvidence } from './editor-webview-verdicts.mjs'

const root = resolve(import.meta.dirname, '../..')
const SUITE_ID = 'UI-ACC-EDITOR-WEBVIEW-001'
const SUITE_VERSION = 'editor-webview-native-1'
const ACCEPTANCE_ID = 'W0-EDITOR-F'
const APP_PATH = process.env.VINKEY_EDITOR_WEBVIEW_APP || '/Applications/Vinkey.app'
const APP_BIN = join(APP_PATH, 'Contents/MacOS/vinkey')
const BUNDLE_ID = 'com.vinkey.desktop'
const PROCESS_NAME = 'Vinkey'
const CAPTURE_HELPER = process.env.VINKEY_CAPTURE_HELPER
  || join(root, 'artifacts/ui-shell-native-macos/bin/vinkey-capture-helper')
const HELPER_SRC = join(root, 'scripts/title-bar/menu-ax-helper.swift')
const OUTPUT_ROOT = resolve(root, process.env.VINKEY_EDITOR_WEBVIEW_OUTPUT || 'artifacts/editor-webview-native-macos')

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const messageOf = (c) => c instanceof Error ? c.message : String(c)
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const git = (args) => {
  try { return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).stdout.trim() } catch { return null }
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

async function main() {
  mkdirSync(OUTPUT_ROOT, { recursive: true })
  const outputDir = join(OUTPUT_ROOT, `editor-wv-${stamp()}-macos`)
  for (const dir of [outputDir, join(outputDir, 'states'), join(outputDir, 'screenshots')]) mkdirSync(dir, { recursive: true })

  const events = []
  const stderrBuffer = []
  const logEvent = (text) => events.push(`${new Date().toISOString()}  ${text}`)
  const blockers = []
  if (process.platform !== 'darwin') blockers.push('仅支持 macOS（ApplicationServices AX + CoreGraphics）')
  if (!existsSync(APP_BIN)) blockers.push(`未找到应用：${APP_BIN}`)
  if (!existsSync(CAPTURE_HELPER)) blockers.push(`未找到 CoreGraphics helper：${CAPTURE_HELPER}`)
  if (!existsSync(HELPER_SRC)) blockers.push(`未找到 AX helper 源码：${HELPER_SRC}`)
  const running = spawnSync('pgrep', ['-fl', 'Vinkey.app/Contents/MacOS'], { encoding: 'utf8' })
  if (running.status === 0 && running.stdout.trim()) blockers.push('已有 Vinkey 进程运行，请退出后重试')

  let temporaryDirectory = null
  let helperBin = ''
  let appChild = null
  let appRuntimeStart = null
  let fixtureManifest = null
  let expectedDocumentContent = ''
  let menuClick = null
  let pressAx = null
  let axTree = []
  let texts = []
  let textsFiles = []
  const screenshotBytes = { filesPage: 0, editorOpen: 0 }
  let provenance = { status: 'REVIEW' }

  try {
    temporaryDirectory = await mkdtemp(join(realpathSync(tmpdir()), 'vinkey-editor-wv-'))
    helperBin = join(temporaryDirectory, 'vinkey-menu-ax-helper')
    copyFileSync(HELPER_SRC, join(outputDir, 'native-automation.swift'))

    const helper = (command, args = [], outName = null, timeout = 30000) => {
      const outPath = join(outputDir, 'states', outName || `ax-${command}-${Date.now()}.json`)
      const result = spawnSync(helperBin, [command, outPath, ...args], { encoding: 'utf8', timeout })
      if (result.stderr) stderrBuffer.push(`[${command}] ${result.stderr}`)
      if (result.error?.code === 'ETIMEDOUT') {
        logEvent(`HELPER ${command} TIMEOUT`)
        return { ok: false, error: 'timeout' }
      }
      logEvent(`HELPER ${command} ${args.join(' ')} exit=${result.status}`)
      if (!existsSync(outPath)) return { ok: false, error: 'no-output' }
      try { return JSON.parse(readFileSync(outPath, 'utf8')) } catch (cause) {
        return { ok: false, error: `bad-json: ${messageOf(cause)}` }
      }
    }
    const capture = (name) => {
      const file = join(outputDir, 'screenshots', name)
      const result = spawnSync(CAPTURE_HELPER, ['capture', file, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 20000 })
      if (result.stderr) stderrBuffer.push(`[capture:${name}] ${result.stderr}`)
      const bytes = existsSync(file) && result.status === 0 ? statSync(file).size : 0
      logEvent(`CAPTURE ${name} ${bytes} bytes exit=${result.status}`)
      return bytes
    }

    if (!blockers.length) {
      const compiled = spawnSync('swiftc', ['-O', '-target', 'arm64-apple-macosx14.0', HELPER_SRC, '-o', helperBin], { encoding: 'utf8', timeout: 120000 })
      if (compiled.status !== 0) {
        blockers.push(`swiftc 编译失败：${(compiled.stderr || '').slice(0, 300)}`)
        stderrBuffer.push(compiled.stderr || '')
      } else {
        logEvent('AX helper compiled; source copied to native-automation.swift')
      }
    }

    if (!blockers.length) {
      const bundled = join(temporaryDirectory, 'navigation-fixture-lib.mjs')
      await build({
        entryPoints: [join(root, 'scripts/navigation/navigation-acceptance.ts')],
        outfile: bundled, bundle: true, platform: 'node', format: 'esm', target: 'node22',
      })
      const fixtureLibrary = await import('file://' + bundled)
      const fixtureRoot = join(temporaryDirectory, 'fixture')
      fixtureManifest = fixtureLibrary.generateFixture(fixtureRoot)
      const profile = join(fixtureRoot, 'app-data')
      writeFileSync(join(outputDir, 'fixture-manifest.json'), JSON.stringify(fixtureManifest, null, 2), 'utf8')
      logEvent(`fixture generated: ${fixtureManifest.projects.length} projects`)

      const logPath = join(outputDir, 'app-runtime.log')
      const stream = createWriteStream(logPath, { flags: 'a' })
      appChild = spawn(APP_BIN, [], {
        env: { ...process.env, VINKEY_ACCEPTANCE_DATA_DIR: profile },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      appChild.stdout?.pipe(stream)
      appChild.stderr?.pipe(stream)

      let ready = false
      for (let i = 0; i < 30; i += 1) {
        const probe = join(outputDir, 'states', '.window-probe.png')
        const r = spawnSync(CAPTURE_HELPER, ['capture', probe, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 15000 })
        if (r.status === 0 && existsSync(probe) && statSync(probe).size > 20_000) {
          try { (await import('node:fs')).unlinkSync(probe) } catch { /* ignore */ }
          ready = true
          break
        }
        await sleep(700)
      }
      if (!ready) blockers.push('目标应用窗口在 30 次探测内未出现')
      else {
        await sleep(1200) // 等 WKWebView AX 树就绪
        for (let j = 0; j < 10 && !appRuntimeStart; j += 1) {
          appRuntimeStart = readRuntimeStart(profile)
          if (!appRuntimeStart) await sleep(300)
        }
        logEvent(`APP provenance app.start=${appRuntimeStart?.commitSha ? 'observed' : 'UNAVAILABLE'}`)
        // 归档原始 app.start 日志，使构建 SHA / 构建时工作树状态可被独立重算，
        // 而不只依赖 result.json 中的转述字段。
        const runtimeLog = join(profile, 'vinkey-runtime.jsonl')
        if (existsSync(runtimeLog)) copyFileSync(runtimeLog, join(outputDir, 'app-runtime.jsonl'))

        helper('activate', [], 'activate.json')
        await sleep(900)
        const tree = helper('tree', [], 'menu-tree.json')
        const view = (tree?.menus || []).find((m) => m.title === '查看')
        const viewItems = (view?.items || []).map((item) => item.title)
        logEvent(`查看菜单 items=${JSON.stringify(viewItems)}`)
        if (!viewItems.includes('项目文件')) blockers.push('原生「查看」菜单缺少「项目文件」')

        menuClick = helper('click', ['查看', '项目文件'], 'click-files-page.json')
        await sleep(1400)
        const filesTree = helper('ax-tree', [], 'ax-tree-files-page.json')
        textsFiles = helper('texts', ['160'], 'texts-files-page.json')
        writeFileSync(join(outputDir, 'states', 'ax-tree-files-page-raw.json'), JSON.stringify(filesTree, null, 2), 'utf8')
        screenshotBytes.filesPage = capture('files-page.png')

        pressAx = helper('press-ax', ['AXButton', 'README.md'], 'press-readme.json')
        await sleep(1500)
        const editorTree = helper('ax-tree', [], 'ax-tree-editor-open.json')
        const editorTexts = helper('texts', ['160'], 'texts-editor-open.json')
        axTree = Array.isArray(editorTree?.axTree) ? editorTree.axTree : []
        texts = Array.isArray(editorTexts?.texts) ? editorTexts.texts : []
        screenshotBytes.editorOpen = capture('editor-open.png')
        logEvent(`editor AX nodes=${axTree.length} texts=${texts.length} filesPageAX=${filesTree?.nodeCount ?? 0} filesPageTexts=${textsFiles?.textCount ?? 0}`)

        // 从 AX 文本快照中读出应用实际选中的项目根目录，再取该项目的 fixture 文档内容，
        // 避免假定某个固定项目被选中；断言必须逐字匹配真实文件字节。
        const observedPaths = texts.map((entry) => String(entry?.text ?? ''))
        const selected = (fixtureManifest.projects || []).find((project) => observedPaths.some((text) => text.includes(project.root)))
        const readme = selected ? join(selected.root, 'README.md') : null
        if (readme && existsSync(readme)) expectedDocumentContent = readFileSync(readme, 'utf8')
        else blockers.push('无法从 AX 文本快照定位已选项目的 README.md，文档内容断言不予放行')
        writeFileSync(join(outputDir, 'fixture-document.txt'), expectedDocumentContent, 'utf8')
        writeFileSync(join(outputDir, 'fixture-selection.json'), JSON.stringify({
          selectedProject: selected?.name ?? null,
          selectedRoot: selected?.root ?? null,
          document: readme,
          byteLength: Buffer.byteLength(expectedDocumentContent, 'utf8'),
        }, null, 2), 'utf8')
      }
    }

    const headSha = git(['rev-parse', 'HEAD'])
    const dirty = (git(['status', '--porcelain']) || '').length > 0
    const appSha = typeof appRuntimeStart?.commitSha === 'string' ? appRuntimeStart.commitSha : null
    const workingTreeDirtyAtBuild = typeof appRuntimeStart?.workingTreeDirty === 'boolean' ? appRuntimeStart.workingTreeDirty : null
    let sourceIdenticalToHead = null
    if (appSha && headSha) {
      const diff = spawnSync('git', ['-C', root, 'diff', '--quiet', `${appSha}..${headSha}`, '--', 'src/', 'src-tauri/src/', 'index.html'], { encoding: 'utf8' })
      sourceIdenticalToHead = diff.status === 0
    }
    provenance = {
      status: appSha && appSha === headSha && sourceIdenticalToHead === true
        && workingTreeDirtyAtBuild === false && !dirty ? 'PASS' : 'REVIEW',
      appSha,
      headSha,
      buildTimeEpochMs: appRuntimeStart?.buildTime ?? null,
      workingTreeDirtyAtBuild,
      repositoryClean: !dirty,
      sourceIdenticalToHead,
      source: 'isolated profile vinkey-runtime.jsonl (app.start.fields.commitSha)',
      note: '运行时日志取自真实目标 app 的隔离 Profile；不采用浏览器 companion 或脚本内硬编码 SHA。',
    }

    const verdict = evaluateEditorWebViewEvidence({
      axTree,
      texts,
      menuClick,
      pressAx,
      expectedDocumentContent,
      provenance,
      screenshotBytes,
      preconditionsBlocked: blockers,
    })

    const result = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      suite: { id: SUITE_ID, version: SUITE_VERSION },
      acceptance: {
        id: ACCEPTANCE_ID,
        domainId: 'D-EDITOR',
        platform: 'macOS',
        evidenceLayer: 'target-platform-native-webview',
        plan: 'docs/acceptance/ui/UI_ACCEPTANCE_PLAN.md',
        report: 'docs/acceptance/ui/UI_ACCEPTANCE_EDITOR.md',
        fixtureContractSuite: 'UI-ACC-EDITOR-001',
      },
      repository: { gitSha: headSha, dirty, repositoryClean: !dirty },
      application: {
        path: APP_PATH,
        bundleIdentifier: BUNDLE_ID,
        gitSha: appSha,
        workingTreeDirtyAtBuild,
        sourceIdenticalToHead,
      },
      provenance,
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        swift: spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0],
        axHelper: 'scripts/title-bar/menu-ax-helper.swift (ax-tree / texts / click / press-ax)',
        captureHelper: relative(root, CAPTURE_HELPER),
      },
      fixture: {
        projectCount: fixtureManifest?.projects?.length ?? 0,
        selectedProject: (() => {
          const observed = texts.map((entry) => String(entry?.text ?? ''))
          return (fixtureManifest?.projects || []).find((p) => observed.some((t) => t.includes(p.root)))?.name ?? null
        })(),
        documentContentBytes: Buffer.byteLength(expectedDocumentContent, 'utf8'),
        note: '隔离 Profile + navigation-acceptance.generateFixture()；/tmp 符号链接经 realpath 归一，避免路径守卫误判。',
      },
      signals: {
        axNodeCount: axTree.length,
        axTextCount: texts.length,
        filesPageTextCount: textsFiles?.textCount ?? 0,
        menuClick: menuClick ? { ok: menuClick.ok, title: menuClick.click?.pressedItemTitle ?? menuClick.pressedItemTitle ?? null } : null,
        pressAx: pressAx ? {
          ok: pressAx.ok,
          matchedTitle: pressAx.pressAx?.matched?.title ?? pressAx.matched?.title ?? null,
          matchedRole: pressAx.pressAx?.matched?.role ?? pressAx.matched?.role ?? null,
        } : null,
        screenshotBytes,
      },
      cases: verdict.cases,
      summary: verdict.summary,
      objectiveConclusion: verdict.objectiveConclusion,
      humanUIObservation: verdict.humanUIObservation,
      deferredItems: verdict.deferredItems,
      platformPass: verdict.platformPass,
      overallConclusion: verdict.overallConclusion,
      windowsPlatform: 'NOT_EXECUTED',
      preconditionsBlocked: blockers,
      exitCode: verdict.exitCode,
      artifacts: { manifestFile: 'SHA256SUMS', sha256: {} },
    }

    writeFileSync(join(outputDir, 'events.txt'), events.join('\n') + '\n', 'utf8')
    writeFileSync(join(outputDir, 'automation-stderr.txt'), stderrBuffer.join('') || '', 'utf8')

    const hashManifest = {}
    const walk = (dir, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        const full = join(dir, entry.name)
        if (entry.isDirectory()) { walk(full, name); continue }
        if (['result.json', 'SHA256SUMS', '.DS_Store'].includes(entry.name)) continue
        hashManifest[name] = sha256(full)
      }
    }
    walk(outputDir)
    result.artifacts.sha256 = hashManifest
    const resultFile = join(outputDir, 'result.json')
    writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
    const sums = Object.entries(hashManifest)
      .map(([name, hash]) => `${hash}  ${name}`)
      .concat([`${sha256(resultFile)}  result.json`])
      .sort().join('\n') + '\n'
    writeFileSync(join(outputDir, 'SHA256SUMS'), sums, 'utf8')

    console.log(`${SUITE_ID} ${ACCEPTANCE_ID} target-platform WebView: ${verdict.objectiveConclusion} (${verdict.summary.passed}/${verdict.summary.caseCount} passed, ${verdict.summary.failed} failed, ${verdict.summary.blocked} blocked; platformPass=false, 人工 UI 观察待回传)`)
    console.log(`Results: ${relative(root, resultFile)}`)
    console.log(`SHA256SUMS: ${relative(root, join(outputDir, 'SHA256SUMS'))}`)
    console.log(`exit=${result.exitCode}`)
    process.exitCode = result.exitCode
  } finally {
    if (appChild && appChild.exitCode === null && !appChild.killed) {
      appChild.kill('SIGTERM')
      await sleep(500)
      if (appChild.exitCode === null) appChild.kill('SIGKILL')
    }
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((cause) => {
  console.error(`W0-EDITOR-F 目标平台 WebView 证据脚本失败：${messageOf(cause)}`)
  process.exitCode = 1
})
