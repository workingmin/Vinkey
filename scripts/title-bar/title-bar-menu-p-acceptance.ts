import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  collectEnvironment,
  collectRepository,
  installDomHarness,
  parseArguments,
  type CaseResult,
  type CliOptions,
  type EnvironmentInfo,
  type RepositoryInfo,
} from './title-bar-acceptance'
import {
  LEGACY_GLOBAL_MENU_LABELS,
  MACOS_TITLE_BAR_MENU_LABELS,
  TITLE_BAR_MENU_ITEM_LABELS,
  TITLE_BAR_MENU_LABELS,
  TITLE_BAR_MENU_ORDER,
  WINDOWS_TITLE_BAR_MENU_LABELS,
} from '../../src/lib/titleBarMenu'

// W0-SHELL-MENU-P / D-SHELL 标题栏与功能菜单平台/结构子门槛的机器验收入口
// （UI-ACC-TITLE-BAR-001）。覆盖不需要 macOS 原生 AX 即可断言的菜单结构、中文审计、
// 减法审计、页面切换、主题、设置归属、帮助触发和菜单关闭/焦点。真实窗口状态改变
// （TB-MENU-008）保留为阻断项，由目标桌面的原生窗口/菜单自动化或测试人员回填。

export const SUITE_ID = 'UI-ACC-TITLE-BAR-001'
export const SUITE_VERSION = 'title-bar-menu-p-1'
export const ACCEPTANCE_ID = 'W0-SHELL-MENU-P'
export const DOMAIN_ID = 'D-SHELL'
export const GATE = 'P'

export interface PMenuCaseResult extends CaseResult {
  caseId: string
  title: string
  category: 'machine'
  status: CaseResult['status']
  detail: string | null
  blockedReason?: string | null
}

export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  cases?: CaseResult[] | null
}

export interface AcceptanceRunOutput {
  result: Record<string, unknown>
  conclusion: CaseResult['status']
  exitCode: number
  outputDir: string
  resultFile: string
  sha256File: string
  logFile: string
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function usage(): string {
  return `Vinkey 标题栏与功能菜单平台/结构验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  在 WebView/jsdom 环境执行不依赖 macOS 原生 AX 的菜单结构、页面切换、主题、设置归属、
  帮助触发、菜单关闭/焦点、中文审计与首版减法审计机器断言。真实窗口状态改变
  （TB-MENU-008 最小化/缩放/关闭）保持 BLOCKED，等待目标桌面原生证据。

用法：
  npm run test:title-bar-p-acceptance -- [选项]
  npm run test:title-bar-p-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:title-bar-p-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --output <dir>      结果归档目录（result.json、SHA256SUMS）
  --log-file <path>   写入逐用例 JSON 诊断日志
  --tester-id <id>    非个人标识的测试人员代号
  --json              输出完整机器可读 JSON（stdout 只有单个 JSON 文档）
  -h, --help          显示帮助`
}

export function parsePlatformArguments(values: string[]): CliOptions | null {
  const parsed = parseArguments(values)
  if (parsed && parsed.workspace) throw new Error('W0-SHELL-MENU-P 机器入口不接受 --workspace/--keep-fixture')
  if (parsed && parsed.keepFixture) throw new Error('W0-SHELL-MENU-P 机器入口不接受 --keep-fixture')
  return parsed
}

function pass(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'PASS', detail }
}

function fail(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'FAIL', detail }
}

function blocked(caseId: string, title: string, detail: string, blockedReason: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'BLOCKED', detail, blockedReason }
}

function idle(milliseconds = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function runPlatformCases(): Promise<CaseResult[]> {
  installDomHarness()
  const { useAppStore } = await import('../../src/store.ts')
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { TitleBar } = await import('../../src/App.tsx')
  const cases: CaseResult[] = []

  // TB-MENU-001 一级菜单树
  {
    const issues: string[] = []
    if (WINDOWS_TITLE_BAR_MENU_LABELS.join(',') !== '项目,会话,编辑,查看,窗口,帮助') issues.push('Windows 一级菜单标签不正确')
    if (MACOS_TITLE_BAR_MENU_LABELS.join(',') !== 'Vinkey,项目,会话,编辑,查看,窗口,帮助') issues.push('macOS 一级菜单标签不正确')
    if (TITLE_BAR_MENU_ORDER.join(',') !== 'project,conversation,edit,view,window,help') issues.push('菜单 ID 顺序不正确')
    if (WINDOWS_TITLE_BAR_MENU_LABELS.includes('文件')) issues.push('旧“文件”菜单残留')

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    root.render(React.createElement(TitleBar, {
      onPageChange: () => undefined,
      onOpenWorkspace: () => undefined,
      onNewConversation: () => undefined,
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => undefined,
      onShowAbout: () => undefined,
      onShowWindowDiagnostics: () => undefined,
      onShowRuntimeDiagnostics: () => undefined,
    }))
    await idle()
    const labels = TITLE_BAR_MENU_ORDER.map((menuId) => container.querySelector(`[data-testid="title-bar-menu-${menuId}"]`)?.textContent?.trim())
    if (labels.join(',') !== '项目,会话,编辑,查看,窗口,帮助') issues.push(`渲染后菜单树不正确：${labels.join(',')}`)
    root.unmount()
    container.remove()
    cases.push(issues.length > 0 ? fail('TB-MENU-001', '一级菜单树（目标顺序/无文件）', issues.join('；')) : pass('TB-MENU-001', '一级菜单树（目标顺序/无文件）', '静态合同与 WebView 渲染均为 项目/会话/编辑/查看/窗口/帮助，无“文件”。'))
  }

  // TB-MENU-005 查看页面切换与业务状态保持
  {
    const issues: string[] = []
    const container = document.createElement('div')
    document.body.append(container)
    const pages: string[] = []
    useAppStore.setState({
      workspace: { id: 'p1', name: 'workspace', displayName: 'workspace', pathLabel: '/tmp/workspace' } as never,
      conversationId: 'keep-c',
      conversationTitle: '保留会话',
      messages: [{ id: 'm1', role: 'user', content: '保留消息', createdAt: Date.now() }],
      settingsOpen: false,
    })
    const root = createRoot(container)
    root.render(React.createElement(TitleBar, {
      onPageChange: (page: string) => pages.push(page),
      onOpenWorkspace: () => undefined,
      onNewConversation: () => undefined,
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => undefined,
      onShowAbout: () => undefined,
      onShowWindowDiagnostics: () => undefined,
      onShowRuntimeDiagnostics: () => undefined,
    }))
    await idle()
    const trigger = container.querySelector('[data-testid="title-bar-menu-view"]') as HTMLButtonElement | null
    if (!trigger) issues.push('未找到查看菜单触发器')
    else {
      trigger.click()
      await idle()
      const menu = container.querySelector('[role="menu"]')
      if (!menu) issues.push('查看菜单未展开')
      else {
        const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => (item as HTMLElement).textContent?.trim() ?? '')
        if (labels.includes('设置…') || labels.includes('模型与应用设置')) issues.push('查看菜单混入设置')
        trigger.click()
        await idle()
        for (const itemId of ['chat', 'files', 'logs'] as const) {
          trigger.click()
          await idle()
          const item = container.querySelector(`[data-menu-item-id="${itemId}"]`) as HTMLButtonElement | null
          if (!item) { issues.push(`缺少页面项：${itemId}`); continue }
          item.click()
          await idle()
        }
      }
    }
    if (pages.join(',') !== 'chat,file,logs') issues.push(`页面切换回调错误：${pages.join(',')}`)
    const state = useAppStore.getState()
    if (state.workspace?.id !== 'p1' || state.conversationId !== 'keep-c' || state.messages.length !== 1) issues.push('页面切换改变了业务状态')
    root.unmount()
    container.remove()
    cases.push(issues.length > 0 ? fail('TB-MENU-005', '查看页面切换与状态保持', issues.join('；')) : pass('TB-MENU-005', '查看页面切换与状态保持', '查看菜单一次切换一个页面并回调 chat/file/logs；项目/会话/消息状态不变；设置不在查看。'))
  }

  // TB-MENU-006 主题菜单
  {
    const issues: string[] = []
    useAppStore.setState({ theme: 'dark', settingsOpen: false })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    root.render(React.createElement(TitleBar, {
      onPageChange: () => undefined,
      onOpenWorkspace: () => undefined,
      onNewConversation: () => undefined,
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => undefined,
      onShowAbout: () => undefined,
      onShowWindowDiagnostics: () => undefined,
      onShowRuntimeDiagnostics: () => undefined,
    }))
    await idle()
    const trigger = container.querySelector('[data-testid="title-bar-menu-view"]') as HTMLButtonElement | null
    if (!trigger) issues.push('未找到查看菜单触发器')
    else {
      trigger.click()
      await idle()
      const item = container.querySelector('[data-menu-item-id="toggleTheme"]') as HTMLButtonElement | null
      if (!item) issues.push('缺少主题切换项')
      else { item.click(); await idle() }
    }
    const state = useAppStore.getState()
    if (state.theme !== 'light') issues.push('主题未从 dark 切到 light')
    if (localStorage.getItem('vinkey.theme') !== 'light') issues.push('主题未持久化')
    root.unmount()
    container.remove()
    cases.push(issues.length > 0 ? fail('TB-MENU-006', '主题菜单（浅色/深色切换）', issues.join('；')) : pass('TB-MENU-006', '主题菜单（浅色/深色切换）', '查看菜单主题项将 store 主题由 dark 切到 light 并写入 localStorage。'))
  }

  // TB-MENU-007 设置归属与进入/返回
  {
    const issues: string[] = []
    if (TITLE_BAR_MENU_ITEM_LABELS.settings !== '设置…') issues.push('设置文案错误')
    useAppStore.setState({ settingsOpen: false, sidebarCollapsed: false, settingsSidebarBeforeOpen: null })
    useAppStore.getState().setSettingsOpen(true)
    const opened = useAppStore.getState()
    if (!opened.settingsOpen || !opened.sidebarCollapsed) issues.push('打开设置未折叠侧栏')
    useAppStore.getState().setSettingsOpen(false)
    const closed = useAppStore.getState()
    if (closed.settingsOpen || closed.sidebarCollapsed || closed.settingsSidebarBeforeOpen !== null) issues.push('设置返回未恢复壳层状态')
    cases.push(issues.length > 0 ? fail('TB-MENU-007', '设置归属与进入/返回', issues.join('；')) : pass('TB-MENU-007', '设置归属与进入/返回', '设置文案为“设置…”，不在查看菜单；打开/返回正确折叠并恢复侧栏。'))
  }

  // TB-MENU-008 窗口控制为原生桌面阻断项
  cases.push(blocked('TB-MENU-008', '窗口控制（最小化/缩放/关闭）', 'WebView/jsdom 无法改变真实操作系统窗口状态', '需要 Tauri 桌面环境，由测试人员在 macOS/Windows 目标平台执行原生窗口或菜单自动化回填'))

  // TB-MENU-009 帮助与诊断触发（仅可触发级证据）
  {
    const issues: string[] = []
    const called: Record<string, number> = { shortcuts: 0, windowDiagnostics: 0, runtimeDiagnostics: 0, about: 0 }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    root.render(React.createElement(TitleBar, {
      onPageChange: () => undefined,
      onOpenWorkspace: () => undefined,
      onNewConversation: () => undefined,
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => { called.shortcuts += 1 },
      onShowAbout: () => { called.about += 1 },
      onShowWindowDiagnostics: () => { called.windowDiagnostics += 1 },
      onShowRuntimeDiagnostics: () => { called.runtimeDiagnostics += 1 },
    }))
    await idle()
    const trigger = container.querySelector('[data-testid="title-bar-menu-help"]') as HTMLButtonElement | null
    if (!trigger) issues.push('未找到帮助菜单触发器')
    else {
      for (const id of ['shortcuts', 'windowDiagnostics', 'runtimeDiagnostics', 'about'] as const) {
        trigger.click()
        await idle()
        const item = container.querySelector(`[data-menu-item-id="${id}"]`) as HTMLButtonElement | null
        if (!item) { issues.push(`缺少帮助项：${id}`); continue }
        item.click()
        await idle()
        if (container.querySelector('[role="menu"]')) issues.push('帮助动作后菜单未关闭')
      }
    }
    if (Object.values(called).some((count) => count !== 1)) issues.push(`帮助回调次数异常：${JSON.stringify(called)}`)
    root.unmount()
    container.remove()
    cases.push(issues.length > 0 ? fail('TB-MENU-009', '帮助与诊断触发（触发级）', issues.join('；')) : pass('TB-MENU-009', '帮助与诊断触发（触发级）', '快捷键/窗口诊断/运行日志/关于四项各回调一次并关闭菜单；对话框视觉与焦点返回仍需桌面复核。'))
  }

  // TB-MENU-010 菜单关闭与焦点
  {
    const issues: string[] = []
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    root.render(React.createElement(TitleBar, {
      onPageChange: () => undefined,
      onOpenWorkspace: () => undefined,
      onNewConversation: () => undefined,
      onRefreshWorkspace: () => undefined,
      onShowShortcuts: () => undefined,
      onShowAbout: () => undefined,
      onShowWindowDiagnostics: () => undefined,
      onShowRuntimeDiagnostics: () => undefined,
    }))
    await idle()
    const trigger = container.querySelector('[data-testid="title-bar-menu-conversation"]') as HTMLButtonElement | null
    if (!trigger) issues.push('未找到会话菜单触发器')
    else {
      trigger.focus()
      trigger.click()
      await idle()
      if (!container.querySelector('[role="menu"]')) issues.push('会话菜单未展开')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await idle()
      if (container.querySelector('[role="menu"]')) issues.push('Escape 后菜单未关闭')
      if (document.activeElement !== trigger) issues.push('Escape 后焦点未回到触发按钮')
    }
    root.unmount()
    container.remove()
    cases.push(issues.length > 0 ? fail('TB-MENU-010', '菜单关闭与焦点返回', issues.join('；')) : pass('TB-MENU-010', '菜单关闭与焦点返回', 'Escape 关闭菜单并返回触发按钮焦点。'))
  }

  // TB-MENU-011 中文菜单审计
  {
    const issues: string[] = []
    const ownLabels = [...Object.values(TITLE_BAR_MENU_LABELS), ...Object.values(TITLE_BAR_MENU_ITEM_LABELS), ...WINDOWS_TITLE_BAR_MENU_LABELS, ...MACOS_TITLE_BAR_MENU_LABELS]
    for (const forbidden of ['File', 'View', 'Edit', 'Window', 'Help', 'Settings']) {
      if (ownLabels.includes(forbidden)) issues.push(`自有菜单出现英文残留：${forbidden}`)
    }
    if ([...Object.values(TITLE_BAR_MENU_LABELS), ...Object.values(TITLE_BAR_MENU_ITEM_LABELS)].some((label) => !/[\u4e00-\u9fff]/u.test(label))) {
      issues.push('存在不含中文的自有菜单标签')
    }
    cases.push(issues.length > 0 ? fail('TB-MENU-011', '中文菜单审计', issues.join('；')) : pass('TB-MENU-011', '中文菜单审计', '自有菜单标签全中文，无 File/View/Settings 等英文残留。'))
  }

  // TB-MENU-012 首版菜单减法审计
  {
    const issues: string[] = []
    const labels = Object.values(TITLE_BAR_MENU_ITEM_LABELS)
    for (const forbidden of ['停止当前生成', '展开/折叠项目与会话栏', '保存文档', '关闭文档', '新建文档…', '刷新工作区', '打开工作区…', '对话页', '文件页', '日志中心']) {
      if (labels.includes(forbidden)) issues.push(`首版不应出现旧菜单项：${forbidden}`)
    }
    if (LEGACY_GLOBAL_MENU_LABELS.includes('停止当前生成')) issues.push('旧菜单黑名单缺少停止生成')
    if (!WINDOWS_TITLE_BAR_MENU_LABELS.includes('项目')) issues.push('项目入口缺失')
    if (!WINDOWS_TITLE_BAR_MENU_LABELS.includes('会话')) issues.push('会话入口缺失')
    cases.push(issues.length > 0 ? fail('TB-MENU-012', '首版菜单减法审计', issues.join('；')) : pass('TB-MENU-012', '首版菜单减法审计', '未混入停止生成/侧栏折叠/文档保存关闭等旧菜单项；项目与会话入口存在。'))
  }

  return cases
}

function summarize(cases: CaseResult[]): { caseCount: number; passed: number; failed: number; blocked: number } {
  return {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
  }
}

function conclusionOf(cases: CaseResult[]): CaseResult['status'] {
  const summary = summarize(cases)
  if (summary.failed > 0) return 'FAIL'
  if (summary.blocked > 0) return 'BLOCKED'
  return 'PASS'
}

export async function runPMenuAcceptance(input: AcceptanceRunInput): Promise<AcceptanceRunOutput> {
  const startedAt = Date.now()
  const cases = input.cases && input.cases.length > 0 ? input.cases : await runPlatformCases()
  const allCases = cases.map((item) => ({ ...item, durationMs: item.durationMs ?? 0 }))
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = input.options.outputDir ?? join(input.repository.root, 'artifacts', 'title-bar-p-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = input.options.logFile ?? join(outputDir, 'diagnostics.json')
  if (!existsSync(dirname(logFile))) throw new Error(`--log-file 父目录不存在：${dirname(logFile)}`)

  const summary = summarize(allCases)
  const conclusion = conclusionOf(allCases)
  const exitCode = conclusion === 'FAIL' ? 2 : 0
  const result: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    repository: { version: input.repository.version, gitSha: input.repository.gitSha, dirty: input.repository.dirty },
    application: {
      version: input.repository.version,
      buildNumber: null,
      gitSha: null,
      architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W0-SHELL-MENU-P 机器层证据：覆盖不依赖 macOS 原生 AX 的菜单结构/行为断言；TB-MENU-008 窗口状态改变保留为 BLOCKED，等待目标桌面原生证据。',
    },
    provenance: { status: input.repository.gitSha && !input.repository.dirty ? 'PASS' : 'BLOCKED', versionMatch: true, gitShaMatch: Boolean(input.repository.gitSha), repositoryClean: !input.repository.dirty },
    execution: { testerId: input.options.testerId ?? 'local-tester', testerIdBasis: 'explicit non-personal identifier' },
    environment: input.environment,
    machineBand: { passed: summary.passed, blocked: summary.blocked, nativePendingCases: allCases.filter((item) => item.status === 'BLOCKED').map((item) => item.caseId) },
    cases: allCases.map((item) => ({
      caseId: item.caseId,
      title: item.title,
      category: item.category,
      status: item.status,
      detail: item.detail,
      evidence: item.evidence ?? null,
      notes: item.notes ?? null,
      durationMs: item.durationMs ?? 0,
      blockedReason: item.blockedReason ?? null,
    })),
    summary,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion,
    elapsedMs: Date.now() - startedAt,
  }
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, generatedAt: result.generatedAt, suite: { id: SUITE_ID, version: SUITE_VERSION }, cases: allCases.map((item) => ({ caseId: item.caseId, category: item.category, status: item.status, detail: item.detail })) }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const entries = [{ file: 'result.json', hash: sha256OfFile(resultFile) }]
  writeFileSync(sha256File, `${entries.map((entry) => `${entry.hash}  ${entry.file}`).join('\n')}\n`, 'utf8')
  const finalResult = { ...result, artifacts: { ...result.artifacts, sha256: Object.fromEntries(entries.map((entry) => [entry.file, entry.hash])) } }
  writeFileSync(resultFile, JSON.stringify(finalResult, null, 2), 'utf8')
  return { result: finalResult, conclusion, exitCode, outputDir, resultFile, sha256File, logFile }
}

function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function stdoutSummary(output: AcceptanceRunOutput): string {
  const summary = output.result.summary as { caseCount: number; passed: number; failed: number; blocked: number }
  return [
    `${SUITE_ID} acceptance: ${output.conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked)`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.exitCode}`,
  ].join('\n')
}

export async function main(): Promise<void> {
  try {
    const parsed = parsePlatformArguments(process.argv.slice(2))
    if (!parsed) { console.log(usage()); return }
    const root = process.env.VINKEY_TITLE_BAR_ACCEPTANCE_ROOT ?? process.cwd()
    const repository = collectRepository(root)
    const environment = collectEnvironment(root)
    const output = await runPMenuAcceptance({ options: parsed, repository, environment })
    for (const item of output.result.cases as CaseResult[]) console.error(`[${item.caseId}] ${item.status} ${item.title}`)
    if (parsed.json) console.log(JSON.stringify(output.result, null, 2))
    else console.log(stdoutSummary(output))
    process.exitCode = output.exitCode
  } catch (cause) {
    console.error(`标题栏菜单 P 验收失败：${messageOf(cause)}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_TITLE_BAR_P_ACCEPTANCE_CLI === '1') {
  main().catch((cause) => {
    console.error(`标题栏菜单 P 验收失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
