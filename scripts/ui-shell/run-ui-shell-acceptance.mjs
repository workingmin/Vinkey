#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../..')
const defaultOutput = path.resolve(repositoryRoot, 'artifacts/ui-shell-acceptance')
const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 680 },
]

function parseArgs(argv) {
  const options = { output: defaultOutput, baseUrl: null, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') options.help = true
    else if (value === '--output') options.output = path.resolve(argv[++index] ?? '')
    else if (value === '--base-url') options.baseUrl = argv[++index] ?? null
    else throw new Error(`未知参数：${value}`)
  }
  return options
}

function printHelp() {
  process.stdout.write(`应用壳层 Playwright 验收\n\n用法：npm run test:ui-shell-acceptance -- [选项]\n\n选项：\n  --output <目录>    证据归档目录（默认：artifacts/ui-shell-acceptance）\n  --base-url <URL>   使用已运行的 Vite 服务，不启动/停止服务\n  --help             显示帮助\n`)
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
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* Vite 尚未监听 */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`等待 Vite 启动超时：${url}`)
}

async function prepareBrowserState(page) {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('vinkey.demo.projects', JSON.stringify({ projects: [], activeId: null }))
    localStorage.setItem('vinkey.theme', 'dark')
    localStorage.setItem('vinkey.sidebarCollapsed', 'false')
  })
}

async function assertNoHorizontalOverflow(page, caseId) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    rootMinWidth: getComputedStyle(document.querySelector('.app-frame')).minWidth,
  }))
  if (dimensions.scrollWidth > dimensions.clientWidth) {
    throw new Error(`${caseId}: 页面横向溢出 ${dimensions.scrollWidth} > ${dimensions.clientWidth}; .app-frame min-width=${dimensions.rootMinWidth}`)
  }
}

async function capture(page, output, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false })
}

async function runCase(cases, caseId, title, action) {
  const startedAt = Date.now()
  try {
    await action()
    cases.push({ caseId, title, status: 'PASS', durationMs: Date.now() - startedAt, error: null })
  } catch (error) {
    cases.push({ caseId, title, status: 'FAIL', durationMs: Date.now() - startedAt, error: String(error) })
  }
}

async function writeAcceptanceArtifacts(output, result) {
  const screenshots = (await readdir(output)).filter((name) => name.endsWith('.png')).sort()
  result.artifacts ??= { outputDirectory: output, screenshots: [], sha256: {}, manifestFile: 'SHA256SUMS' }
  result.artifacts.outputDirectory = output
  result.artifacts.manifestFile = 'SHA256SUMS'
  result.artifacts.screenshots = screenshots
  result.artifacts.sha256 = {}
  for (const filename of screenshots) {
    result.artifacts.sha256[filename] = createHash('sha256').update(await readFile(path.join(output, filename))).digest('hex')
  }

  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  const resultHash = createHash('sha256').update(await readFile(path.join(output, 'result.json'))).digest('hex')
  await writeFile(path.join(output, 'SHA256SUMS'), [
    `${resultHash}  result.json`,
    ...screenshots.map((filename) => `${result.artifacts.sha256[filename]}  ${filename}`),
  ].join('\n') + '\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { printHelp(); return 0 }
  const runId = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
  options.output = path.join(options.output, `run-${runId}`)
  await mkdir(options.output, { recursive: true })

  let viteProcess = null
  let browser = null
  let baseUrl = options.baseUrl
  let consoleErrors = []
  const cases = []
  const startedAt = new Date().toISOString()
  const version = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')).version
  let exitCode = 0

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
    for (const platform of ['win32', 'darwin']) {
      const platformContext = await browser.newContext({ viewport: sizes[0], deviceScaleFactor: 1, reducedMotion: 'reduce' })
      await platformContext.addInitScript((platformName) => {
        Object.defineProperty(navigator, 'platform', { configurable: true, value: platformName === 'darwin' ? 'MacIntel' : 'Win32' })
      }, platform)
      const page = await platformContext.newPage()
      page.on('pageerror', (error) => consoleErrors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
      await prepareBrowserState(page)
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      await page.getByRole('tab', { name: '对话' }).waitFor()

      if (platform === 'win32') {
        await runCase(cases, 'SHELL-P-001-WIN-DOM', 'Windows 自绘标题栏/菜单/按钮 DOM 布局', async () => {
          await page.locator('.title-bar').waitFor()
          await page.getByRole('button', { name: '最小化窗口' }).waitFor()
          await page.getByRole('button', { name: '最大化窗口' }).waitFor()
          await page.getByRole('button', { name: '关闭窗口' }).waitFor()
          await page.getByRole('button', { name: '文件', exact: true }).click()
          await page.getByRole('menu').waitFor()
          await capture(page, options.output, '01-win-titlebar-menu-buttons-web')
          await page.keyboard.press('Escape')
          await capture(page, options.output, '01-win-menu-closed-web')
        })
      } else {
        await runCase(cases, 'SHELL-P-001-MAC-LAYOUT', 'macOS Overlay 内容区避让布局模拟', async () => {
          await page.locator('.title-bar').waitFor({ state: 'detached' })
          await page.locator('.app-frame[data-platform="mac"] .session-sidebar-header').waitFor()
          const paddingTop = await page.locator('.session-sidebar-header').evaluate((node) => getComputedStyle(node).paddingTop)
          if (paddingTop !== '42px') throw new Error(`macOS Overlay 预留高度不符：${paddingTop}`)
          await capture(page, options.output, '01-mac-overlay-layout-simulation')
        })
      }

      await runCase(cases, `SHELL-P-003-SETTINGS-${platform}`, '侧栏折叠/展开与设置替换后状态恢复', async () => {
        const sidebar = page.locator('.session-sidebar')
        const collapse = page.getByRole('button', { name: '折叠会话栏' })
        await collapse.click()
        await sidebar.waitFor({ state: 'visible' })
        if (!await sidebar.evaluate((node) => node.classList.contains('collapsed'))) throw new Error('侧栏未进入折叠态')
        await capture(page, options.output, `02-${platform}-sidebar-collapsed`)
        await page.getByRole('button', { name: '展开会话栏' }).click()
        await page.getByRole('button', { name: '模型与应用设置' }).click()
        if (!await sidebar.evaluate((node) => node.classList.contains('collapsed'))) throw new Error('设置打开时侧栏应折叠')
        await capture(page, options.output, `02-${platform}-settings-open`)
        await page.getByRole('button', { name: '返回工作区' }).click()
        if (await sidebar.evaluate((node) => node.classList.contains('collapsed'))) throw new Error('返回后未恢复侧栏展开状态')
        await capture(page, options.output, `02-${platform}-settings-closed`)
      })

      await runCase(cases, `SHELL-P-004-CONTENT-${platform}`, '对话/文件/日志切换及无工作区空态', async () => {
        await page.getByRole('tab', { name: '对话' }).click()
        await page.getByRole('tab', { name: '文件' }).click()
        await page.getByText('选择一个本机目录开始创作').waitFor()
        await capture(page, options.output, `03-${platform}-file-no-workspace`)
        await page.getByRole('tab', { name: '日志' }).click()
        await page.locator('.log-center-empty').filter({ hasText: '未打开项目' }).waitFor()
        await capture(page, options.output, `03-${platform}-logs-no-workspace`)
        await page.getByRole('tab', { name: '对话' }).click()
        await page.getByRole('textbox', { name: '对话输入' }).waitFor()
        await capture(page, options.output, `03-${platform}-chat`)
      })

      await runCase(cases, `SHELL-P-006-ERROR-${platform}`, '全局错误条显示与关闭', async () => {
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('vinkey:ui-acceptance-error', { detail: '壳层验收注入错误' })))
        const alert = page.getByRole('alert').filter({ hasText: '壳层验收注入错误' })
        await alert.waitFor()
        await capture(page, options.output, `03-${platform}-error-banner`)
        await alert.getByRole('button', { name: '关闭错误提示' }).click()
        await alert.waitFor({ state: 'detached' })
      })

      await runCase(cases, `SHELL-P-008-THEME-FOCUS-${platform}`, '主题切换和键盘焦点可见性', async () => {
        await page.getByRole('button', { name: '切换浅色主题' }).click()
        if (await page.locator('.app-frame').getAttribute('data-theme') !== 'light') throw new Error('主题未切换为浅色')
        await capture(page, options.output, `04-${platform}-light-theme`)
        const focusable = page.getByRole('tab', { name: '文件' })
        await focusable.focus()
        if (!await focusable.evaluate((node) => node.matches(':focus-visible'))) {
          await page.keyboard.press('Tab')
          if (!await page.evaluate(() => document.activeElement?.matches(':focus-visible'))) throw new Error('键盘焦点指示不可见')
        }
        await capture(page, options.output, `04-${platform}-keyboard-focus`)
        await page.getByRole('button', { name: '切换深色主题' }).click()
        if (await page.locator('.app-frame').getAttribute('data-theme') !== 'dark') throw new Error('主题未恢复深色')
      })

      for (const size of sizes) {
        await runCase(cases, `SHELL-P-007-${platform}-${size.width}x${size.height}`, `${platform} 布局 ${size.width}x${size.height}，DPR 1`, async () => {
          await page.setViewportSize(size)
          await page.getByRole('tab', { name: '对话' }).waitFor()
          await assertNoHorizontalOverflow(page, `${platform} ${size.width}x${size.height}`)
          await capture(page, options.output, `05-${platform}-${size.width}x${size.height}-dpr1`)
        })
      }

      await platformContext.close()
    }

    await runCase(cases, 'SHELL-P-001-PLATFORM', 'macOS 原生菜单/交通灯及 Windows 窗口按钮声明', async () => {
      throw new Error(`本次套件是 Playwright 浏览器层（运行平台 ${process.platform}），不能验证 Tauri 原生菜单、交通灯、系统窗口按钮或物理 DPI；需桌面应用平台执行记录`)
    })
    cases.at(-1).status = 'BLOCKED'

    if (consoleErrors.length > 0) {
      cases.push({ caseId: 'SHELL-P-CONSOLE', title: '浏览器控制台无错误', status: 'FAIL', durationMs: 0, error: [...new Set(consoleErrors)].join('\n') })
    }

    const summary = {
      caseCount: cases.length,
      passed: cases.filter((item) => item.status === 'PASS').length,
      failed: cases.filter((item) => item.status === 'FAIL').length,
      blocked: cases.filter((item) => item.status === 'BLOCKED').length,
    }
    exitCode = summary.failed > 0 ? 2 : summary.blocked > 0 ? 1 : 0
    const conclusion = summary.failed > 0 ? 'FAIL' : summary.blocked > 0 ? 'BLOCKED' : 'PASS'
    const repositorySha = await new Promise((resolve) => {
      const git = spawn('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      git.stdout.on('data', (chunk) => { output += chunk })
      git.on('close', (code) => resolve(code === 0 ? output.trim() : 'unknown'))
    })
    const result = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      acceptance: { id: 'W0-SHELL-P', domainId: 'D-SHELL', gate: 'P' },
      suite: { id: 'ui-shell-playwright', version: '1.0.0' },
      repository: { version, gitSha: repositorySha },
      environment: { os: `${os.platform()} ${os.release()}`, osVersion: os.version(), arch: os.arch(), node: process.version, browser: `Chromium ${browser.version()}`, deviceScaleFactor: 1, viewportSizes: sizes, simulatedPlatforms: ['win32', 'darwin'] },
      platformEvidence: { nativeMenu: 'NOT_COVERED_BY_PLAYWRIGHT', titlebarControls: 'NOT_COVERED_BY_PLAYWRIGHT', macTrafficLights: 'NOT_COVERED_BY_PLAYWRIGHT', physicalDpi: 'REQUIRES_DESKTOP_DIAGNOSTICS' },
      cases,
      summary,
      exitCode,
      artifacts: { outputDirectory: options.output, screenshots: [], sha256: {}, manifestFile: 'SHA256SUMS' },
      conclusion,
      startedAt,
      baseUrl: options.baseUrl ? '<provided>' : '<ephemeral-local-vite>',
    }
    for (const item of cases) {
      if (item.status === 'FAIL') process.stderr.write(`[FAIL] ${item.caseId}: ${item.error}\n`)
      else if (item.status === 'BLOCKED') process.stderr.write(`[BLOCKED] ${item.caseId}: ${item.error}\n`)
      else process.stderr.write(`[${item.status}] ${item.caseId}\n`)
    }
    await writeAcceptanceArtifacts(options.output, result)
    process.stdout.write(`UI shell acceptance: ${conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked)\nResults: ${path.join(options.output, 'result.json')}\nSHA256SUMS: ${path.join(options.output, 'SHA256SUMS')}\nexit=${exitCode}\n`)
  } catch (error) {
    exitCode = 1
    const result = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      acceptance: { id: 'W0-SHELL-P', domainId: 'D-SHELL', gate: 'P' },
      suite: { id: 'ui-shell-playwright', version: '1.0.0' },
      cases,
      summary: { caseCount: cases.length, passed: 0, failed: 0, blocked: 1 },
      exitCode,
      conclusion: 'BLOCKED',
      error: String(error),
    }
    await writeAcceptanceArtifacts(options.output, result)
    process.stdout.write(`UI shell acceptance: BLOCKED (0/${result.summary.caseCount} passed, 0 failed, 1 blocked)\nResults: ${path.join(options.output, 'result.json')}\nSHA256SUMS: ${path.join(options.output, 'SHA256SUMS')}\nexit=${exitCode}\n`)
    process.stderr.write(`UI shell acceptance blocked: ${String(error)}\n`)
  } finally {
    await browser?.close().catch(() => undefined)
    if (viteProcess && viteProcess.exitCode === null) {
      viteProcess.kill('SIGTERM')
      await new Promise((resolve) => viteProcess.once('exit', resolve))
    }
  }

  return exitCode
}

main().then((code) => { process.exitCode = code }).catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
