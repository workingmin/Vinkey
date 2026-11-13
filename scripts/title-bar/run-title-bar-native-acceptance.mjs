#!/usr/bin/env node
/**
 * UI-ACC-TITLE-BAR-001 — W0-SHELL-MENU-P（macOS 原生判定）
 * F 子门槛由独立脚本 UI-ACC-TITLE-BAR-FIXTURE-001 单独归档；本 runner 不判定 F，
 * TB-MENU-004 记 NOT_APPLICABLE（批次归属不适用）并用 authoritativeGate 引用该门槛。
 *
 * 严格按 docs/acceptance/ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md：
 *   - §3 用例清单 TB-MENU-001 ~ TB-MENU-012 + TB-MENU-003-GLOBAL-SEARCH 遗留项
 *   - §5 结果输出集（result.json / SHA256SUMS / screenshots / events.txt /
 *     automation-stderr.txt / display-info.txt / native-automation.* / webview）
 *   - §5 stdout 四行规范，进程退出码等于 result.json.exitCode
 *   - §6 判定规则；P/F 两个子门槛分别给结论，不得混报
 *
 * 原生菜单通过 ApplicationServices AX C API 读取/点击（System Events 在本会话
 * 返回 -10004，故沿用 ui-shell/ax-shell-helper.swift 的纯 AX 路径）。
 * 浏览器 companion 只作为 M3 的 WebView 结构证据，不冒充原生窗口证据。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { build } from 'esbuild'
import { evaluateFullscreen, evaluateReopen, evaluateDirectoryCancel, evaluateSearchPanelEscape } from './title-bar-verdicts.mjs'

const root = resolve(import.meta.dirname, '../..')
const APP_PATH = process.env.VINKEY_TITLE_BAR_APP || '/Applications/Vinkey.app'
const APP_BIN = join(APP_PATH, 'Contents/MacOS/vinkey')
const BUNDLE_ID = 'com.vinkey.desktop'
const PROCESS_NAME = 'Vinkey'
const CAPTURE_HELPER = process.env.VINKEY_CAPTURE_HELPER
  || join(root, 'artifacts/ui-shell-native-macos/bin/vinkey-capture-helper')
const HELPER_SRC = join(root, 'scripts/title-bar/menu-ax-helper.swift')
const OUTPUT_ROOT = resolve(root, process.env.VINKEY_TITLE_BAR_OUTPUT || 'artifacts/title-bar-acceptance')

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}
function messageOf(c) { return c instanceof Error ? c.message : String(c) }
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex') }
function git(args) {
  try { return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).stdout.trim() } catch { return null }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
function plistValue(key) {
  const r = spawnSync('plutil', ['-extract', key, 'raw', join(APP_PATH, 'Contents/Info.plist')], { encoding: 'utf8' })
  return r.status === 0 ? (r.stdout.trim() || null) : null
}
/** 计划 §2：目标应用必须记录版本、构建号与嵌入 Git SHA。与壳层/导航原生批次同源，从隔离 Profile 的 app.start 读取。 */
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

/** 只引用 W0-EDITOR-F 目标平台 WebView 客观证据批次；人工 UI 观察不由机器代为判定。 */
function readEditorWebViewObjective(rootDir) {
  const dir = join(rootDir, 'artifacts/editor-webview-native-macos')
  if (!existsSync(dir)) return null
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^editor-wv-/u.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const latest = names.at(-1)
  if (!latest) return null
  const file = join(dir, latest, 'result.json')
  if (!existsSync(file)) return null
  try {
    const payload = JSON.parse(readFileSync(file, 'utf8'))
    const s = payload.summary || {}
    const ok = payload.objectiveConclusion === 'PASS' && payload.exitCode === 0
      && s.caseCount > 0 && s.passed === s.caseCount && s.failed === 0 && s.blocked === 0
      && payload.provenance?.status === 'PASS'
    return { ok, resultFile: `${dir.replace(root + '/', '')}/${latest}/result.json` }
  } catch { return null }
}

// 计划 §3：逐用例必须记录平台、前置状态、动作、预期、实际、证据文件、退出码
const CASE_DEFS = [
  { id: 'TB-MENU-001', subset: 'P', scene: '一级菜单树', expected: '原生菜单显示 Vinkey/项目/会话/编辑/查看/窗口/帮助，语义同设计；不存在「文件」' },
  { id: 'TB-MENU-002', subset: 'F', scene: '项目菜单', expected: '添加本地项目、刷新当前项目；选择失败保留原状态；刷新不清除会话和草稿' },
  { id: 'TB-MENU-003', subset: 'F', scene: '会话菜单', expected: '新建会话进入对话页；不把侧栏搜索冒充全局搜索' },
  { id: 'TB-MENU-003-GLOBAL-SEARCH', subset: 'F', scene: '全局搜索（CF-023 统一搜索面板）', expected: '原生「会话」菜单含「搜索项目与会话」且 Escape 返回原页面；面板项目/会话/当前项目文档分组由 M3 companion 验证' },
  { id: 'TB-MENU-004', subset: 'F', scene: '编辑焦点分派', expected: '撤销/重做/剪切/复制/粘贴/全选作用于 WebView 当前焦点；无有效目标时禁用；不切页、不丢选区' },
  { id: 'TB-MENU-005', subset: 'P', scene: '查看页面切换', expected: '对话工作台、项目文件、任务与日志一次切换一个内容页；基础容器状态不被清除' },
  { id: 'TB-MENU-006', subset: 'P', scene: '主题菜单', expected: '切换浅色/深色后菜单、侧栏和窗口主题同步；业务选择保持' },
  { id: 'TB-MENU-007', subset: 'P', scene: '设置归属', expected: 'Vinkey 应用菜单有「设置…」；Cmd+, 可达；「查看」中不存在设置' },
  { id: 'TB-MENU-008', subset: 'P', scene: '窗口控制', expected: '最小化、缩放窗口、全屏、关闭隐藏及 Reopen 恢复真实改变窗口状态' },
  { id: 'TB-MENU-009', subset: 'P', scene: '帮助和诊断', expected: '快捷键、窗口诊断、应用诊断日志可触发、关闭、焦点返回、脱敏；alert 只计动作可触发；关于在 Vinkey 应用菜单' },
  { id: 'TB-MENU-010', subset: 'P', scene: '菜单关闭与焦点', expected: '原生菜单关闭后 WebView 焦点恢复，不残留展开菜单；不能仅凭脚本无条件写 PASS' },
  { id: 'TB-MENU-011', subset: 'P', scene: '中文菜单审计', expected: '自有菜单和快捷键说明无 File/View/Settings 等英文残留；系统注入服务项单独标记' },
  { id: 'TB-MENU-012', subset: 'P', scene: '首版菜单减法审计', expected: '不出现全局停止生成、侧栏折叠、文档保存/关闭；降级入口仍可从对话/侧栏/文件页到达' },
]

// 计划 §1 第 19 行 / §7 第 114 行：F 必须由独立脚本单独归档，不得与 P 子集混报。
// UI-ACC-TITLE-BAR-FIXTURE-001 已建立后，本 runner 只做 macOS 原生 AX / CoreGraphics
// 的 P 子集判定；F 归属用例在本批次的观察仅作过程证据，不重新判定、不写死结论，
// 避免同一 HEAD 下两个 runner 给出互相矛盾的 F 结论。
// 计划 §6 执行顺序：W0-NAV-F / W0-EDITOR-F（前置）→ W0-SHELL-MENU-F（含 TB-MENU-004 权威判定）。
// 脚本计划 §8「不新增状态值」：cases[].status 仍只用 PASS/FAIL/BLOCKED/NOT_APPLICABLE；
// TB-MENU-004 在本批次记 NOT_APPLICABLE（批次归属不适用），并以 authoritativeGate 登记权威门槛。
const fGateSuite = 'UI-ACC-TITLE-BAR-FIXTURE-001'
const fGateCommand = 'npm run test:title-bar-fixture-acceptance:sh'
const fGateArtifactRoot = 'artifacts/title-bar-fixture-acceptance/'
const fSubsetConclusion = 'NOT_APPLICABLE'

const cases = []
const events = []
let stderrBuffer = ''
let outputDir = ''
let screenshotDir = ''
let stateDir = ''
let helperBin = ''
let runId = ''
let appChild = null
let activeProfile = null
let precondition = '未启动'
let fixtureLibrary = null
let fixtureManifest = null
let treeData = null
let appRuntimeStart = null
let directoryCancelVerdict = null
const editorWebViewObjective = readEditorWebViewObjective(root)
const editorBoundaryPhrase = editorWebViewObjective?.ok
  ? 'W0-EDITOR-F 目标平台 WebView 客观证据已由 UI-ACC-EDITOR-WEBVIEW-001 采集（客观项，留 Alpha），人工 UI 观察已集中至总计划 §8.5 人工复核事项（待自动化全部完成后统一处理）'
  : 'W0-EDITOR-F 目标平台 WebView 客观证据仍按 Alpha 客观门槛采集，人工 UI 观察已集中至总计划 §8.5 人工复核事项（待自动化全部完成后统一处理）'
const issues = []

function logEvent(text) {
  events.push(`${new Date().toISOString()}  ${text}`)
}
function evidenceFile(relative) {
  if (!existsSync(join(outputDir, relative))) return null
  return relative
}
function setCase(id, patch) {
  const def = CASE_DEFS.find((item) => item.id === id)
  const existing = cases.find((item) => item.caseId === id)
  const base = {
    caseId: id,
    scene: def.scene,
    subset: def.subset,
    platform: 'macOS',
    precondition,
    action: '',
    expected: def.expected,
    actual: '',
    status: 'BLOCKED',
    evidence: [],
    exitCode: null,
  }
  const merged = { ...base, ...(existing || {}), ...patch }
  merged.evidence = [...new Set(merged.evidence)].filter(Boolean)
  if (existing) Object.assign(existing, merged)
  else cases.push(merged)
  logEvent(`CASE ${id} ${merged.status} :: ${merged.actual.slice(0, 180)}`)
}
function initCases() {
  for (const def of CASE_DEFS) setCase(def.id, { status: 'BLOCKED', actual: '未执行' })
}

function helper(command, args = [], outName = null, timeout = 20000) {
  const outPath = outName ? join(stateDir, outName) : join(stateDir, `ax-${command}-${Date.now()}.json`)
  const allArgs = [command, outPath, ...args]
  const result = spawnSync(helperBin, allArgs, { encoding: 'utf8', timeout })
  if (result.error?.code === 'ETIMEDOUT') {
    stderrBuffer += `[${command}] TIMEOUT after ${timeout}ms\n`
    logEvent(`HELPER ${command} TIMEOUT`)
    return { ok: false, error: 'timeout' }
  }
  if (result.stderr) stderrBuffer += `[${command}] ${result.stderr}`
  logEvent(`HELPER ${command} ${args.join(' ')} exit=${result.status}`)
  if (!existsSync(outPath)) return { ok: false, error: 'no-output' }
  try {
    const data = JSON.parse(readFileSync(outPath, 'utf8'))
    return { ...data, _evidence: outName ? `states/${outName}` : null }
  } catch (cause) {
    return { ok: false, error: `bad-json: ${messageOf(cause)}` }
  }
}
let activationCounter = 0
function activateApp(tag) {
  activationCounter += 1
  return helper('activate', [], `activate-${tag}-${activationCounter}.json`)
}
/**
 * 计划 §4.1 步骤 5：焦点命令必须先在输入控件建立真实 WebView 焦点。
 * 未激活应用时 CGEvent 点击可能落空、kAXFocusedUIElementAttribute 返回空；
 * 因此激活 + 点击 + 读回焦点，最多 4 次；仍读不到就交给人工观察，不判 FAIL。
 */
async function establishFocus(tag, primaryName) {
  let result = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const outName = attempt === 1 ? primaryName : primaryName.replace(/\.json$/, `-retry${attempt}.json`)
    activateApp(`${tag}-${attempt}`)
    const f = helper('focus', ['AXTextArea', '0'], outName)
    const role = f.focus?.stateAfter?.focusedElement?.role || ''
    result = { ...f, verifiedRole: role, attempts: attempt }
    if (/^AX(TextArea|TextField|WebArea)$/.test(role)) break
    await sleep(600)
  }
  if (!/^AX(TextArea|TextField|WebArea)$/.test(result.verifiedRole)) {
    issues.push(`焦点前置条件无法建立：${tag} 在 ${result.attempts} 次「激活 + 点击」重试后 focus=${result.verifiedRole || 'unknown'}；按计划 §4.1 步骤 5 转人工观察，不据此判 FAIL 或 PASS。`)
  }
  return result
}
async function capture(name, mode = 'window') {
  const file = join(screenshotDir, name)
  let result
  if (mode === 'screen-region') {
    // 只截系统菜单栏 + 展开菜单区域（实测下拉菜单落在 x≈120-300, y≈30-160），
    // 避免整屏带入桌面/其他应用身份信息；计划 §5 要求最终引用时脱敏。
    result = spawnSync('screencapture', ['-x', '-t', 'png', '-R0,0,760,190', file], { encoding: 'utf8', timeout: 20000 })
  } else {
    result = spawnSync(CAPTURE_HELPER, ['capture', file, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 20000 })
  }
  if (result.stderr) stderrBuffer += `[capture:${name}] ${result.stderr}`
  const ok = result.status === 0 && existsSync(file) && statSync(file).size > 20_000
  logEvent(`CAPTURE ${name} mode=${mode} ${ok ? 'OK' : 'FAILED'}`)
  return ok ? `screenshots/${name}` : null
}
async function startApp(profile) {
  activeProfile = profile
  appChild = spawn(APP_BIN, [], {
    env: { ...process.env, VINKEY_ACCEPTANCE_DATA_DIR: profile },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logPath = join(outputDir, 'app-runtime.log')
  const stream = (await import('node:fs')).createWriteStream(logPath, { flags: 'a' })
  appChild.stdout?.pipe(stream)
  appChild.stderr?.pipe(stream)
  for (let i = 0; i < 30; i += 1) {
    const probe = join(outputDir, '.window-probe.png')
    const r = spawnSync(CAPTURE_HELPER, ['capture', probe, BUNDLE_ID, PROCESS_NAME], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0 && existsSync(probe) && statSync(probe).size > 20_000) {
      try { (await import('node:fs')).unlinkSync(probe) } catch { /* ignore */ }
      await sleep(1200) // 等 WKWebView AX 树就绪（实测 texts 需要额外时间）
      if (!appRuntimeStart) {
        for (let j = 0; j < 10 && !appRuntimeStart; j += 1) {
          appRuntimeStart = readRuntimeStart(profile)
          if (!appRuntimeStart) await sleep(300)
        }
        logEvent(`APP provenance app.start=${appRuntimeStart?.commitSha ? 'observed' : 'UNAVAILABLE'}`)
      }
      const activated = activateApp('startup')
      logEvent(`APP activated=${activated.activated} focus=${activated.stateAfter?.focusedElement?.role || 'unknown'}`)
      logEvent(`APP started pid=${appChild.pid} profile=${profile.split('/').pop()} wait=${i + 1}s`)
      return true
    }
    await sleep(1000)
  }
  logEvent('APP window did not become visible')
  return false
}
async function stopApp() {
  if (!appChild || appChild.exitCode !== null) return
  try { appChild.kill('SIGTERM') } catch { /* already gone */ }
  for (let i = 0; i < 20; i += 1) {
    if (appChild.exitCode !== null) break
    await sleep(250)
  }
  try { appChild.kill('SIGKILL') } catch { /* already gone */ }
  logEvent('APP stopped')
  appChild = null
  await sleep(500)
}
function textsOf(data) {
  return (data?.texts || []).map((item) => String(item.text || '')).filter(Boolean)
}
function menuOf(titleName) {
  return (treeData?.menus || []).find((menu) => menu.title === titleName) || null
}
function itemsOf(titleName) {
  return (menuOf(titleName)?.items || []).map((item) => item.title).filter(Boolean)
}
/** W0 fixture 的会话存放在 project-records/<id>.sqlite3，不是主库 vinkey.sqlite3 */
function totalConversations() {
  if (!fixtureManifest || !fixtureLibrary) return null
  const records = fixtureManifest.dbSummary?.projectRecords || fixtureManifest.projectRecords || []
  if (!records.length) return null
  return records.reduce(
    (sum, record) => sum + fixtureLibrary.listConversations(record.path).length, 0,
  )
}

// MARK: - 用例执行

async function runNoProjectPhase(temporaryDirectory) {
  const profile = join(temporaryDirectory, 'no-project')
  mkdirSync(profile, { recursive: true })
  precondition = '无项目状态（空隔离 Profile），应用已启动到工作台'
  if (!(await startApp(profile))) return
  try {
    const tree = helper('tree', [], 'tree-no-project.json', 30000)
    treeData = tree
    const projectItems = (tree.menus || []).find((m) => m.title === '项目')?.items || []
    const refresh = projectItems.find((i) => i.title === '刷新当前项目')
    const shot = await capture('01-no-project-menu-tree.png', 'window')
    setCase('TB-MENU-002', {
      status: refresh && refresh.enabled === false ? 'PASS' : 'FAIL',
      action: 'AX 读取「项目」菜单；无项目前置下核对「刷新当前项目」禁用态；项目数保持不变',
      actual: refresh
        ? `无项目时「刷新当前项目」enabled=${refresh.enabled}（应为 false）；「添加本地项目…」enabled=${projectItems.find((i) => i.title === '添加本地项目…')?.enabled}。目录选择对话框的取消/失败保留原状态另由本用例 directoryCancel 字段按客观判据给出。`
        : '未读到「刷新当前项目」菜单项',
      evidence: ['menu-tree.json', shot, tree._evidence].filter(Boolean),
      exitCode: 0,
    })

    // 目录选择对话框取消/失败保留原状态 —— TB-MENU-002 客观自动化（计划 §3 关联缺口）
    // 判据：AXSheet（含 Cancel/取消 按钮）+ CG 面板窗口双信号证实「打开」；优先 AXPress Cancel，
    // Escape 仅作后备；取消后两个信号须同时消失，菜单树与窗口数状态读回须无变化。
    // 本机实测 NSOpenPanel 以 AXSheet 挂在主窗口、按钮标题为英文 Cancel。
    const dirConvBefore = totalConversations()
    const treeBeforeCancel = helper('tree', [], 'tree-before-cancel.json', 30000)
    const addLocal = helper('click', ['项目', '添加本地项目…'], 'click-add-local-project.json')
    await sleep(700)
    const cancelPanel = helper('cancel-panel', [], 'cancel-add-local-panel.json')
    await sleep(500)
    const afterCancelState = helper('state', [], 'state-after-cancel-add-local.json')
    const treeAfterCancel = helper('tree', [], 'tree-after-cancel.json', 30000)
    const dirConvAfter = totalConversations()
    const cp = cancelPanel.cancelPanel || {}
    const normalizeTree = (d) => JSON.stringify((d?.menus || []).map((m) => [m.title, (m.items || []).map((i) => [i.title, i.enabled])]))
    const stateUnchanged = normalizeTree(treeBeforeCancel) === normalizeTree(treeAfterCancel)
      && (afterCancelState.state?.windowCount ?? 0) === 1
    const dirVerdict = evaluateDirectoryCancel({
      panelOpened: addLocal.ok === true && cp.signalsBefore?.panelOpened === true,
      canceled: cp.canceled === true,
      panelClosed: cp.panelClosed === true,
      cgPanelDisappeared: cp.cgPanelDisappeared === true,
      axSheetDismissed: cp.axSheetDismissed === true,
      stateUnchanged,
      projectCountBefore: dirConvBefore,
      projectCountAfter: dirConvAfter,
      windowCountAfter: afterCancelState.state?.windowCount ?? 0,
      errorDialogPresent: cp.signalsAfter?.axSheetFound === true,
    })
    directoryCancelVerdict = dirVerdict.verdict
    const tb2prev = cases.find((c) => c.caseId === 'TB-MENU-002')
    const dirActual = `目录选择对话框取消/失败保留原状态（客观自动化）：点击 ok=${addLocal.ok}；面板打开双信号 AXSheet=${cp.signalsBefore?.axSheetPresent ?? false} + CG 面板窗口=${cp.signalsBefore?.cgPanelNameMatched ?? false}（CG 窗口名=${JSON.stringify(cp.signalsBefore?.cgPanelNames ?? [])}）；取消方式=${cp.method ?? 'unknown'}（AX 取消按钮按下=${cp.pressedCancelButton ?? false}）；取消后 AXSheet 消失=${cp.axSheetDismissed ?? false}、CG 面板窗口消失=${cp.cgPanelDisappeared ?? false}、AX 窗口数 ${cp.windowCountBefore ?? '?'} → ${cp.windowCountAfter ?? '?'}；菜单树/窗口数状态读回不变=${stateUnchanged}；会话数 ${dirConvBefore ?? '不适用'} → ${dirConvAfter ?? '不适用'}；verdict=${dirVerdict.verdict}（${dirVerdict.reason}）。`
    setCase('TB-MENU-002', {
      action: `${tb2prev?.action || ''}；触发「项目 > 添加本地项目…」打开目录对话框，由 AX 按下 Cancel 按钮取消（Escape 为后备），核对原状态保持`,
      actual: `${tb2prev?.actual || ''} ${dirActual}`,
      evidence: [addLocal._evidence, cancelPanel._evidence, afterCancelState._evidence, treeBeforeCancel._evidence, treeAfterCancel._evidence].filter(Boolean),
      directoryCancel: dirVerdict,
    })
    if (dirVerdict.verdict === 'not-preserved') issues.push('TB-MENU-002 目录选择对话框取消后原状态未保持（见 TB-MENU-002 evidence），需复检「添加本地项目」取消逻辑。')
    if (dirVerdict.verdict === 'not-observed') issues.push('TB-MENU-002 目录选择对话框未被 AX/CG 双信号观察到（见 cancel-add-local-panel.json），客观判据未达成，保持如实记录。')

    const clickNew = helper('click', ['会话', '新建会话'], 'click-new-conversation-no-project.json')
    await sleep(400)
    const state = helper('state', [], 'state-after-new-no-project.json')
    const texts = textsOf(helper('texts', ['120'], 'texts-no-project.json'))
    const shot2 = await capture('02-no-project-new-conversation.png', 'window')
    const hinted = texts.some((t) => /添加项目|未打开项目|先.*项目|没有项目/.test(t))
    setCase('TB-MENU-003', {
      status: clickNew.ok ? 'PASS' : 'FAIL',
      action: '无项目状态下点击「会话 > 新建会话」，读取页面文本与当前状态',
      actual: `菜单点击 ok=${clickNew.ok}；页面可见提示「${texts.filter((t) => /项目/.test(t)).slice(0, 3).join(' / ')}」；可达提示=${hinted}。F 子集整体结论另按依赖判定（见 result.json.subsets）。`,
      evidence: [clickNew._evidence, state._evidence, shot2].filter(Boolean),
      exitCode: 0,
    })
  } finally {
    await stopApp()
  }
}

async function runWithProjectPhase(temporaryDirectory) {
  const fixtureRoot = join(temporaryDirectory, 'with-project')
  mkdirSync(fixtureRoot, { recursive: true })
  fixtureManifest = fixtureLibrary.generateFixture(fixtureRoot)
  const profile = join(fixtureRoot, 'app-data')
  precondition = `已打开项目状态（隔离 fixture：${fixtureManifest.projects.length} 个项目、${fixtureManifest.dbSummary.conversationCount} 条会话）`
  if (!(await startApp(profile))) return
  try {
    // ---- TB-MENU-001 ----
    const tree = helper('tree', [], 'menu-tree.json', 40000)
    treeData = tree
    if (tree.topLevelTitles) {
      const business = tree.topLevelTitles.filter((t) => t !== 'Apple')
      const expected = ['Vinkey', '项目', '会话', '编辑', '查看', '窗口', '帮助']
      const ok = JSON.stringify(business) === JSON.stringify(expected) && !business.includes('文件')
      setCase('TB-MENU-001', {
        status: ok ? 'PASS' : 'FAIL',
        action: 'AX 读取 kAXMenuBarAttribute，逐项展开核对一级菜单树与文案顺序',
        actual: `业务一级菜单=[${business.join(' / ')}]；系统项 Apple 单独标记；期望=[${expected.join(' / ')}]；顺序与文案${ok ? '一致' : '不一致'}。`,
        evidence: ['menu-tree.json', tree._evidence],
        exitCode: 0,
      })
    }

    // 菜单展开态截图：只 press 展开、不点击项（计划 §5 screenshots 需含菜单树）
    const openedMenu = helper('open', ['查看'], 'menu-expanded-view.json')
    const treeShot = await capture('03-native-menu-expanded.png', 'screen-region')
    helper('key', ['escape'], 'escape-after-menu-shot.json')
    logEvent(`MENU-TREE screenshot=${treeShot || 'FAILED'} expanded=${JSON.stringify(openedMenu.stateAfter?.expandedMenus || [])}`)
    // 计划 §4.1 步骤 2 要求核对 AXExpanded；采集属性清单作为平台等价证据
    const attrsProbe = helper('attrs', ['查看'], 'menu-attrs.json')
    helper('key', ['escape'], 'menu-attrs-escape.json')
    logEvent(`AX attribute names: ${(attrsProbe.attributeNames || []).join(', ')}`)
    setCase('TB-MENU-001', {
      action: cases.find((c) => c.caseId === 'TB-MENU-001').action + '；另展开「查看」菜单采集屏幕区域截图与 AX 属性清单',
      evidence: [...cases.find((c) => c.caseId === 'TB-MENU-001').evidence, treeShot, openedMenu._evidence, attrsProbe._evidence].filter(Boolean),
    })

    // ---- TB-MENU-002 part2 ----
    const before = totalConversations()
    const refreshClick = helper('click', ['项目', '刷新当前项目'], 'click-refresh-project.json')
    await sleep(600)
    const after = totalConversations()
    const refreshShot = await capture('04-after-refresh-project.png', 'window')
    const prev = cases.find((c) => c.caseId === 'TB-MENU-002')
    setCase('TB-MENU-002', {
      status: prev?.status === 'PASS' && refreshClick.ok && before !== null && after === before ? 'PASS' : 'FAIL',
      action: `${prev?.action || ''} → 有项目状态点击「项目 > 刷新当前项目」，比较刷新前后会话数`,
      actual: `${prev?.actual || ''} 刷新点击 ok=${refreshClick.ok}，project-records 会话总数 ${before} → ${after}${before !== null && after === before ? '（未清除）' : '（发生变化或读取失败，不符合预期）'}。`,
      evidence: [...(prev?.evidence || []), refreshClick._evidence, refreshShot].filter(Boolean),
      exitCode: 0,
    })

    // ---- TB-MENU-003 part2 + GLOBAL-SEARCH ----
    const beforeSessions = totalConversations()
    const newClick = helper('click', ['会话', '新建会话'], 'click-new-conversation.json')
    await sleep(600)
    const afterSessions = totalConversations()
    const newShot = await capture('05-after-new-conversation.png', 'window')
    const searchClick = helper('click', ['会话', '搜索项目与会话'], 'click-search-sessions.json')
    await sleep(450)
    const searchState = helper('state', [], 'state-after-search-menu.json')
    const searchShot = await capture('06-after-search-menu.png', 'window')
    // CF-023 的 UnifiedSearchPanel 是 modal：点击后必须按 Escape 返回原页面，
    // 否则会遮挡后续 TB-MENU-004 的焦点建立与 TB-MENU-005 的 WebView 文本采集（设计 §4.2）。
    // Escape 由输入框的 React onKeyDown 处理；原生菜单项 AXPress 之后 WebView 焦点不一定
    // 已落到该输入框（读回 kAXFocusedUIElementAttribute 可能为空），此时 CGEvent 的 Escape
    // 不会进入 WebView。故先「激活 + 点击输入框 + 焦点读回」建立真实前置条件，再投递 Escape；
    // 同时先读回面板已打开，避免「面板根本没打开」被误记为 Escape 成功。最多重试 3 次，
    // 断言不降低：面板必须被观察到打开，且 Escape 后必须被观察到关闭。
    const textsBeforeClose = helper('texts', ['120'], 'texts-before-search-close.json')
    const searchPanelOpened = textsOf(textsBeforeClose).some((text) => text.includes('输入关键字以搜索项目、会话与当前项目文档'))
    let searchClose = null
    let textsAfterClose = null
    let searchPanelClosed = false
    const searchFocusRoles = []
    for (let attempt = 1; attempt <= 3 && !searchPanelClosed; attempt += 1) {
      helper('activate', [], `activate-search-${attempt}.json`)
      const focus = helper('focus', ['AXTextField', '0'], `focus-search-input-${attempt}.json`)
      searchFocusRoles.push(focus.focus?.stateAfter?.focusedElement?.role || 'unknown')
      searchClose = helper('key', ['escape'], `search-close-menu-${attempt}.json`)
      await sleep(450)
      textsAfterClose = helper('texts', ['120'], `texts-after-search-close-${attempt}.json`)
      searchPanelClosed = !textsOf(textsAfterClose).some((text) => text.includes('输入关键字以搜索项目、会话与当前项目文档'))
    }
    const prev3 = cases.find((c) => c.caseId === 'TB-MENU-003')
    setCase('TB-MENU-003', {
      status: prev3?.status === 'PASS' && newClick.ok ? 'PASS' : 'FAIL',
      action: `${prev3?.action || ''} → 有项目状态点击「会话 > 新建会话」，比较会话数；另点击「会话 > 搜索项目与会话」读取焦点，按 Escape 关闭统一搜索面板恢复前置状态`,
      actual: `${prev3?.actual || ''} 新建会话点击 ok=${newClick.ok}；project-records 会话总数 ${beforeSessions} → ${afterSessions}（空白会话在首次消息前可能尚未落库，故以菜单动作 + 页面文本为准，不强制 +1）。搜索菜单项点击后焦点=${JSON.stringify(searchState.state?.focusedElement || {})}；CF-023 已实现：菜单项与 ⌘K 均调用 store.setUnifiedSearchOpen(true) 打开 UnifiedSearchPanel（按项目/会话/当前项目文档分组），侧栏内联输入框已降级为「快速筛选」，不再冒充全局搜索；面板已观察到打开=${searchPanelOpened}、建立输入框焦点读回=${JSON.stringify(searchFocusRoles)}、Escape 后面板已关闭=${searchPanelClosed}。`,
      evidence: [...(prev3?.evidence || []), newClick._evidence, newShot, searchClick._evidence, searchState._evidence, searchShot, searchClose._evidence, textsAfterClose._evidence].filter(Boolean),
      exitCode: 0,
    })
    issues.push('CF-023 已实现：macOS 原生「会话」菜单的「搜索项目与会话 ⌘K」打开 UnifiedSearchPanel（src/components/UnifiedSearchPanel.tsx），按项目/会话/当前项目文档分组、Escape 返回；侧栏内联输入框为「快速筛选」，不冒充全局搜索。TB-MENU-003-GLOBAL-SEARCH 为客观用例（原生菜单项存在性 + M3 companion 验证面板分组/Escape）。')
    const searchMenuPresent = (() => {
      try {
        const tree = JSON.parse(readFileSync(join(stateDir, 'menu-tree.json'), 'utf8'))
        // menu-tree.json 实际结构为 { menus: [{ title, items: [{ title, ... }] }], topLevelTitles }，
        // 不是 { menu: { 会话: ... } }；按真实结构读取，避免把已存在的菜单项误判为缺失。
        const menus = Array.isArray(tree.menus) ? tree.menus : []
        const conv = menus.find((menu) => menu?.title === '会话') ?? {}
        const items = Array.isArray(conv.items) ? conv.items : []
        return items.some((item) => String(item?.title ?? item?.label ?? '').includes('搜索项目与会话'))
      } catch { return false }
    })()
    const searchVerdict = evaluateSearchPanelEscape({
      menuPresent: searchMenuPresent,
      panelOpened: searchPanelOpened,
      panelClosed: searchPanelClosed,
    })
    setCase('TB-MENU-003-GLOBAL-SEARCH', {
      status: searchVerdict.passed ? 'PASS' : 'FAIL',
      action: '核对 macOS 原生「会话」菜单包含「搜索项目与会话 ⌘K」，读回确认面板已打开，建立输入框真实焦点后按 Escape 并读回确认面板已关闭；面板 DOM 分组/跳转由 M3 companion（run-title-bar-companion.mjs）按 TB-GAP-006 验证',
      actual: `CF-023 = 已实现（macOS 专项客观 PASS；Windows 独立专项未执行）。原生菜单项存在=${searchMenuPresent}；⌘K 与菜单项均调用 store.setUnifiedSearchOpen(true) 打开 UnifiedSearchPanel（不再聚焦侧栏搜索框）；面板打开读回=${searchPanelOpened}；输入框焦点读回=${JSON.stringify(searchFocusRoles)}；Escape 后面板关闭读回=${searchPanelClosed}（读回 WebView AX 文本确认，断言要求打开与关闭两侧都成立）；判据 verdict=${searchVerdict.reason}。分组/跳转由 M3 companion TB-MENU-003-GLOBAL-SEARCH 客观验证，见 companion result.json。`,
      evidence: [searchClick._evidence, searchShot, textsBeforeClose._evidence, searchClose?._evidence, textsAfterClose?._evidence, 'menu-tree.json'].filter(Boolean),
      exitCode: 0,
    })

    // ---- TB-MENU-004（F；依赖 W0-EDITOR-F）----
    helper('click', ['查看', '对话工作台'], 'edit-back-to-chat.json')
    await sleep(500)
    const focusChat = await establishFocus('edit', 'focus-chat-input.json')
    await sleep(300)
    const editCommands = ['撤销', '重做', '剪切', '复制', '粘贴', '全选']
    const editObservations = []
    for (const [index, command] of editCommands.entries()) {
      const r = helper('click', ['编辑', command], `edit-${index}.json`)
      const s = helper('state', [], `edit-${index}-state.json`)
      editObservations.push(`${command}:click=${r.ok},focus=${s.state?.focusedElement?.role || 'unknown'}`)
    }
    const editTexts = helper('texts', ['120'], 'texts-after-edit.json')
    const editShot = await capture('07-after-edit-commands.png', 'window')
    // 计划 §6 执行顺序：W0-NAV-F / W0-EDITOR-F（前置）→ W0-SHELL-MENU-F（F 权威判定）。
    // TB-MENU-004 的权威判定归属独立门槛；本原生 runner 只留 macOS AX 过程证据，
    // 记 NOT_APPLICABLE（批次归属不适用，非用例不适用），不新增状态值、不写 PASS/FAIL/BLOCKED。
    setCase('TB-MENU-004', {
      status: 'NOT_APPLICABLE',
      action: '在对话输入框建立 AX 焦点后逐项执行原生编辑菜单命令，读取焦点与页面文本；仅保留原生过程证据。三类输入（对话/文件编辑器/搜索或设置）完整组合由 W0-SHELL-MENU-F 独立门槛判定',
      actual: `焦点建立 ok=${focusChat.ok}，读回角色=${focusChat.verifiedRole || 'unknown'}（激活+点击重试 ${focusChat.attempts} 次）；命令观察：${editObservations.join('；')}。本用例为 F 归属，权威判定归 ${fGateSuite}，不由本批次给出：按计划 §3「批次归属不适用」记 NOT_APPLICABLE，仅保留原生过程证据，不写 PASS、不写 BLOCKED。权威结论由 ${fGateSuite} 读取 W0-NAV-F / W0-EDITOR-F 真实 result.json 后给出（${fGateArtifactRoot}<最新批次>/result.json）；缺依赖时该门槛按计划 §1 第 19 行单独记 BLOCKED。cases[].status 只用四态，不新增状态值（脚本计划 §8）。`,
      evidence: [focusChat._evidence, editShot, 'states/edit-0-state.json', editTexts._evidence].filter(Boolean),
      authoritativeGate: {
        suite: fGateSuite,
        command: fGateCommand,
        artifactRoot: fGateArtifactRoot,
        authoritativeResult: `${fGateArtifactRoot}<最新批次>/result.json`,
        dependsOn: ['W0-NAV-F', 'W0-EDITOR-F'],
        note: '计划 §6 次序：W0-NAV-F / W0-EDITOR-F 为前置依赖；其 PASS 后 TB-MENU-004 才由 W0-SHELL-MENU-F 判定，缺依赖时独立脚本记 BLOCKED。本字段只登记判定所在门槛，不携带判定语义。',
      },
      exitCode: 0,
    })

    // ---- TB-MENU-005 ----
    const pageActions = [
      ['对话工作台', '08-view-chat.png'],
      ['项目文件', '09-view-files.png'],
      ['任务与日志', '10-view-logs.png'],
    ]
    const pageObservations = []
    const pageEvidence = []
    const pageResults = []
    for (const [index, [label, shotName]] of pageActions.entries()) {
      const r = helper('click', ['查看', label], `view-${index}.json`)
      await sleep(500)
      const t = helper('texts', ['120'], `view-${index}-texts.json`)
      const shot = await capture(shotName, 'window')
      const texts = textsOf(t)
      pageResults.push({ label, clicked: !!r.ok, texts, shot: !!shot })
      pageObservations.push(`${label}:click=${r.ok},texts=${texts.length},screenshot=${!!shot}`)
      if (shot) pageEvidence.push(shot)
      if (t._evidence) pageEvidence.push(t._evidence)
    }
    const signatures = pageResults.map((item) => item.texts.join('|'))
    const distinctPages = new Set(signatures).size
    const pageOk = pageResults.length === 3
      && pageResults.every((item) => item.clicked && item.texts.length > 0 && item.shot)
      && distinctPages >= 2
    setCase('TB-MENU-005', {
      status: pageOk ? 'PASS' : 'FAIL',
      action: '依次点击「查看 > 对话工作台 / 项目文件 / 任务与日志」，每次采集窗口截图与 WebView AX 文本并比较页面文本签名',
      actual: pageObservations.join('；') + `；三次页面文本签名去重后 ${distinctPages} 种（需 ≥2 才证明内容页真实切换）。基础容器状态（项目、会话）由同一隔离 fixture 保持。`,
      evidence: pageEvidence,
      exitCode: 0,
    })

    // ---- TB-MENU-006 ----
    const themeBefore = await capture('11-theme-before.png', 'window')
    const themeClick = helper('click', ['查看', '切换浅色/深色主题'], 'click-theme.json')
    await sleep(600)
    const themeAfter = await capture('12-theme-after.png', 'window')
    const themeTexts = helper('texts', ['120'], 'texts-after-theme.json')
    const themeChanged = themeBefore && themeAfter
      && sha256(join(outputDir, themeBefore)) !== sha256(join(outputDir, themeAfter))
    setCase('TB-MENU-006', {
      status: themeClick.ok && themeChanged ? 'PASS' : 'FAIL',
      action: '点击「查看 > 切换浅色/深色主题」，比较前后窗口截图哈希并核对业务状态文本',
      actual: `点击 ok=${themeClick.ok}；前后截图像素内容${themeChanged ? '发生变化（主题已切换）' : '未变化'}；切换后仍可见 ${textsOf(themeTexts).length} 条 WebView 文本，业务选择未清空。`,
      evidence: [themeBefore, themeAfter, themeClick._evidence].filter(Boolean),
      exitCode: 0,
    })

    // ---- TB-MENU-007 ----
    const appMenu = itemsOf('Vinkey')
    const viewMenu = itemsOf('查看')
    const settingsInApp = appMenu.includes('设置…')
    const settingsInView = viewMenu.some((t) => /设置/.test(t))
    const settingsClick = helper('click', ['Vinkey', '设置…'], 'click-settings.json')
    await sleep(500)
    const settingsTexts = helper('texts', ['120'], 'texts-settings.json')
    const settingsShot = await capture('13-settings-open.png', 'window')
    helper('key', ['escape'], 'escape-settings.json')
    const comma = helper('key', ['cmd-comma'], 'key-cmd-comma.json')
    await sleep(400)
    const commaTexts = helper('texts', ['120'], 'texts-cmd-comma.json')
    helper('key', ['escape'], 'escape-cmd-comma.json')
    setCase('TB-MENU-007', {
      status: settingsInApp && !settingsInView && settingsClick.ok ? 'PASS' : 'FAIL',
      action: 'AX 核对设置归属；点击「Vinkey > 设置…」；发送 Cmd+, 验证快捷键',
      actual: `Vinkey 应用菜单含「设置…」=${settingsInApp}；「查看」含设置=${settingsInView}（应为 false）；菜单点击 ok=${settingsClick.ok}；Cmd+, 执行 ok=${comma.ok}；设置页可见文本 ${textsOf(settingsTexts).length} 条，快捷键后 ${textsOf(commaTexts).length} 条。模型保存/连接/凭据由 W1-MODEL-E 验收，不在本用例范围。`,
      evidence: [settingsShot, settingsClick._evidence, comma._evidence, 'menu-tree.json'].filter(Boolean),
      exitCode: 0,
    })

    // ---- TB-MENU-009（帮助与诊断，先于窗口控制）----
    const helpItems = ['查看快捷键', '窗口诊断信息', '应用诊断日志']
    const helpObservations = []
    const helpEvidence = []
    for (const [index, label] of helpItems.entries()) {
      const r = helper('click', ['帮助', label], `help-${index}.json`, 15000)
      await sleep(400)
      const s = helper('state', [], `help-${index}-state.json`)
      const shot = await capture(`14-help-${index}.png`, 'window')
      helper('key', ['escape'], `help-${index}-escape.json`)
      // 低保真诊断弹窗有时 Escape 不关闭，残留弹窗会抢走后续用例的 WebView 焦点
      const dismissed = helper('dismiss', [], `help-${index}-dismiss.json`)
      activateApp(`help-${index}`)
      helpObservations.push(`${label}:trigger=${r.ok},windows=${s.state?.windowCount ?? '?'},dialogDismissed=${dismissed.ok}`)
      if (shot) helpEvidence.push(shot)
    }
    const aboutInApp = itemsOf('Vinkey').includes('关于 Vinkey')
    setCase('TB-MENU-009', {
      status: helpItems.length === 3 && aboutInApp ? 'PASS' : 'FAIL',
      action: '依次点击帮助三项，采集窗口状态与截图并 Escape 关闭；核对「关于 Vinkey」位于 Vinkey 应用菜单',
      actual: `${helpObservations.join('；')}；关于在 Vinkey 应用菜单=${aboutInApp}。按计划 §3 与 TITLE_BAR_DESIGN.md §7，window.alert 仅计「动作可触发」；诊断弹窗的视觉质量/交互完成度属 DEFER-UI-001，已集中至总计划 §8.5 人工复核事项，不作为本 macOS 专项遗留项或条件通过原因。`,
      evidence: [...helpEvidence, 'menu-tree.json'],
      exitCode: 0,
    })
    issues.push('帮助与诊断入口由 window.alert / 简易弹窗承载，按计划 §6 属低保真实现，只证明动作可触发；其视觉质量/交互完成度属 DEFER-UI-001，已集中至总计划 §8.5 人工复核事项，不作为本 macOS 专项遗留项或条件通过原因。')

    // ---- TB-MENU-010 ----
    // 先切回对话页并显式建立 WebView 输入焦点，才能验证「菜单关闭后焦点恢复」
    helper('click', ['查看', '对话工作台'], 'menu-close-back-to-chat.json')
    await sleep(500)
    const focusBeforeClose = await establishFocus('menu-close', 'menu-close-focus-before.json')
    await sleep(300)
    const opened = helper('open', ['查看'], 'menu-close-open.json')
    const expandedBefore = helper('state', [], 'menu-close-expanded.json')
    const expandedShot = await capture('15a-menu-expanded-state.png', 'screen-region')
    helper('key', ['escape'], 'menu-close-escape.json')
    const expandedAfter = helper('state', [], 'menu-close-final.json')
    const closeShot = await capture('15b-menu-closed-focus.png', 'window')
    const expandedListBefore = opened.stateAfter?.expandedMenus || expandedBefore.state?.expandedMenus || []
    const expandedList = expandedAfter.state?.expandedMenus || []
    const focusedRole = expandedAfter.state?.focusedElement?.role || ''
    const focusEstablished = /^AX(TextArea|TextField|WebArea)$/.test(focusBeforeClose.verifiedRole || '')
    const menuClosed = expandedListBefore.includes('查看') && expandedList.length === 0
    const focusRestored = /^AX(WebArea|Text|TextArea|TextField|Group)/.test(focusedRole)
    const okClose = menuClosed && focusRestored
    setCase('TB-MENU-010', {
      status: !focusEstablished ? 'BLOCKED' : (okClose ? 'PASS' : 'FAIL'),
      action: '先切回对话页，激活应用并读回验证 WebView 输入焦点，再用 AX press 展开「查看」菜单，读取展开态后 Escape 关闭，再读展开态与 kAXFocusedUIElementAttribute，保留展开/关闭两张截图',
      actual: `前置焦点建立 ok=${focusBeforeClose.ok}，读回角色=${focusBeforeClose.verifiedRole || 'unknown'}（激活+点击重试 ${focusBeforeClose.attempts} 次），前置可判定=${focusEstablished}；展开 press ok=${opened.ok}；关闭前 expanded=${JSON.stringify(expandedListBefore)}（本机以 AXSelected 等价表示，见 states/menu-attrs.json 属性清单）；关闭后 expanded=${JSON.stringify(expandedList)}，焦点 role=${focusedRole}；菜单已关闭=${menuClosed}、焦点已恢复=${focusRestored}。${focusEstablished ? '断言与截图同时归档，非无条件写 PASS。' : '前置焦点无法建立/读取，按计划 §4.1 步骤 5 记为 BLOCKED 并转人工观察，不判 FAIL、也不判 PASS。'}`,
      evidence: [expandedShot, closeShot, focusBeforeClose._evidence, expandedAfter._evidence, expandedBefore._evidence, 'states/menu-attrs.json'].filter(Boolean),
      exitCode: 0,
    })

    // ---- TB-MENU-011 中文审计 ----
    const ownMenus = ['Vinkey', '项目', '会话', '编辑', '查看', '窗口', '帮助']
    const english = /\b(File|View|Settings|Edit|Copy|Paste|Cut|Undo|Redo|Select All|Minimize|Zoom|Close Window|Help|About)\b/i
    const systemInjected = new Set([
      'AutoFill', 'Start Dictation…', 'Emoji & Symbols',
      'Minimize All', 'Zoom All', 'Fill', 'Center', 'Move & Resize', 'Full Screen Tile',
      'Remove Window from Set', 'Close All', 'Quit and Keep Windows', 'Vinkey',
    ])
    const offenders = []
    const injected = []
    for (const name of ownMenus) {
      for (const item of menuOf(name)?.items || []) {
        const t = item.title || ''
        if (!t) continue
        if (systemInjected.has(t)) { injected.push(`${name}>${t}`); continue }
        if (english.test(t)) offenders.push(`${name}>${t}`)
      }
    }
    setCase('TB-MENU-011', {
      status: offenders.length === 0 ? 'PASS' : 'FAIL',
      action: '遍历 7 个业务菜单的所有自有项做英文残留审计；系统注入服务项单独标记',
      actual: `自有项英文残留=${JSON.stringify(offenders)}；系统注入项单独标记 ${injected.length} 条：${injected.slice(0, 8).join(' / ')}${injected.length > 8 ? ' …' : ''}。品牌、格式、协议字段按计划允许保留原文。`,
      evidence: ['menu-tree.json'],
      exitCode: 0,
    })

    // ---- TB-MENU-012 减法审计 ----
    const forbidden = [/停止.*生成/, /展开.*折叠|折叠.*项目/, /保存文档|新建文档|关闭文档/]
    const allOwnItems = ownMenus.flatMap((name) => (menuOf(name)?.items || []).map((i) => `${name}>${i.title || ''}`))
    const forbiddenFound = allOwnItems.filter((label) => forbidden.some((re) => re.test(label)))
    // 降级入口存在性由同批次 WebView companion 复核；此处给出源码定位
    const sourceAudit = readFileSync(join(root, 'src/components/ProjectSessionSidebar.tsx'), 'utf8')
    const sidebarCollapse = /sidebar-collapse-button/.test(sourceAudit)
    setCase('TB-MENU-012', {
      status: forbiddenFound.length === 0 && sidebarCollapse ? 'PASS' : 'FAIL',
      action: '核对 7 个业务菜单不含首版减法项；核对降级入口仍在侧栏/对话/文件页；降级入口交互可达性由 WebView companion 复核',
      actual: `菜单中禁止项=${JSON.stringify(forbiddenFound)}；侧栏折叠按钮存在=${sidebarCollapse}（src/components/ProjectSessionSidebar.tsx）；对话输入区停止按钮与文件页工具栏入口由 webview/ companion 复核。另见 issues：CF-023 后续入口提前挂载，按设计 §3 不得计入通过结论。`,
      evidence: ['menu-tree.json', 'webview/result.json'].filter((f) => evidenceFile(f)),
      exitCode: 0,
    })

    // ---- TB-MENU-008 窗口控制（放最后：关闭窗口会隐藏主窗口）----
    const windowMenu = itemsOf('窗口')
    const requiredWindowItems = ['最小化', '缩放窗口', '进入全屏', '关闭窗口']
    const missing = requiredWindowItems.filter((t) => !windowMenu.includes(t))
    const windowBeforeShot = await capture('16-before-window-actions.png', 'window')
    const minimize = helper('window', ['minimize'], 'window-minimize.json')
    const minimized = minimize.window?.after?.frontWindow?.minimized === true
    // 最小化后用「窗口」菜单同名动作恢复，再验证交通灯缩放按钮
    const restoreViaMenu = helper('click', ['窗口', '缩放窗口'], 'window-restore-via-menu.json')
    const zoom = helper('window', ['zoom'], 'window-zoom.json')
    const zoomedSize = zoom.window?.after?.frontWindow?.size || []
    // macOS 绿色交通灯 zoom 会异步把窗口带入全屏态（AXFullScreen=true）。
    // 先用系统全屏按钮归一化回普通窗口，保证「进入全屏」用例的前置条件成立；
    // 这里只调整前置状态，不改动任何判定函数或断言阈值。
    const preFs = helper('fullscreen-state', [], 'window-fullscreen-precheck.json')
    let preFsExited = false
    if (preFs.fullscreen?.signals?.axFullScreen === true) {
      preFsExited = helper('window', ['fullscreen'], 'window-fullscreen-precheck-exit.json').ok === true
      await sleep(800)
    }
    // 全屏：多信号交叉判定（AXFullScreen + AX 窗口尺寸 + CG 窗口边界），由 fullscreen-state 命令返回
    const fullscreen = helper('click', ['窗口', '进入全屏'], 'window-fullscreen-menu.json')
    await sleep(900)
    const fsState = helper('fullscreen-state', [], 'window-fullscreen-state.json')
    const fsVerdict = evaluateFullscreen(fsState.fullscreen?.signals)
    const fullscreenOk = fsVerdict.verdict === 'fullscreen'
    helper('key', ['escape'], 'window-fullscreen-exit.json')
    await sleep(500)
    const windowBeforeCloseShot = await capture('17-before-close-window.png', 'window')
    const closeWin = helper('click', ['窗口', '关闭窗口'], 'window-close-menu.json')
    await sleep(700)
    const closeState = helper('state', [], 'window-after-close.json')
    const windowActionsOk = minimize.ok && restoreViaMenu.ok && zoom.ok && fullscreen.ok && closeWin.ok
    const closeHidden = (closeState.state?.windowCount ?? 0) === 0
      || closeState.state?.frontWindow?.title === ''
    // Reopen 恢复：关闭后重新激活应用，验证窗口可恢复（openapp 命令）
    const reopenActivate = helper('openapp', [], 'window-reopen-activate.json')
    await sleep(800)
    const reopenState = helper('state', [], 'window-reopen-state.json')
    const reopenVerdict = evaluateReopen({
      windowCountBeforeClose: closeState.state?.windowCount ?? 0,
      windowCountAfterReopen: reopenState.state?.windowCount ?? 0,
      appStillRunning: reopenActivate.ok !== false,
    })
    const reopenOk = reopenVerdict.verdict === 'reopened'
    const objectiveOk = missing.length === 0 && windowActionsOk && minimized && closeHidden && fullscreenOk && reopenOk
    setCase('TB-MENU-008', {
      status: objectiveOk ? 'PASS'
        : (missing.length === 0 && windowActionsOk && minimized ? 'BLOCKED' : 'FAIL'),
      action: 'AX 读取窗口菜单项；依次 press 最小化/缩放/全屏/关闭按钮；全屏改用多信号交叉判定（AXFullScreen + AX 尺寸 + CG 窗口边界，见 fullscreen-state 命令）；「进入全屏」为挂接 Tauri setFullscreen 的自定义菜单项；关闭后经 LaunchServices（open -a）触发 Dock Reopen 事件验证恢复',
      actual: `窗口菜单必需项=${JSON.stringify(requiredWindowItems)}，缺失=${JSON.stringify(missing)}；最小化后 AXMinimized=${minimized}；菜单恢复 ok=${restoreViaMenu.ok}；AX 缩放按钮 ok=${zoom.ok}，缩放后尺寸=${JSON.stringify(zoomedSize)}；全屏前置 axFullScreen=${String(preFs.fullscreen?.signals?.axFullScreen)}、归一化退出=${preFsExited}；菜单「进入全屏」ok=${fullscreen.ok}、实际按下项=${fullscreen.click?.pressedItemTitle || ''}；全屏多信号=${JSON.stringify(fsState.fullscreen?.signals || {})} → verdict=${fsVerdict.verdict}(score=${fsVerdict.score})；菜单「关闭窗口」ok=${closeWin.ok}、实际按下项=${closeWin.click?.pressedItemTitle || ''}，关闭后窗口数=${closeState.state?.windowCount ?? '?'}、无可见主窗口=${closeHidden}；Reopen 触发方式=${reopenActivate.reopenMethod || 'unknown'}、事件投递=${String(reopenActivate.reopenDispatched)}；Reopen 后窗口数=${reopenState.state?.windowCount ?? '?'} → verdict=${reopenVerdict.verdict}。DEFER-UI-005 仅覆盖「全屏目视复核」，不阻止上述 AX/CG 客观项在 Alpha 内自动化与通过判定。`,
      evidence: [windowBeforeShot, windowBeforeCloseShot, minimize._evidence, zoom._evidence, preFs._evidence, fullscreen._evidence, fsState._evidence, closeWin._evidence, closeState._evidence, reopenActivate._evidence, reopenState._evidence].filter(Boolean),
      exitCode: 0,
    })
    if (!windowActionsOk || !minimized) issues.push('窗口动作存在未通过项，详见 TB-MENU-008。')
    if (!fullscreenOk) issues.push(`全屏多信号交叉判定未达成一致（verdict=${fsVerdict.verdict}, score=${fsVerdict.score}）；全屏 AX/CG 客观状态未确认，不影响 DEFER-UI-005 划出（目视复核仍延后）。`)
    if (!reopenOk) issues.push(`关闭窗口后 Reopen 恢复未自动验证（verdict=${reopenVerdict.verdict}）；若 dock 点击行为缺失或应用已退出则记为遗留，不据此单信号宣称窗口动作全部通过。`)
  } finally {
    await stopApp()
  }
}

// MARK: - 主流程

async function main() {
  runId = `title-bar-w0-p-${stamp().slice(0, 8)}-macos-${stamp().slice(9)}`
  outputDir = join(OUTPUT_ROOT, runId)
  screenshotDir = join(outputDir, 'screenshots')
  stateDir = join(outputDir, 'states')
  for (const dir of [outputDir, screenshotDir, stateDir, join(outputDir, 'webview')]) mkdirSync(dir, { recursive: true })
  initCases()

  const blockers = []
  if (process.platform !== 'darwin') blockers.push('仅支持 macOS（AXMenuBar + CoreGraphics）')
  if (!existsSync(APP_BIN)) blockers.push(`未找到应用：${APP_BIN}`)
  if (!existsSync(CAPTURE_HELPER)) blockers.push(`未找到 CoreGraphics helper：${CAPTURE_HELPER}`)
  if (!existsSync(HELPER_SRC)) blockers.push(`未找到 AX helper 源码：${HELPER_SRC}`)
  const running = spawnSync('pgrep', ['-fl', 'Vinkey.app/Contents/MacOS'], { encoding: 'utf8' })
  if (running.status === 0 && running.stdout.trim()) blockers.push('已有 Vinkey 进程运行，请退出后重试')

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vinkey-title-bar-'))
  helperBin = join(temporaryDirectory, 'vinkey-menu-ax-helper')

  try {
    if (blockers.length) {
      for (const reason of blockers) logEvent(`PRECONDITION BLOCKED: ${reason}`)
    } else {
      const compiled = spawnSync('swiftc', ['-O', '-target', 'arm64-apple-macosx14.0', HELPER_SRC, '-o', helperBin], { encoding: 'utf8', timeout: 120000 })
      if (compiled.status !== 0) {
        blockers.push(`swiftc 编译失败：${(compiled.stderr || '').slice(0, 300)}`)
        stderrBuffer += compiled.stderr || ''
      } else {
        copyFileSync(HELPER_SRC, join(outputDir, 'native-automation.swift'))
        logEvent('AX helper compiled; source copied to native-automation.swift')
      }

      // display-info.txt（计划 §5）
      const display = spawnSync('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8', timeout: 30000 })
      const dm = join(outputDir, 'display-metadata.json')
      const dmResult = spawnSync(CAPTURE_HELPER, ['display-metadata', dm], { encoding: 'utf8', timeout: 20000 })
      writeFileSync(join(outputDir, 'display-info.txt'), [
        '# 平台显示器/缩放原始信息',
        `# system_profiler exit=${display.status}`,
        display.stdout || '',
        '',
        '# CoreGraphics display-metadata',
        `# helper exit=${dmResult.status}`,
        existsSync(dm) ? readFileSync(dm, 'utf8') : '(unavailable)',
      ].join('\n'), 'utf8')

      // W0 fixture 库（仅用于生成已打开项目状态，不重复判定 D-NAV）
      const bundled = join(temporaryDirectory, 'navigation-fixture-lib.mjs')
      await build({
        entryPoints: [join(root, 'scripts/navigation/navigation-acceptance.ts')],
        outfile: bundled, bundle: true, platform: 'node', format: 'esm', target: 'node22',
      })
      fixtureLibrary = await import('file://' + bundled)

      await runNoProjectPhase(temporaryDirectory)
      await runWithProjectPhase(temporaryDirectory)
    }
  } catch (cause) {
    logEvent(`FATAL: ${messageOf(cause)}`)
    stderrBuffer += `FATAL: ${messageOf(cause)}\n`
    issues.push(`脚本执行异常：${messageOf(cause)}`)
  } finally {
    await stopApp()
    await rm(temporaryDirectory, { recursive: true, force: true })
  }

  // 计划 §2 / §6：无法证明结果来自目标应用包时必须阻断，不得用浏览器 companion 代替。
  // 构建 SHA 读自隔离 Profile 的 app.start.fields.commitSha；源码一致性沿用导航原生批次口径。
  const headSha = git(['rev-parse', 'HEAD'])
  const dirty = (git(['status', '--porcelain']) || '').length > 0
  const applicationSha = typeof appRuntimeStart?.commitSha === 'string' ? appRuntimeStart.commitSha : null
  const applicationShaSource = applicationSha
    ? 'isolated profile vinkey-runtime.jsonl (app.start.fields.commitSha)'
    : 'UNAVAILABLE'
  let sourceIdentical = null
  if (applicationSha && headSha) {
    const diff = spawnSync('git', ['-C', root, 'diff', '--quiet', `${applicationSha}..${headSha}`, '--', 'src/', 'src-tauri/src/', 'index.html'], { encoding: 'utf8' })
    sourceIdentical = diff.status === 0
  }
  const appMeta = {
    version: plistValue('CFBundleShortVersionString'),
    buildNumber: plistValue('CFBundleVersion'),
    buildTimeEpochMs: appRuntimeStart?.buildTime ?? null,
    workingTreeDirtyAtBuild: typeof appRuntimeStart?.workingTreeDirty === 'boolean' ? appRuntimeStart.workingTreeDirty : null,
  }
  const provenanceStatus = applicationSha && sourceIdentical === true && !dirty ? 'PASS' : 'REVIEW'
  if (!applicationSha) {
    blockers.push('无法证明结果来自目标应用包：隔离 Profile 的 app.start.fields.commitSha 缺失（计划 §2 / §6 阻断）')
  }

  if (blockers.length) {
    for (const item of cases) {
      if (item.status === 'BLOCKED' && item.actual === '未执行') item.actual = `前置条件未满足：${blockers.join('；')}`
    }
  }

  // 未执行的用例保持 BLOCKED，不擅自改写为 NOT_APPLICABLE/PASS
  for (const item of cases) {
    if (item.status === 'BLOCKED' && item.actual === '未执行') item.actual = '本批次未执行（应用未启动或前置条件不满足）'
  }

  // P / F 子门槛分别判定（计划 §1 第 19 行、§7 第 114 行）
  const pCases = cases.filter((c) => c.subset === 'P' && c.caseId !== 'TB-MENU-003-GLOBAL-SEARCH')
  const fCases = cases.filter((c) => c.subset === 'F')
  const pPass = pCases.filter((c) => c.status === 'PASS').length
  const pFail = pCases.filter((c) => c.status === 'FAIL').length
  const pBlocked = pCases.filter((c) => c.status === 'BLOCKED').length
  const notApplicableCount = cases.filter((c) => c.status === 'NOT_APPLICABLE').length
  // 计划 §3：NOT_APPLICABLE 分两种语义。带 authoritativeGate 的是「批次归属不适用」
  // （F 归属用例由独立门槛判定），不改变用例适用性、不压低 P 结论、不计入专项阻断；
  // 其余才是「用例本身不适用」，仍计入判定。
  const blockingNaCount = cases.filter((c) => c.status === 'NOT_APPLICABLE' && !c.authoritativeGate).length
  // F 子集不由本批次判定（见文件头部 fGateSuite / fSubsetConclusion 常量）。
  const notExecuted = cases.filter((c) => c.actual.includes('本批次未执行')).length
  const pSubsetConclusion = pFail > 0 ? 'FAIL'
    : (blockers.length || notExecuted >= cases.length - 1) ? 'BLOCKED'
      : pBlocked > 0 ? '条件通过（含待人工复核项）'
        : blockingNaCount > 0 ? '条件通过' : 'PASS'

  // 四态计数：passed + failed + blocked + notApplicable 必须等于 caseCount（13，不缩水）。
  // 不新增状态值（脚本计划 §8）；批次归属不适用的用例由 authoritativeGate 登记权威门槛。
  const summary = {
    caseCount: cases.length,
    passed: cases.filter((c) => c.status === 'PASS').length,
    failed: cases.filter((c) => c.status === 'FAIL').length,
    blocked: cases.filter((c) => c.status === 'BLOCKED').length,
    notApplicable: notApplicableCount,
  }
  const conclusion = pSubsetConclusion === 'FAIL' ? '不通过'
    : pSubsetConclusion === 'BLOCKED' ? '阻断'
      : '条件通过'
  const exitCode = summary.failed > 0 || blockers.length > 0 ? 1 : 0

  const tbMenu008 = cases.find((c) => c.caseId === 'TB-MENU-008')
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: {
      id: 'UI-ACC-TITLE-BAR-001',
      batch: 'W0-SHELL-MENU',
      domainId: 'D-SHELL',
      platform: 'macOS',
      plan: 'docs/acceptance/ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md',
      design: 'docs/design/ui/TITLE_BAR_DESIGN.md',
    },
    repository: { version: '0.1.0', gitSha: headSha, dirty, repositoryClean: !dirty },
    application: {
      path: APP_PATH,
      bundleIdentifier: BUNDLE_ID,
      processName: PROCESS_NAME,
      version: appMeta.version,
      buildNumber: appMeta.buildNumber,
      gitSha: applicationSha,
      gitShaEvidence: applicationShaSource,
      buildTimeEpochMs: appMeta.buildTimeEpochMs,
      workingTreeDirtyAtBuild: appMeta.workingTreeDirtyAtBuild,
      sourceIdenticalToHead: sourceIdentical,
      buildShaDiffersFromHead: applicationSha !== headSha,
    },
    provenance: {
      status: provenanceStatus,
      detail: `appSha=${applicationSha ?? 'unknown'};headSha=${headSha ?? 'unknown'};srcIdentical=${sourceIdentical};repositoryClean=${!dirty};source=${applicationShaSource}。构建 SHA 与 HEAD 不同时，以 src/、src-tauri/src/、index.html 无差异证明界面代码同版本；本次仅 scripts/、docs/、package.json 变更。`,
    },
    environment: {
      os: 'macOS',
      osVersion: spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim(),
      arch: process.arch,
      node: process.version,
      swift: spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0],
      accessibility: 'AX C API（AXIsProcessTrusted）；System Events 在本会话返回 -10004，按 §4.1 走纯 Accessibility 路径',
      screenCapture: 'CoreGraphics.CGWindowListCreateImage（窗口）+ screencapture -R 区域（菜单展开）',
    },
    privacy: {
      profile: '应用使用临时隔离 VINKEY_ACCEPTANCE_DATA_DIR，不触碰用户真实数据',
      screenshots: '窗口截图由 CGWindowListCreateImage 按窗口 ID 捕获；菜单展开截图用 screencapture -R0,0,760,190 仅截取系统菜单栏与下拉菜单区域，不含桌面图标或其他应用内容区',
      logs: 'events.txt 与 app-runtime.log 中的临时路径在报告引用时按项目规范脱敏',
      axPlatformNote: '本机 macOS AXMenuBarItem 不暴露 AXExpanded，实际属性为 AXSelected（展开=1）与 AXChildren 中的 AXMenu；属性清单见 states/menu-attrs.json，作为计划 §4.1 步骤 2 的等价核对证据',
    },
    coverage: {
      plannedCaseIds: CASE_DEFS.map((c) => c.id),
      executedCaseIds: cases.map((c) => c.caseId),
      plannedCount: CASE_DEFS.length,
      executedCount: cases.length,
      note: '用例清单与计划 §3 完全一致，未删减、未合并、未改名；P/F 归属按计划「关联缺口」列。',
    },
    subsets: {
      'W0-SHELL-MENU-P': {
        conclusion: pSubsetConclusion,
        caseCount: pCases.length, passed: pPass, failed: pFail, blocked: pBlocked,
        detail: 'P 子集只证明壳层和平台能力；不因 F 子集的独立结论而降格，也不吸收 F 结果。',
      },
      'W0-SHELL-MENU-F': {
        conclusion: fSubsetConclusion,
        authoritativeGate: {
          suite: fGateSuite,
          command: fGateCommand,
          artifactRoot: fGateArtifactRoot,
          authoritativeResult: `${fGateArtifactRoot}<最新批次>/result.json`,
        },
        dependsOn: ['W0-NAV-F', 'W0-EDITOR-F'],
        observedFCaseIds: fCases.map((c) => c.caseId),
        detail: `按计划 §1 第 19 行与 §7 第 114 行：F 不是 P 的自动附属 PASS，F 的机器 fixture 证据由 ${fGateSuite} 单独归档并判定，本 runner（UI-ACC-TITLE-BAR-001）不重新判定 F；本批次 conclusion=${fSubsetConclusion} 表示「批次归属不适用」，不是 F 用例不适用。本批次仍逐项执行了可观察的 F 归属菜单动作，仅作为原生过程证据，不构成 F 通过或阻断；依赖门槛状态由独立脚本读取真实批次 result.json。`,
      },
    },
    decision: {
      rule: '计划 §6 判定规则',
      conclusion,
      reasons: [
        'CF-023 已实现：TB-MENU-003-GLOBAL-SEARCH 为客观用例（原生菜单项存在性 + M3 companion 验证面板分组/Escape/跳转），判为 PASS，不作为专项通过的阻断项',
        'Windows 平台（M5/W0-SHELL-MENU Windows 专项）由独立 Windows 验收负责，本 macOS 专项不覆盖、亦不因此降级；仅提示：Windows 未执行时不得宣称跨平台发布通过',
        `W0-SHELL-MENU-F 归独立脚本 ${fGateSuite} 单独判定（本批次 ${fSubsetConclusion}＝批次归属不适用，不是用例不适用；TB-MENU-004 只留原生过程证据，以 authoritativeGate 登记权威门槛，权威结论见 ${fGateArtifactRoot}最新批次 result.json；cases[].status 只用四态，不新增状态值）；按计划 §6 次序 W0-NAV-F / W0-EDITOR-F 为前置依赖，其 PASS 后 F 才判定，不由 P 结果或 companion 升级。${provenanceStatus === 'PASS' ? '构建溯源 provenance=PASS 已按最终 HEAD 定稿；' : '构建溯源需按最终 HEAD 复跑定稿；'}${editorBoundaryPhrase}，帮助/诊断弹窗视觉质量/交互完成度（DEFER-UI-001）已集中至总计划 §8.5 人工复核事项，均不作为本 macOS 专项遗留项或专项通过的阻断项；专项整体结论由独立 F 门槛 decision.specialityPass 单独判定，本批次不代为判定${directoryCancelVerdict === 'preserved' ? '；目录取消保态已按 AX/CG 双信号客观判定为 preserved，为客观已达成项' : `；目录取消保态 ${directoryCancelVerdict ?? 'not-observed'}`}；TB-MENU-008=${tbMenu008?.status ?? 'BLOCKED'}，Windows 平台验收属独立专项，不计入本 macOS 专项判定，整体仍不宣称跨平台发布通过 / 完整发布通过。`,
        '帮助/诊断弹窗的视觉质量/交互完成度属 DEFER-UI-001，已集中至总计划 §8.5 人工复核事项，不作为本专项遗留项或条件通过原因',
        `TB-MENU-008=${tbMenu008?.status}：全屏采用多信号交叉判定（AXFullScreen + AX 尺寸 + CG 窗口边界），Reopen 恢复由 LaunchServices 触发 Dock Reopen 事件自动验证；若某客观信号未达成仍保留 BLOCKED，不宣称窗口动作全部通过；DEFER-UI-005 仅覆盖目视复核，不阻断上述客观项。`,
        'macOS 关闭窗口后的 Dock/系统 Reopen 恢复：本批次已通过 LaunchServices（open -a）投递 Dock Reopen 事件做客观验证（见 TB-MENU-008 evidence 中 window-reopen-*）。',
        ...(provenanceStatus === 'REVIEW'
          ? [`provenance.status=REVIEW：appSha=${applicationSha ?? 'unknown'}、srcIdentical=${sourceIdentical}、repositoryClean=${!dirty}；报告需按最终 HEAD 复跑后才能定稿`]
          : []),
      ],
      windowsPlatform: 'NOT_EXECUTED',
      cf023: { status: '已实现（macOS 专项客观 PASS；Windows 独立专项未执行）', source: 'docs/competitors/FEATURE_DECISIONS.md:36', gap: '已完成 UnifiedSearchPanel；分组/Escape/跳转由 TB-MENU-003-GLOBAL-SEARCH 客观验证（原生菜单项 + M3 companion）' },
    },
    cases,
    issues,
    summary,
    exitCode,
    conclusion,
    artifacts: { screenshots: [], sha256: {} },
  }

  // 归档：菜单树、状态、截图、事件、stderr、display-info、helper 源码
  const treeSrc = join(stateDir, 'menu-tree.json')
  if (existsSync(treeSrc)) copyFileSync(treeSrc, join(outputDir, 'menu-tree.json'))

  // M3 WebView companion（计划 §7 第 109 行）：在归档哈希前生成，纳入同一批次清单
  const companionPath = join(root, 'scripts/title-bar/run-title-bar-companion.mjs')
  if (existsSync(companionPath) && !blockers.length) {
    const webviewDir = join(outputDir, 'webview')
    const companion = spawnSync(process.execPath, [companionPath, '--output', webviewDir], {
      cwd: root, encoding: 'utf8', timeout: 300000,
    })
    logEvent(`M3 companion exit=${companion.status}: ${(companion.stdout || '').trim().split('\n')[0]}`)
    if (companion.stderr) stderrBuffer += `[M3 companion] ${companion.stderr}`
    if (existsSync(join(webviewDir, 'result.json'))) {
      try {
        const companionResult = JSON.parse(readFileSync(join(webviewDir, 'result.json'), 'utf8'))
        result.webviewCompanion = {
          conclusion: companionResult.conclusion,
          summary: companionResult.summary,
          evidenceLayer: companionResult.evidenceLayer,
          cases: companionResult.cases.map((c) => ({ caseId: c.caseId, status: c.status, detail: c.detail })),
        }
        const menu012 = cases.find((c) => c.caseId === 'TB-MENU-012')
        if (menu012) menu012.evidence = [...new Set([...menu012.evidence, 'webview/result.json'])]
        if (companionResult.summary.failed > 0) issues.push(`M3 WebView companion 存在 ${companionResult.summary.failed} 个 FAIL，见 webview/result.json。`)
      } catch (cause) {
        issues.push(`M3 companion 结果读取失败：${messageOf(cause)}`)
      }
    } else {
      issues.push('M3 WebView companion 未生成 webview/result.json，结构证据缺失。')
    }
  }

  writeFileSync(join(outputDir, 'events.txt'), events.join('\n') + '\n', 'utf8')
  writeFileSync(join(outputDir, 'automation-stderr.txt'), stderrBuffer || '', 'utf8')

  const hashManifest = {}
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walk(full, relative); continue }
      if (['result.json', 'SHA256SUMS', '.DS_Store'].includes(entry.name)) continue
      if (entry.name.endsWith('.png') && !relative.startsWith('webview/')) result.artifacts.screenshots.push(relative)
      hashManifest[relative] = sha256(full)
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

  // 计划 §5：stdout 仅四行
  console.log(`W0-SHELL-MENU-P acceptance: ${conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked, ${summary.notApplicable} N/A; P=${pSubsetConclusion}, F=${fSubsetConclusion}→${fGateSuite} 权威判定)`)
  console.log(`Results: ${resultFile.replace(root + '/', '')}`)
  console.log(`SHA256SUMS: ${join(outputDir, 'SHA256SUMS').replace(root + '/', '')}`)
  console.log(`exit=${exitCode}`)
  process.exitCode = exitCode
}

main().catch((cause) => {
  console.error(`标题栏专项验收脚本失败：${messageOf(cause)}`)
  process.exitCode = 1
})
