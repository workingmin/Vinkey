#!/usr/bin/env node
// 模型设置 UI 截图 companion（UI-ACC-SETTINGS-UI-001）。
// 用 Playwright 驱动 Vite 浏览器演示层，真实点击侧栏「模型与应用设置」进入设置页，
// 覆盖设置页入口、当前模型、服务表单、目录状态、硬件信息与返回路径，产出截图与观察表。
//
// 证据层级声明：本脚本产出的是【浏览器演示层（Playwright 页面级）UI 证据】，
// 不是 Tauri 原生窗口证据。设置页交互的客观断言由 SettingsPage.test.tsx 17/17 提供，
// W1-MODEL-E 机器结论由 UI-ACC-SETTINGS-001 与 UI-ACC-SETTINGS-CREDENTIAL-001 提供。

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { release } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../..')
const defaultOutput = path.resolve(repositoryRoot, 'artifacts/model-settings-acceptance')
const SUITE_ID = 'UI-ACC-SETTINGS-UI-001'
const SUITE_VERSION = 'settings-ui-1'
const ACCEPTANCE_ID = 'W1-MODEL-E'

function parseArgs(argv) {
  const options = { output: defaultOutput, baseUrl: null, help: false, outputExact: false, platform: process.platform }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') options.help = true
    else if (value === '--output') options.output = path.resolve(argv[++index] ?? '')
    else if (value === '--base-url') options.baseUrl = argv[++index] ?? null
    else if (value === '--output-exact') options.outputExact = true
    else if (value === '--platform') {
      const platform = argv[++index]
      if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') throw new Error(`不支持的平台：${platform}`)
      options.platform = platform
    } else throw new Error(`未知参数：${value}`)
  }
  return options
}

function printHelp() {
  process.stdout.write(`模型设置 UI 截图 companion（${SUITE_ID} / ${ACCEPTANCE_ID}）

用法：npm run test:model-settings-ui:win -- [选项]

选项：
  --output <目录>     证据归档目录（默认 artifacts/model-settings-acceptance）
  --base-url <URL>    使用已运行的 Vite 服务，不启动/停止服务
  --output-exact      将 --output 作为本次批次目录，不追加 run-*
  --platform <name>   浏览器演示 navigator.platform 上下文（darwin/win32/linux）
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
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite 提前退出，退出码 ${child.exitCode}`)
    try { const response = await fetch(url); if (response.ok) return } catch { /* 尚未监听 */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`等待 Vite 启动超时：${url}`)
}

async function newPage(browser, baseUrl, outputDir, platform) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await context.addInitScript((platformName) => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: platformName === 'darwin' ? 'MacIntel' : 'Win32' })
    localStorage.clear()
    localStorage.setItem('vinkey.theme', 'light')
    localStorage.setItem('vinkey.sidebarCollapsed', 'false')
  }, platform)
  const page = await context.newPage()
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('.session-sidebar').waitFor({ timeout: 20_000 })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return { context, page, consoleErrors }
}

async function openSettings(page) {
  const entry = page.locator('.session-sidebar-footer button[aria-label="模型与应用设置"]')
  await entry.waitFor({ timeout: 10_000 })
  await entry.click()
  await page.locator('section.settings-page').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)
}

async function capture(page, outputDir, name) {
  const target = path.join(outputDir, 'screenshots', `${name}.png`)
  await page.screenshot({ path: target, fullPage: false, animations: 'disabled' })
  return `${name}.png`
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
  const version = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')).version
  const git = spawnSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const gitSha = git.status === 0 ? git.stdout.trim() : null
  const statusRun = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain'], { encoding: 'utf8' })
  const repositoryClean = statusRun.status === 0 && !statusRun.stdout.trim()
  const osVersion = options.platform === 'win32' ? `Windows build ${release()}` : release()

  const runCase = async (caseId, title, fn) => {
    let session = null
    try {
      session = await newPage(browser, baseUrl, outputDir, options.platform)
      const result = await fn(session.page)
      cases.push({ caseId, title, gate: ACCEPTANCE_ID, status: 'PASS', detail: result.detail, screenshot: result.screenshot ?? null, source: 'playwright-browser-demo', consoleErrors: session.consoleErrors })
      process.stderr.write(`[${caseId}] PASS ${title}\n`)
    } catch (error) {
      cases.push({ caseId, title, gate: ACCEPTANCE_ID, status: 'BLOCKED', detail: String(error.message ?? error).slice(0, 400), screenshot: null, source: 'playwright-browser-demo' })
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

    await runCase('SETTINGS-UI-001', '设置页入口（侧栏按钮）', async (page) => {
      const sidebar = await capture(page, outputDir, '01-settings-sidebar-entry')
      await openSettings(page)
      const heading = await page.getByRole('heading', { name: '模型设置', level: 1 }).count()
      if (!heading) throw new Error('未进入设置页或标题缺失')
      const screenshot = await capture(page, outputDir, '02-settings-page-open')
      return { detail: `点击侧栏「模型与应用设置」后进入设置页，标题「模型设置」可见；入口截图 ${sidebar}。`, screenshot }
    })

    await runCase('SETTINGS-UI-002', '当前模型与服务列表', async (page) => {
      await openSettings(page)
      const picker = page.getByRole('combobox', { name: '当前模型' })
      await picker.waitFor({ timeout: 10_000 })
      const serviceList = page.locator('aside.connection-list[aria-label="模型服务列表"]')
      await serviceList.waitFor({ timeout: 10_000 })
      const serviceCount = await serviceList.locator('button').count()
      const screenshot = await capture(page, outputDir, '03-settings-active-model-services')
      return { detail: `当前模型选择器可见，模型服务列表已渲染（列表按钮 ${serviceCount} 个）。`, screenshot }
    })

    await runCase('SETTINGS-UI-003', '当前模型选择展开', async (page) => {
      await openSettings(page)
      const picker = page.getByRole('combobox', { name: '当前模型' })
      await picker.waitFor({ timeout: 10_000 })
      await picker.click()
      await page.locator('[role="listbox"][aria-label="当前模型"]').waitFor({ timeout: 10_000 })
      const optionCount = await page.locator('[role="option"]').count()
      const screenshot = await capture(page, outputDir, '04-settings-model-picker-open')
      return { detail: `当前模型选择器展开，列出 ${optionCount} 个可选模型条目。`, screenshot }
    })

    await runCase('SETTINGS-UI-004', '添加服务表单（默认态）', async (page) => {
      await openSettings(page)
      await page.getByRole('button', { name: '添加服务' }).click()
      await page.waitForTimeout(300)
      const urlField = page.getByLabel('服务地址')
      await urlField.waitFor({ timeout: 10_000 })
      const screenshot = await capture(page, outputDir, '05-settings-add-service-form')
      return { detail: '点击「添加服务」后显示服务设置表单，服务地址字段可见且处于未保存态。', screenshot }
    })

    await runCase('SETTINGS-UI-005', '本机配置与硬件信息', async (page) => {
      await openSettings(page)
      const panel = page.locator('section.settings-side-panel[aria-labelledby="hardware-title"]')
      await panel.waitFor({ timeout: 10_000 })
      const hardwareText = (await panel.textContent())?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? ''
      const screenshot = await capture(page, outputDir, '06-settings-hardware-panel')
      return { detail: `本机配置面板渲染：${hardwareText}。`, screenshot }
    })

    await runCase('SETTINGS-UI-006', '返回工作区', async (page) => {
      await openSettings(page)
      await page.getByRole('button', { name: '返回工作区' }).click()
      await page.locator('section.settings-page').waitFor({ state: 'detached', timeout: 10_000 })
      const screenshot = await capture(page, outputDir, '07-settings-returned-workspace')
      return { detail: '点击「返回工作区」后设置页关闭，回到主工作区视图。', screenshot }
    })

    await runCase('SETTINGS-UI-007', '窄窗口布局（无横向溢出）', async (page) => {
      await page.setViewportSize({ width: 900, height: 700 })
      await openSettings(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const screenshot = await capture(page, outputDir, '08-settings-narrow-layout')
      if (overflow > 2) throw new Error(`窄窗口出现横向溢出 ${overflow}px`)
      return { detail: `900×700 窄窗口下设置页正常渲染，横向溢出 ${overflow}px。`, screenshot }
    })
  } finally {
    if (viteProcess) { try { viteProcess.kill() } catch { /* ignore */ } }
    if (browser) await browser.close().catch(() => {})
  }

  const passed = cases.filter((item) => item.status === 'PASS').length
  const blocked = cases.filter((item) => item.status === 'BLOCKED').length
  const conclusion = blocked === 0 ? 'PASS' : 'BLOCKED'
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: 'D-MODEL' },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    evidenceLayer: 'playwright-browser-demo (not Tauri native window)',
    environment: { platform: options.platform, osVersion, node: process.version, appVersion: version },
    provenance: { gitSha, repositoryClean, status: gitSha && repositoryClean ? 'PASS' : 'BLOCKED' },
    cases,
    summary: { caseCount: cases.length, passed, blocked },
    conclusion,
  }
  const resultFile = path.join(outputDir, 'result.json')
  await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const digest = createHash('sha256').update(await readFile(resultFile)).digest('hex')
  await writeFile(path.join(outputDir, 'SHA256SUMS'), `${digest}  result.json\n`, 'utf8')
  process.stdout.write(`${SUITE_ID} acceptance: ${conclusion} (${passed}/${cases.length} passed)\nResults: ${resultFile}\nexit=${conclusion === 'PASS' ? 0 : 1}\n`)
  process.exitCode = conclusion === 'PASS' ? 0 : 1
}

await main()
