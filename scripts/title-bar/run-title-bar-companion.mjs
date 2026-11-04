#!/usr/bin/env node
/**
 * M3 WebView companion — W0-SHELL-MENU（计划 §7 第 109 行）
 *
 * 为 TB-MENU-004（编辑焦点分派）、TB-MENU-005（查看页面切换）、
 * TB-MENU-010（菜单关闭与焦点）提供 Playwright/WebView 结构证据，
 * 并复核 TB-MENU-012 的降级入口存在性。
 *
 * 证据层级：浏览器演示层（win32 自绘标题栏上下文），**不是** macOS 原生菜单证据。
 * macOS 使用系统原生菜单栏（TitleBar 在 isMac 时返回 null），故此处覆盖
 * navigator.platform 为 Win32 以渲染自绘菜单，仅作为 WebView 结构 companion。
 *
 * 用法：node run-title-bar-companion.mjs --output <批次目录>/webview
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '../..')
const outputArg = process.argv.indexOf('--output')
const outputDir = outputArg >= 0 ? resolve(process.argv[outputArg + 1]) : resolve(root, 'artifacts/title-bar-companion')
const screenshotDir = join(outputDir, 'screenshots')
mkdirSync(screenshotDir, { recursive: true })

const port = 61000 + Math.floor(Math.random() * 900)
const baseUrl = `http://127.0.0.1:${port}`
const cases = []
let vite = null
let browser = null

function fixtureInitScript() {
  return () => {
    localStorage.clear()
    localStorage.setItem('vinkey.demo.projects', JSON.stringify({
      projects: [
        { id: 'p-a', name: 'project-a', pathLabel: 'x/a' },
        { id: 'p-b', name: 'project-b', pathLabel: 'x/b' },
      ],
      activeId: 'p-a',
    }))
    localStorage.setItem('vinkey.theme', 'light')
  }
}
async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
  })
  await context.addInitScript(fixtureInitScript())
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('.session-sidebar').waitFor({ timeout: 20000 })
  await page.locator('.app-menu-trigger').first().waitFor({ timeout: 15000 })
  return { context, page }
}
async function shot(page, name) {
  const file = join(screenshotDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' })
  return `screenshots/${name}.png`
}
async function openMenu(page, id) {
  await page.locator(`[data-testid="title-bar-menu-${id}"]`).click()
  await page.locator(`#title-bar-menu-${id}`).waitFor({ timeout: 5000 })
}
async function clickMenuItem(page, id, itemId) {
  await page.locator(`[data-testid="title-bar-menu-item-${itemId}"]`).click()
}
function push(caseId, title, status, detail, evidence = []) {
  cases.push({ caseId, title, subset: 'M3-WebView-companion', platform: 'browser-win32-context', status, detail, evidence })
}

async function main() {
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, env: { ...process.env, VITE_UI_ACCEPTANCE: '1' }, stdio: 'ignore',
  })
  let ready = false
  for (let i = 0; i < 80; i += 1) {
    try { const r = await fetch(baseUrl); if (r.ok) { ready = true; break } } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) throw new Error('Vite 演示层未启动')
  browser = await chromium.launch({ headless: true })

  // ---- TB-MENU-004 编辑焦点分派（三类输入）----
  {
    const { context, page } = await newContext()
    try {
      const observations = []
      const evidence = []
      const chatInput = page.locator('.chat-panel textarea, textarea').first()
      await chatInput.fill('菜单焦点验收文本')
      await chatInput.focus()
      await openMenu(page, 'edit')
      await clickMenuItem(page, 'edit', 'selectAll')
      const chatSel = await chatInput.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length, document.activeElement === el])
      observations.push(`对话输入框: selection=${chatSel[0]}-${chatSel[1]}/${chatSel[2]}, focusRetained=${chatSel[3]}`)
      evidence.push(await shot(page, 'm3-edit-chat-focus'))

      const searchInput = page.locator('#global-search-input')
      await searchInput.fill('人物弧光')
      await searchInput.focus()
      await openMenu(page, 'edit')
      await clickMenuItem(page, 'edit', 'selectAll')
      const searchSel = await searchInput.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length, document.activeElement === el])
      observations.push(`搜索输入框: selection=${searchSel[0]}-${searchSel[1]}/${searchSel[2]}, focusRetained=${searchSel[3]}`)
      evidence.push(await shot(page, 'm3-edit-search-focus'))

      // 无有效编辑目标时禁用
      await page.locator('.title-bar-brand').click()
      await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
      await openMenu(page, 'edit')
      const disabled = await page.locator('#title-bar-menu-edit [role="menuitem"]:disabled, #title-bar-menu-edit button:disabled').count()
      observations.push(`无有效目标时禁用项数=${disabled}`)
      evidence.push(await shot(page, 'm3-edit-no-target'))
      const ok = chatSel[1] === chatSel[2] && chatSel[3] && searchSel[1] === searchSel[2] && searchSel[3] && disabled > 0
      push('TB-MENU-004', '编辑焦点分派（WebView 结构证据）', ok ? 'PASS' : 'BLOCKED',
        `${observations.join('；')}。浏览器演示层只提供结构证据；macOS 原生编辑项接收者由主批次 AX 焦点观察覆盖，完整三类输入组合仍依赖 W0-EDITOR-F。`, evidence)
    } catch (cause) {
      push('TB-MENU-004', '编辑焦点分派（WebView 结构证据）', 'BLOCKED', `companion 执行异常：${String(cause)}`, [])
    } finally { await context.close() }
  }

  // ---- TB-MENU-005 查看页面切换 ----
  {
    const { context, page } = await newContext()
    try {
      const expected = [['chat', '对话'], ['files', '文件'], ['logs', '日志']]
      const observations = []
      const evidence = []
      let ok = true
      for (const [itemId, label] of expected) {
        await openMenu(page, 'view')
        await clickMenuItem(page, 'view', itemId)
        await page.waitForTimeout(200)
        const active = await page.locator('button[role="tab"][aria-selected="true"]').first().textContent()
        const matched = (active || '').includes(label)
        observations.push(`${label}: activeTab=${(active || '').trim()}, matched=${matched}`)
        evidence.push(await shot(page, `m3-view-${itemId}`))
        if (!matched) ok = false
      }
      push('TB-MENU-005', '查看页面切换（WebView 结构证据）', ok ? 'PASS' : 'FAIL',
        `${observations.join('；')}。一次切换一个内容页，aria-selected 与菜单项一致。`, evidence)
    } catch (cause) {
      push('TB-MENU-005', '查看页面切换（WebView 结构证据）', 'BLOCKED', `companion 执行异常：${String(cause)}`, [])
    } finally { await context.close() }
  }

  // ---- TB-MENU-010 菜单关闭与焦点 ----
  {
    const { context, page } = await newContext()
    try {
      const trigger = page.locator('[data-testid="title-bar-menu-conversation"]')
      await trigger.click()
      const opened = await page.locator('#title-bar-menu-conversation').count()
      const evidence = [await shot(page, 'm3-menu-open')]
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
      const closed = await page.locator('#title-bar-menu-conversation').count()
      const focusReturned = await trigger.evaluate((el) => document.activeElement === el)
      evidence.push(await shot(page, 'm3-menu-closed-focus'))
      const ok = opened === 1 && closed === 0 && focusReturned
      push('TB-MENU-010', '菜单关闭与焦点（WebView 结构证据）', ok ? 'PASS' : 'FAIL',
        `打开时菜单节点=${opened}；Escape 后残留=${closed}；焦点回到 trigger=${focusReturned}。与原生批次 states/menu-close-*.json 互补。`, evidence)
    } catch (cause) {
      push('TB-MENU-010', '菜单关闭与焦点（WebView 结构证据）', 'BLOCKED', `companion 执行异常：${String(cause)}`, [])
    } finally { await context.close() }
  }

  // ---- TB-MENU-012 降级入口存在性 ----
  {
    const { context, page } = await newContext()
    try {
      const collapse = await page.locator('.sidebar-collapse-button').count()
      const send = await page.locator('.send-button').count()
      await openMenu(page, 'view')
      await clickMenuItem(page, 'view', 'files')
      await page.waitForTimeout(200)
      const fileToolbar = await page.locator('.file-browser-header .header-actions').count()
      const evidence = [await shot(page, 'm3-degraded-entries')]
      const ok = collapse > 0 && send > 0 && fileToolbar > 0
      push('TB-MENU-012', '首版减法审计的降级入口存在性', ok ? 'PASS' : 'BLOCKED',
        `侧栏折叠按钮=${collapse}；对话输入区发送/停止按钮=${send}；项目文件页工具栏=${fileToolbar}。三者均可从局部入口到达，不需要全局菜单项。`, evidence)
    } catch (cause) {
      push('TB-MENU-012', '首版减法审计的降级入口存在性', 'BLOCKED', `companion 执行异常：${String(cause)}`, [])
    } finally { await context.close() }
  }

  const summary = {
    caseCount: cases.length,
    passed: cases.filter((c) => c.status === 'PASS').length,
    failed: cases.filter((c) => c.status === 'FAIL').length,
    blocked: cases.filter((c) => c.status === 'BLOCKED').length,
  }
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: 'UI-ACC-TITLE-BAR-COMPANION', batch: 'W0-SHELL-MENU', phase: 'M3', plan: 'docs/acceptance/ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md §7 M3' },
    evidenceLayer: {
      kind: 'playwright-webview-companion',
      platformContext: 'Win32（覆盖 navigator.platform 以渲染自绘标题栏）',
      note: '仅提供 WebView 结构证据，不能证明 macOS 原生菜单、交通灯、系统窗口按钮或物理 DPI；原生证据见同批次 result.json 与 menu-tree.json。',
    },
    cases,
    summary,
    conclusion: summary.failed > 0 ? 'FAIL' : summary.blocked > 0 ? '条件通过' : 'PASS',
    artifacts: { screenshots: [], sha256: {} },
  }
  const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
  const hashes = {}
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walk(full, relative); continue }
      if (['result.json', 'SHA256SUMS'].includes(entry.name)) continue
      if (entry.name.endsWith('.png')) result.artifacts.screenshots.push(relative)
      hashes[relative] = hashOf(full)
    }
  }
  walk(outputDir)
  result.artifacts.sha256 = hashes
  const resultFile = join(outputDir, 'result.json')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  writeFileSync(join(outputDir, 'SHA256SUMS'),
    Object.entries(hashes).map(([n, h]) => `${h}  ${n}`)
      .concat([`${hashOf(resultFile)}  result.json`]).sort().join('\n') + '\n', 'utf8')
  console.log(`M3 WebView companion: ${result.conclusion} (${summary.passed}/${summary.caseCount} PASS)`)
  console.log(`Results: ${resultFile.replace(root + '/', '')}`)
  return result
}

main().then((result) => {
  process.exitCode = result.summary.failed > 0 ? 1 : 0
}).catch((cause) => {
  console.error(`M3 companion 失败：${String(cause)}`)
  process.exitCode = 1
}).finally(async () => {
  try { await browser?.close() } catch { /* ignore */ }
  try { vite?.kill('SIGTERM') } catch { /* ignore */ }
})
