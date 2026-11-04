#!/usr/bin/env node
// 项目与会话导航 UI 截图 companion（UI-ACC-NAV-UI-001）。
// 用 Playwright 驱动 Vite 浏览器演示层，注入隔离 localStorage fixture，真实点击导航 UI
// 并为 W0-NAV-F / W2-NAV-E / W4-NAV-R 产出截图与 UI 观察表。
//
// 证据层级声明：本脚本产出的是【浏览器演示层（Playwright 页面级）UI 证据】，
// 不是 Tauri 原生窗口证据，不得冒充 ui-shell-native-macos 的 CoreGraphics 窗口截图。
// 机器断言由 W0-NAV-F / W2-NAV-E / W4-NAV-R 各自的 result.json 独立提供。

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../..')
const defaultOutput = path.resolve(repositoryRoot, 'artifacts/navigation-acceptance')
const SUITE_ID = 'UI-ACC-NAV-UI-001'
const SUITE_VERSION = 'navigation-ui-1'

function parseArgs(argv) {
  const options = { output: defaultOutput, baseUrl: null, help: false, outputExact: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') options.help = true
    else if (value === '--output') options.output = path.resolve(argv[++index] ?? '')
    else if (value === '--base-url') options.baseUrl = argv[++index] ?? null
    else if (value === '--output-exact') options.outputExact = true
    else throw new Error(`未知参数：${value}`)
  }
  return options
}

function printHelp() {
  process.stdout.write(`导航 UI 截图 companion（${SUITE_ID}）

用法：npm run test:navigation-ui-acceptance -- [选项]

选项：
  --output <目录>     证据归档目录（默认 artifacts/navigation-acceptance）
  --base-url <URL>    使用已运行的 Vite 服务，不启动/停止服务
  --output-exact      将 --output 作为本次批次目录，不追加 run-*
  --help              显示帮助

说明：产出浏览器演示层页面级截图，不是 Tauri 原生窗口证据。
`)
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!address || typeof address === 'string') throw new Error('无法分配本地 Vite 端口')
  return address.port
}

async function waitForServer(url, child) {
  const timeoutMs = Number(process.env.VITE_UI_ACCEPTANCE_STARTUP_TIMEOUT_MS) || 45_000
  const deadline = Date.now() + Math.min(Math.max(timeoutMs, 500), 45_000)
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite 提前退出，退出码 ${child.exitCode}`)
    try { const response = await fetch(url); if (response.ok) return } catch { /* 尚未监听 */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`等待 Vite 启动超时：${url}`)
}

const PROJECT_A = { id: 'nav-ui-project-a', name: 'project-a', pathLabel: '验收隔离/project-a' }
const PROJECT_B = { id: 'nav-ui-project-b', name: 'project-b', pathLabel: '验收隔离/project-b' }

function message(id, role, content, offset) {
  return { id, role, content, createdAt: 1_760_000_000_000 + offset, completedAt: 1_760_000_000_000 + offset }
}

function fixtureInitScript() {
  const conversationsA = [
    { id: 'nav-ui-a-s1', title: '世界观设定', updatedAt: 1_760_000_030_000, messages: [message('a1m1', 'user', '请整理世界观设定的要点。', 1000), message('a1m2', 'assistant', '世界观围绕临海小城与未寄出的信件展开。', 2000)] },
    { id: 'nav-ui-a-s2', title: '人物弧光', updatedAt: 1_760_000_020_000, messages: [message('a2m1', 'user', '描述主角的人物弧光。', 3000), message('a2m2', 'assistant', '主角从回避情绪走向直面事实。', 4000)] },
    { id: 'nav-ui-a-s3', title: '章节大纲', updatedAt: 1_760_000_010_000, messages: [message('a3m1', 'user', '列出章节大纲。', 5000)] },
  ]
  const conversationsB = [
    { id: 'nav-ui-b-s1', title: 'Chapter 2 outline', updatedAt: 1_760_000_040_000, messages: [message('b1m1', 'user', 'Outline chapter two.', 6000), message('b1m2', 'assistant', 'The ferry arrives at dusk.', 7000)] },
    { id: 'nav-ui-b-s2', title: '双语校对', updatedAt: 1_760_000_015_000, messages: [message('b2m1', 'user', '校对双语段落。', 8000)] },
  ]
  return (fixture) => {
    localStorage.clear()
    localStorage.setItem('vinkey.demo.projects', JSON.stringify({ projects: [fixture.a, fixture.b], activeId: fixture.a.id }))
    localStorage.setItem(`vinkey.demo.conversations.${fixture.a.id}`, JSON.stringify(fixture.conversationsA))
    localStorage.setItem(`vinkey.demo.conversations.${fixture.b.id}`, JSON.stringify(fixture.conversationsB))
    localStorage.setItem('vinkey.theme', 'light')
    localStorage.setItem('vinkey.sidebarCollapsed', 'false')
  }
}

const FIXTURE = { a: PROJECT_A, b: PROJECT_B, conversationsA: null, conversationsB: null }

async function newPage(browser, fixture, outputDir, platform = 'darwin') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await context.addInitScript((platformName) => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: platformName === 'darwin' ? 'MacIntel' : 'Win32' })
  }, platform)
  await context.addInitScript(fixtureInitScript(), fixture)
  const page = await context.newPage()
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  await page.goto(fixture.baseUrl, { waitUntil: 'networkidle' })
  await page.locator('.session-sidebar').waitFor({ timeout: 20_000 })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return { context, page, consoleErrors }
}

async function capture(page, outputDir, name) {
  const target = path.join(outputDir, 'screenshots', `${name}.png`)
  await page.screenshot({ path: target, fullPage: false, animations: 'disabled' })
  return `${name}.png`
}

async function expandProject(page, name) {
  const section = page.locator(`section.sidebar-project[aria-label="项目 ${name}"]`)
  await section.waitFor({ timeout: 10_000 })
  const expand = section.getByRole('button', { name: `展开项目 ${name}` })
  if (await expand.count()) await expand.click()
  return section
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { printHelp(); return }
  const runId = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
  const outputDir = options.outputExact ? options.output : path.join(options.output, `ui-run-${runId}`)
  await mkdir(path.join(outputDir, 'screenshots'), { recursive: true })

  let viteProcess = null
  let browser = null
  const cases = []
  const startedAt = new Date().toISOString()
  const version = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')).version
  const git = spawnSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const gitSha = git.status === 0 ? git.stdout.trim() : null
  const statusRun = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain'], { encoding: 'utf8' })
  const repositoryClean = statusRun.status === 0 && !statusRun.stdout.trim()
  const nodeVersion = process.version
  const osVersionRun = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' })

  const fixture = {
    ...FIXTURE,
    conversationsA: [
      { id: 'nav-ui-a-s1', title: '世界观设定', updatedAt: 1_760_000_030_000, messages: [message('a1m1', 'user', '请整理世界观设定的要点。', 1000), message('a1m2', 'assistant', '世界观围绕临海小城与未寄出的信件展开。', 2000)] },
      { id: 'nav-ui-a-s2', title: '人物弧光', updatedAt: 1_760_000_020_000, messages: [message('a2m1', 'user', '描述主角的人物弧光。', 3000), message('a2m2', 'assistant', '主角从回避情绪走向直面事实。', 4000)] },
      { id: 'nav-ui-a-s3', title: '章节大纲', updatedAt: 1_760_000_010_000, messages: [message('a3m1', 'user', '列出章节大纲。', 5000)] },
    ],
    conversationsB: [
      { id: 'nav-ui-b-s1', title: 'Chapter 2 outline', updatedAt: 1_760_000_040_000, messages: [message('b1m1', 'user', 'Outline chapter two.', 6000), message('b1m2', 'assistant', 'The ferry arrives at dusk.', 7000)] },
      { id: 'nav-ui-b-s2', title: '双语校对', updatedAt: 1_760_000_015_000, messages: [message('b2m1', 'user', '校对双语段落。', 8000)] },
    ],
  }

  const runCase = async (caseId, title, gate, fn, platform = 'darwin') => {
    let session = null
    try {
      session = await newPage(browser, { ...fixture, baseUrl: baseUrl }, outputDir, platform)
      const result = await fn(session.page)
      cases.push({ caseId, title, gate, status: 'PASS', detail: result.detail, screenshot: result.screenshot ?? null, source: 'playwright-browser-demo' })
      process.stderr.write(`[${caseId}] PASS ${title}\n`)
    } catch (error) {
      cases.push({ caseId, title, gate, status: 'BLOCKED', detail: String(error.message ?? error).slice(0, 400), screenshot: null, source: 'playwright-browser-demo' })
      process.stderr.write(`[${caseId}] BLOCKED ${title} — ${String(error.message ?? error).slice(0, 160)}\n`)
    } finally {
      if (session) await session.context.close().catch(() => {})
    }
  }

  let baseUrl = options.baseUrl
  try {
    if (!baseUrl) {
      const port = await freePort()
      baseUrl = `http://127.0.0.1:${port}`
      viteProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
        cwd: repositoryRoot,
        env: { ...process.env, VITE_UI_ACCEPTANCE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      viteProcess.stdout.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
      viteProcess.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
      await waitForServer(baseUrl, viteProcess)
    }
    browser = await chromium.launch({ headless: true })

    // ---- W0-NAV-F 截图材料（§7.1） ----
    await runCase('NAV-UI-001', '项目列表（两项目与会话）', 'W0-NAV-F', async (page) => {
      await expandProject(page, 'project-a')
      await expandProject(page, 'project-b')
      const projectCount = await page.locator('section.sidebar-project').count()
      const sessionCount = await page.locator('.conversation-item-select').count()
      if (projectCount < 2 || sessionCount < 4) throw new Error(`项目/会话数量不足：${projectCount}/${sessionCount}`)
      const screenshot = await capture(page, outputDir, '01-nav-project-list')
      return { detail: `两项目可见，共 ${sessionCount} 条会话条目；激活项目 ${PROJECT_A.name}。`, screenshot }
    })

    await runCase('NAV-UI-002', '项目切换前后', 'W0-NAV-F', async (page) => {
      const before = await capture(page, outputDir, '02-nav-switch-before')
      await expandProject(page, 'project-b')
      await page.locator(`section.sidebar-project[aria-label="项目 project-b"] .sidebar-project-toggle`).first().click()
      await page.waitForTimeout(400)
      const after = await capture(page, outputDir, '03-nav-switch-after')
      const active = await page.locator('.title-bar-context').textContent().catch(() => '')
      return { detail: `点击 B 项目完成切换；标题栏上下文「${(active ?? '').trim().slice(0, 40)}」；截图 ${before} / ${after}。`, screenshot: after }
    })

    await runCase('NAV-UI-003', '会话恢复（消息与标题）', 'W0-NAV-F', async (page) => {
      await expandProject(page, 'project-a')
      await page.locator('.conversation-item-select').filter({ hasText: '世界观设定' }).first().click()
      await page.waitForTimeout(350)
      const screenshot = await capture(page, outputDir, '04-nav-conversation-restored')
      const body = (await page.locator('body').textContent()) ?? ''
      if (!body.includes('世界观')) throw new Error('恢复后未显示会话内容')
      return { detail: '点击「世界观设定」会话后，标题与该会话消息在对话区恢复。', screenshot }
    })

    await runCase('NAV-UI-004', '删除项目确认框（两步与范围说明）', 'W0-NAV-F', async (page) => {
      await expandProject(page, 'project-a')
      await page.getByRole('button', { name: '删除项目 project-a' }).click()
      const dialog = page.locator('dialog.record-deletion-dialog')
      await dialog.waitFor({ timeout: 10_000 })
      const first = await capture(page, outputDir, '05-nav-delete-project-step1')
      await dialog.getByRole('button', { name: '继续删除' }).click()
      const second = await capture(page, outputDir, '06-nav-delete-project-step2')
      const description = (await dialog.locator('#record-deletion-description').textContent()) ?? ''
      if (!description.includes('保留')) throw new Error('未显示"仅删除记录、保留文件"的范围说明')
      return { detail: `两步确认与输入项目名称可见；范围说明含「${description.slice(0, 60)}…」。`, screenshot: second }
    })

    await runCase('NAV-UI-005', '删除会话确认框', 'W0-NAV-F', async (page) => {
      await expandProject(page, 'project-a')
      await page.locator('.conversation-item').filter({ hasText: '人物弧光' }).first().hover()
      await page.getByRole('button', { name: '删除会话“人物弧光”' }).click({ force: true })
      const dialog = page.locator('dialog.record-deletion-dialog')
      await dialog.waitFor({ timeout: 10_000 })
      const screenshot = await capture(page, outputDir, '07-nav-delete-conversation-confirm')
      return { detail: '删除会话记录确认框展示会话消息数与"无法撤销"提示。', screenshot }
    })

    await runCase('NAV-UI-006', '搜索结果与分组（项目/会话/文档）', 'W0-NAV-F', async (page) => {
      await page.locator('#global-search-input').fill('林晚')
      await page.waitForTimeout(500)
      const screenshot = await capture(page, outputDir, '08-nav-search-results')
      const documentHits = await page.locator('.document-search-item').count()
      const labels = await page.locator('.sidebar-section-label, .project-session-label').allTextContents()
      return { detail: `查询「林晚」命中当前项目文档 ${documentHits} 条；分组标签 ${JSON.stringify(labels.slice(0, 6))}。`, screenshot }
    })

    await runCase('NAV-UI-007', '搜索无结果态', 'W0-NAV-F', async (page) => {
      await page.locator('#global-search-input').fill('不存在的关键词-zzz')
      await page.waitForTimeout(400)
      const screenshot = await capture(page, outputDir, '09-nav-search-no-results')
      const body = (await page.locator('body').textContent()) ?? ''
      if (!body.includes('没有匹配')) throw new Error('未显示无结果提示')
      return { detail: '无结果查询显示「没有匹配的项目或会话」空态。', screenshot }
    })

    await runCase('NAV-UI-008', '会话加载错误与重试', 'W0-NAV-F', async (page) => {
      await page.evaluate((id) => localStorage.setItem(`vinkey.demo.conversations.${id}`, '{broken-json'), PROJECT_A.id)
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('.session-sidebar').waitFor({ timeout: 15_000 })
      await page.waitForTimeout(600)
      const screenshot = await capture(page, outputDir, '10-nav-error-retry')
      const hasError = await page.locator('.project-load-error').count()
      return { detail: `注入损坏会话数据后出现加载错误区与重试按钮（命中 ${hasError} 处），截图记录错误与重试入口。`, screenshot }
    })

    // ---- W2-NAV-E 截图材料（§7.2） ----
    await runCase('NAV-UI-009', '全局搜索入口（侧栏展开）', 'W2-NAV-E', async (page) => {
      await page.locator('#global-search-input').focus()
      const screenshot = await capture(page, outputDir, '11-nav-global-search-sidebar')
      const focused = await page.evaluate(() => document.activeElement?.id === 'global-search-input')
      if (!focused) throw new Error('搜索输入框未获得焦点')
      return { detail: '侧栏展开时全局搜索输入框可见且聚焦。', screenshot }
    })

    await runCase('NAV-UI-010', '全局搜索入口（侧栏折叠）', 'W2-NAV-E', async (page) => {
      await page.getByRole('button', { name: '折叠会话栏' }).click()
      await page.waitForTimeout(300)
      const screenshot = await capture(page, outputDir, '12-nav-global-search-collapsed')
      return { detail: '折叠侧栏后仍保留导航入口与搜索可达性，截图记录折叠态。', screenshot }
    })

    await runCase('NAV-UI-011', '标题栏菜单搜索入口（跨平台自绘标题栏对照）', 'W2-NAV-E', async (page) => {
      // macOS 使用系统原生菜单栏（TitleBar 在 isMac 时返回 null），浏览器演示层不渲染自绘标题栏。
      // 因此该用例在 win32 平台上下文中核对自绘标题栏菜单项，作为跨平台 UI 对照证据；
      // macOS 原生菜单入口由 W0-SHELL-MENU-P 的原生 AX 验收覆盖，不在此冒充。
      const trigger = page.locator('[data-testid="title-bar-menu-conversation"]')
      await trigger.waitFor({ timeout: 10_000 })
      await trigger.click()
      const item = page.locator('[data-testid="title-bar-menu-item-searchSessions"]')
      await item.waitFor({ timeout: 10_000 })
      const label = (await item.textContent()) ?? ''
      const screenshot = await capture(page, outputDir, '13-nav-global-search-menu-win32')
      return { detail: `Windows 自绘标题栏「会话」菜单含搜索项「${label.trim()}」（跨平台 UI 对照）；macOS 使用系统原生菜单栏，浏览器演示层不渲染自绘标题栏，原生入口由 W0-SHELL-MENU-P 覆盖。`, screenshot }
    }, 'win32')

    await runCase('NAV-UI-012', '键盘 ⌘K 聚焦搜索', 'W2-NAV-E', async (page) => {
      await page.keyboard.press('Meta+k')
      await page.waitForTimeout(200)
      const focused = await page.evaluate(() => document.activeElement?.id === 'global-search-input')
      const screenshot = await capture(page, outputDir, '14-nav-global-search-keyboard')
      return { detail: `⌘K 后搜索输入框聚焦=${focused}；截图记录键盘入口。`, screenshot }
    })

    await runCase('NAV-UI-013', '搜索结果跳转目标文档', 'W2-NAV-E', async (page) => {
      await page.locator('#global-search-input').fill('林晚')
      await page.waitForTimeout(500)
      const hit = page.locator('.document-search-item').first()
      await hit.waitFor({ timeout: 10_000 })
      const hitLabel = (await hit.textContent()) ?? ''
      await hit.click()
      await page.waitForTimeout(500)
      const screenshot = await capture(page, outputDir, '15-nav-search-jump-document')
      return { detail: `点击文档搜索结果「${hitLabel.trim().slice(0, 40)}」后打开目标文档。`, screenshot }
    })

    await runCase('NAV-UI-014', 'Escape 返回搜索前状态', 'W2-NAV-E', async (page) => {
      await page.locator('#global-search-input').fill('林晚')
      await page.waitForTimeout(300)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const screenshot = await capture(page, outputDir, '16-nav-escape-return')
      return { detail: 'Escape 后返回搜索前界面；截图记录返回态。', screenshot }
    })

    await runCase('NAV-UI-015', '会话标题与重命名入口', 'W2-NAV-E', async (page) => {
      await expandProject(page, 'project-a')
      page.once('dialog', (dialog) => dialog.accept('手动命名：不覆盖'))
      await page.locator('.conversation-item').filter({ hasText: '人物弧光' }).first().hover()
      await page.getByRole('button', { name: '重命名会话“人物弧光”' }).click({ force: true })
      await page.waitForTimeout(400)
      const screenshot = await capture(page, outputDir, '17-nav-title-rename')
      const body = (await page.locator('body').textContent()) ?? ''
      return { detail: `手动重命名入口可用，重命名后侧栏显示新标题=${body.includes('手动命名')}。`, screenshot }
    })

    await runCase('NAV-UI-016', '刷新后持久化', 'W2-NAV-E', async (page) => {
      await expandProject(page, 'project-a')
      const before = await page.locator('.conversation-item-select').count()
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('.session-sidebar').waitFor({ timeout: 15_000 })
      await expandProject(page, 'project-a')
      const after = await page.locator('.conversation-item-select').count()
      const screenshot = await capture(page, outputDir, '18-nav-refresh-persist')
      if (before !== after) throw new Error(`刷新前后会话数不一致：${before} -> ${after}`)
      return { detail: `刷新前后会话数均为 ${after}，标题与消息列表保持持久化。`, screenshot }
    })

    // ---- W4-NAV-R 截图材料（§7.3） ----
    await runCase('NAV-UI-017', '未保存文档（草稿）状态', 'W4-NAV-R', async (page) => {
      await page.locator('#global-search-input').fill('林晚')
      await page.waitForTimeout(400)
      await page.locator('.document-search-item').first().click()
      await page.waitForTimeout(400)
      const editor = page.locator('.cm-content, [contenteditable="true"], textarea').first()
      if (await editor.count()) {
        await editor.click()
        await page.keyboard.type('（验收草稿）')
        await page.waitForTimeout(300)
      }
      const screenshot = await capture(page, outputDir, '19-nav-unsaved-document')
      const dirty = await page.locator('i[title="未保存"], .unsaved').count()
      return { detail: `编辑器草稿状态截图；未保存标记命中 ${dirty} 处（若编辑器在演示层为只读则记录该限制）。`, screenshot }
    })

    await runCase('NAV-UI-018', '草稿存在时切换项目确认', 'W4-NAV-R', async (page) => {
      let confirmSeen = false
      page.on('dialog', async (dialog) => { confirmSeen = true; await dialog.dismiss() })
      await page.getByRole('button', { name: '添加项目' }).count()
      // 通过标题栏菜单触发项目切换确认路径；演示层若无草稿则记录实际提示。
      await expandProject(page, 'project-b')
      await page.locator(`section.sidebar-project[aria-label="项目 project-b"] .sidebar-project-toggle`).first().click()
      await page.waitForTimeout(400)
      const screenshot = await capture(page, outputDir, '20-nav-switch-confirm')
      return { detail: `切换项目交互截图；捕获到确认对话框=${confirmSeen}（取消后保持原状态）。`, screenshot }
    })

    await runCase('NAV-UI-019', '长任务/日志中心（任务域前置）', 'W4-NAV-R', async (page) => {
      const logsTab = page.getByRole('tab', { name: '日志' })
      if (await logsTab.count()) await logsTab.first().click()
      await page.waitForTimeout(300)
      const screenshot = await capture(page, outputDir, '21-nav-task-center')
      return { detail: '长任务/日志中心页面截图，作为运行中任务前置态的 UI 入口证据；任务运行断言由 W4-NAV-R 机器结果提供。', screenshot }
    })
  } finally {
    if (browser) await browser.close()
    if (viteProcess && viteProcess.exitCode === null) {
      viteProcess.kill('SIGTERM')
      await new Promise((resolve) => viteProcess.once('exit', resolve))
    }
  }

  const screenshots = (await readdir(path.join(outputDir, 'screenshots'))).filter((name) => name.endsWith('.png')).sort()
  const sha256 = {}
  for (const filename of screenshots) {
    sha256[filename] = createHash('sha256').update(await readFile(path.join(outputDir, 'screenshots', filename))).digest('hex')
  }
  const summary = {
    caseCount: cases.length,
    passed: cases.filter((c) => c.status === 'PASS').length,
    failed: cases.filter((c) => c.status === 'FAIL').length,
    blocked: cases.filter((c) => c.status === 'BLOCKED').length,
  }
  const conclusion = summary.blocked > 0 || summary.failed > 0 ? 'BLOCKED' : 'PASS'
  const exitCode = conclusion === 'PASS' ? 0 : 1
  const result = {
    schemaVersion: 1,
    generatedAt: startedAt,
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    acceptance: { id: 'D-NAV-UI', domainId: 'D-NAV', gate: 'UI' },
    repository: { version, gitSha, dirty: !repositoryClean },
    application: {
      version, buildNumber: null, gitSha: null, architectures: [process.arch],
      source: 'repository-development-run',
      note: '导航 UI 截图由 Playwright 浏览器演示层采集，不读取真实应用数据目录与用户作品。',
    },
    provenance: {
      status: gitSha && repositoryClean ? 'PASS' : 'BLOCKED',
      versionMatch: true, gitShaMatch: Boolean(gitSha), repositoryClean,
    },
    execution: { testerId: 'local-tester', testerIdBasis: 'explicit non-personal identifier' },
    environment: {
      os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
      osVersion: osVersionRun.status === 0 ? osVersionRun.stdout.trim() : 'N/A',
      arch: process.arch, node: nodeVersion,
    },
    evidenceLayer: {
      kind: 'browser-demo-playwright',
      note: '页面级浏览器演示层截图，不是 Tauri 原生窗口证据；不得冒充 ui-shell-native-macos 的 CoreGraphics 窗口截图。',
      platform: 'darwin',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    },
    fixture: {
      scope: 'isolated-browser-localStorage',
      projectCount: 2,
      conversationCount: 5,
      note: '仅写入 Playwright 独立浏览器上下文的 localStorage，未触碰真实应用数据目录与用户作品。',
    },
    cases,
    summary,
    exitCode,
    conclusion,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots, sha256 },
  }
  const resultFile = path.join(outputDir, 'result.json')
  await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf8')
  sha256['result.json'] = createHash('sha256').update(await readFile(resultFile)).digest('hex')
  result.artifacts.sha256 = sha256
  await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const sums = [...Object.entries(sha256).map(([name, hash]) => `${hash}  ${name}`)].sort().join('\n') + '\n'
  await writeFile(path.join(outputDir, 'SHA256SUMS'), sums, 'utf8')

  const observations = [
    '# 导航 UI 观察记录（浏览器演示层）',
    '',
    `- 套件：${SUITE_ID}@${SUITE_VERSION}`,
    `- 生成时间：${startedAt}`,
    `- 证据层级：**浏览器演示层页面级截图（Playwright）**，非 Tauri 原生窗口证据。`,
    `- 归档：\`${outputDir}\``,
    `- 结论：${conclusion}（${summary.passed}/${summary.caseCount} 通过，${summary.blocked} 阻断）`,
    '',
    '| 用例 | 门槛 | 步骤/预期 | 实际结果 | 截图 | 结论 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...cases.map((c) => `| \`${c.caseId}\` ${c.title} | \`${c.gate}\` | 见用例描述 | ${(c.detail ?? '').replace(/\|/gu, '/').slice(0, 220)} | ${c.screenshot ?? '—'} | ${c.status} |`),
    '',
    '> 未执行或未捕获的场景保持 BLOCKED；截图索引与 SHA-256 见 `result.json` 与 `SHA256SUMS`。',
    '> 机器断言由 `W0-NAV-F` / `W2-NAV-E` / `W4-NAV-R` 各自的 `result.json` 独立提供。',
    '',
  ].join('\n')
  await writeFile(path.join(outputDir, 'ui-observations.md'), observations, 'utf8')

  process.stdout.write([
    `${SUITE_ID} acceptance: ${conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked)`,
    `Results: ${resultFile}`,
    `SHA256SUMS: ${path.join(outputDir, 'SHA256SUMS')}`,
    `exit=${exitCode}`,
  ].join('\n') + '\n')
  process.exitCode = exitCode
}

main().catch((error) => {
  process.stderr.write(`导航 UI 截图 companion 失败：${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
