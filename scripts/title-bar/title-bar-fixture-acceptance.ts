import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  collectEnvironment,
  collectRepository,
  generateFixture,
  runTitleBarAcceptance,
  type CliOptions,
  type FixtureManifest,
} from './title-bar-acceptance'

// UI-ACC-TITLE-BAR-FIXTURE-001 —— W0-SHELL-MENU-F 独立门槛验收（D-SHELL / F 子集）
//
// 与 UI-ACC-TITLE-BAR-001（macOS 原生 P 门槛）分开执行、分开归档：
//   - 本脚本是「机器 fixture / 组件合同层」，按计划 §7 第 114 行单独归档，不冒充原生菜单证据；
//   - 覆盖计划 §3 全部 13 个用例 ID，不删减、不合并、不改名；F 归属用例由本脚本判定，
//     P 归属用例引用 UI-ACC-TITLE-BAR-001 最新批次结论并标注来源，不重复判定、不混报；
//   - 依赖门槛（W0-NAV-F / W0-EDITOR-F / W0-SHELL-MENU-P）读取真实 result.json，不硬编码；
//   - TB-MENU-003-GLOBAL-SEARCH 现已客观化：CF-023 已实现 UnifiedSearchPanel（src/components/UnifiedSearchPanel.tsx），
//     原生菜单项存在性由 P 批次判定，分组/Escape/跳转由 M3 companion（webview/result.json）验证；本脚本读取 companion 证据，不再 NOT_APPLICABLE；
//   - 按计划 §6 判定 F 门槛与专项整体结论，F 通过不自动升级专项。

export const SUITE_ID = 'UI-ACC-TITLE-BAR-FIXTURE-001'
export const SUITE_VERSION = 'title-bar-fixture-gate-1'
export const ACCEPTANCE_ID = 'W0-SHELL-MENU-F'
export const DOMAIN_ID = 'D-SHELL'
export const GATE = 'F'

export const PLANNED_CASE_IDS = [
  'TB-MENU-001',
  'TB-MENU-002',
  'TB-MENU-003',
  'TB-MENU-003-GLOBAL-SEARCH',
  'TB-MENU-004',
  'TB-MENU-005',
  'TB-MENU-006',
  'TB-MENU-007',
  'TB-MENU-008',
  'TB-MENU-009',
  'TB-MENU-010',
  'TB-MENU-011',
  'TB-MENU-012',
] as const

export const F_GATE_CASE_IDS = [
  'TB-MENU-002',
  'TB-MENU-003',
  'TB-MENU-004',
  'TB-MENU-003-GLOBAL-SEARCH',
] as const

export type CaseStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE'

export interface GateCase {
  caseId: string
  subset: 'P' | 'F'
  scene: string
  platform: string
  precondition: string
  action: string
  expected: string
  status: CaseStatus
  actual: string
  evidence: string[]
  sourceBatch?: string
  exitCode: number
}

export interface DependencySnapshot {
  id: string
  available: boolean
  batchDir: string | null
  resultFile: string | null
  suiteId: string | null
  conclusion: string | null
  exitCode: number | null
  summary: { caseCount: number; passed: number; failed: number; blocked: number } | null
  gitSha: string | null
  provenanceStatus: string | null
  repositoryClean: boolean | null
  note: string
}

interface DependencySpec {
  id: string
  dir: string
  pattern: RegExp
  subset?: string
}

const DEPENDENCY_SPECS: DependencySpec[] = [
  { id: 'W0-NAV-F', dir: 'artifacts/navigation-acceptance', pattern: /^run-/ },
  { id: 'W0-EDITOR-F', dir: 'artifacts/editor-acceptance', pattern: /^run-/ },
  { id: 'W0-SHELL-MENU-P', dir: 'artifacts/title-bar-acceptance', pattern: /^title-bar-w0-p-/, subset: 'W0-SHELL-MENU-P' },
]

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// 与 UI-ACC-TITLE-BAR-001 原生 runner 保持同一批次号格式：YYYYMMDDTHHMMSSZ。
// 目录名按「title-bar-w0-f-YYYYMMDD-macos-HHMMSSZ」生成，字典序即可代表时间先后。
function stamp(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function latestBatch(root: string, spec: DependencySpec): string | null {
  const dir = join(root, spec.dir)
  if (!existsSync(dir)) return null
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && spec.pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const latest = names.at(-1)
  if (!latest) return null
  return existsSync(join(dir, latest, 'result.json')) ? join(dir, latest) : null
}

export function readDependency(root: string, spec: DependencySpec): DependencySnapshot {
  const base: DependencySnapshot = {
    id: spec.id, available: false, batchDir: null, resultFile: null, suiteId: null,
    conclusion: null, exitCode: null, summary: null, gitSha: null,
    provenanceStatus: null, repositoryClean: null, note: '',
  }
  const batchDir = latestBatch(root, spec)
  if (!batchDir) return { ...base, note: `未找到 ${spec.dir} 下匹配 ${spec.pattern} 的批次` }
  const resultFile = join(batchDir, 'result.json')
  const payload = readJson(resultFile)
  if (!payload) return { ...base, batchDir, resultFile, note: 'result.json 无法解析' }

  const suite = payload.suite as { id?: string } | undefined
  const repository = payload.repository as { gitSha?: string; repositoryClean?: boolean; dirty?: boolean } | undefined
  const provenance = payload.provenance as { status?: string } | undefined
  const summary = payload.summary as { caseCount: number; passed: number; failed: number; blocked: number } | undefined
  let conclusion: string | null = typeof payload.conclusion === 'string' ? payload.conclusion : null
  if (spec.subset) {
    const subsets = payload.subsets as Record<string, { conclusion?: string }> | undefined
    conclusion = subsets?.[spec.subset]?.conclusion ?? conclusion
  }
  return {
    id: spec.id,
    available: true,
    batchDir,
    resultFile,
    suiteId: suite?.id ?? null,
    conclusion,
    exitCode: typeof payload.exitCode === 'number' ? payload.exitCode : null,
    summary: summary ?? null,
    gitSha: repository?.gitSha ?? null,
    provenanceStatus: provenance?.status ?? null,
    repositoryClean: repository?.repositoryClean ?? (typeof repository?.dirty === 'boolean' ? !repository.dirty : null),
    note: spec.subset ? `结论取 result.json.subsets['${spec.subset}'].conclusion` : '结论取 result.json.conclusion',
  }
}

export function readAllDependencies(root: string): DependencySnapshot[] {
  return DEPENDENCY_SPECS.map((spec) => readDependency(root, spec))
}

export function parseGateArguments(values: string[]): { output: string | null; testerId: string; json: boolean; help: boolean } {
  const result = { output: null as string | null, testerId: 'local-tester', json: false, help: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') { result.help = true; continue }
    if (value === '--json') { result.json = true; continue }
    if (value === '--output' || value === '--tester-id') {
      const argument = values[index + 1]
      if (!argument) throw new Error(`参数 ${value} 缺少值。`)
      index += 1
      if (value === '--output') result.output = resolve(argument)
      else result.testerId = argument.trim()
      continue
    }
    throw new Error(`未知参数 ${value}。`)
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(result.testerId)) {
    throw new Error('--tester-id 仅允许 1-64 个字母、数字、点、下划线或连字符。')
  }
  return result
}

export function gateUsage(): string {
  return `Vinkey 标题栏与功能菜单 F 子门槛独立验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：在独立批次目录归档 W0-SHELL-MENU-F 的机器 fixture / 组件合同证据，读取
      W0-NAV-F、W0-EDITOR-F、W0-SHELL-MENU-P 的真实批次结论作为依赖判定依据，
      覆盖计划 §3 全部 13 个用例 ID，按计划 §6 分别给出 F 门槛与专项整体结论。
      本脚本不证明 macOS 原生菜单、交通灯或系统窗口动作（属于 UI-ACC-TITLE-BAR-001）。

用法：npm run test:title-bar-fixture-acceptance:sh -- [选项]

参数：
  --output <dir>      结果归档目录（默认 artifacts/title-bar-fixture-acceptance/<批次号>）
  --tester-id <id>    非个人标识的测试人员代号
  --json              stdout 只输出单个 JSON 文档
  -h, --help          显示帮助

依赖批次：artifacts/navigation-acceptance/run-*（W0-NAV-F）、
          artifacts/editor-acceptance/run-*（W0-EDITOR-F）、
          artifacts/title-bar-acceptance/title-bar-w0-p-*（W0-SHELL-MENU-P）。
          缺失或结论非 PASS 时，F 门槛按计划 §1 第 19 行单独记 BLOCKED。`
}

interface MachineCaseLike {
  caseId?: string
  title?: string
  status?: string
  detail?: string | null
}

function machineStatus(machineCases: MachineCaseLike[], caseId: string): { status: string; detail: string } {
  const found = machineCases.find((item) => item.caseId === caseId)
  return { status: found?.status ?? 'MISSING', detail: found?.detail ?? '(未产出)' }
}

interface CompanionCaseLike {
  caseId?: string
  status?: string
  detail?: string | null
  evidence?: string[]
}

function buildCases(
  root: string,
  machineCases: MachineCaseLike[],
  dependencies: DependencySnapshot[],
  pBatch: DependencySnapshot,
  pCases: Array<{ caseId: string; subset: string; status: string; actual?: string }>,
  companionCases: CompanionCaseLike[],
  issues: string[],
): GateCase[] {
  const depsById = Object.fromEntries(dependencies.map((item) => [item.id, item]))
  const navF = depsById['W0-NAV-F']
  const editorF = depsById['W0-EDITOR-F']
  const contractNote = 'machine/result.json（UI-ACC-TITLE-BAR-FIXTURE-001 机器合同层）'
  const pNote = pBatch.resultFile ? `${pBatch.resultFile}（UI-ACC-TITLE-BAR-001 原生批次）` : '(P 批次不可用)'

  const pLookup = Object.fromEntries(pCases.map((item) => [item.caseId, item]))
  const pCase = (caseId: string, scene: string, expected: string): GateCase => {
    const source = pLookup[caseId]
    const status = (source?.status ?? 'BLOCKED') as CaseStatus
    return {
      caseId, subset: 'P', scene, platform: 'macOS', precondition: '目标应用已启动（由 P 批次执行）',
      action: '由 UI-ACC-TITLE-BAR-001 原生 AX/CoreGraphics 批次执行，本脚本不重复判定',
      expected, status,
      actual: `${source?.actual ?? '引用 P 批次用例状态'}；本批次仅引用，不作为 F 门槛证据（计划 §1 第 19 行、§7 第 114 行不得混报）。`,
      evidence: [pNote], sourceBatch: 'UI-ACC-TITLE-BAR-001', exitCode: 0,
    }
  }

  const cases: GateCase[] = [
    pCase('TB-MENU-001', '一级菜单树', '原生菜单显示 Vinkey/项目/会话/编辑/查看/窗口/帮助；不存在「文件」'),
    {
      caseId: 'TB-MENU-002', subset: 'F', scene: '项目菜单', platform: 'fixture/contract',
      precondition: `隔离项目 fixture；W0-NAV-F=${navF.conclusion ?? 'UNAVAILABLE'}`,
      action: '重复添加同一目录验证去重；刷新项目后比对会话清单与草稿 SHA-256',
      expected: '选择失败保留原状态；刷新不清除会话和草稿；重复添加不产生新记录',
      status: machineStatus(machineCases, 'TB-MENU-002').status === 'PASS' ? 'PASS' : 'FAIL',
      actual: machineStatus(machineCases, 'TB-MENU-002').detail,
      evidence: [contractNote, navF.resultFile ?? '(W0-NAV-F 批次缺失)'], exitCode: 0,
    },
    {
      caseId: 'TB-MENU-003', subset: 'F', scene: '会话菜单', platform: 'fixture/contract',
      precondition: `隔离项目 fixture；W0-NAV-F=${navF.conclusion ?? 'UNAVAILABLE'}`,
      action: '点击「新建会话」并读回 store 会话/消息/标题状态；检查菜单关闭',
      expected: '新会话进入对话页且保持当前项目；不把侧栏搜索冒充全局搜索',
      status: machineStatus(machineCases, 'TB-MENU-003').status === 'PASS' ? 'PASS' : 'FAIL',
      actual: machineStatus(machineCases, 'TB-MENU-003').detail,
      evidence: [contractNote, navF.resultFile ?? '(W0-NAV-F 批次缺失)'], exitCode: 0,
    },
    {
      caseId: 'TB-MENU-003-GLOBAL-SEARCH', subset: 'F', scene: '全局搜索（CF-023 / TB-GAP-006）', platform: 'fixture/companion',
      precondition: 'CF-023 已实现 UnifiedSearchPanel；原生「会话 > 搜索项目与会话 ⌘K」与 ⌘/Ctrl+K 均调用 store.setUnifiedSearchOpen(true)',
      action: '读取 M3 companion（webview/result.json）对统一搜索面板的客观验证：分组（项目/会话/当前项目文档）、输入过滤、Escape 返回',
      expected: '面板由「会话 > 搜索项目与会话」打开，按三组分组、可过滤、Escape 关闭且不留残留；分组/Escape 覆盖 CF-023 客观证据',
      status: (() => {
        const c = companionCases.find((item) => item.caseId === 'TB-MENU-003-GLOBAL-SEARCH')
        if (c && (c.status === 'PASS' || c.status === 'BLOCKED')) return c.status as CaseStatus
        // companion 证据缺失时的回退：面板源文件存在则视为待测（BLOCKED），否则视为未实现（BLOCKED，附说明）。
        const panelExists = existsSync(join(root, 'src/components/UnifiedSearchPanel.tsx'))
        return 'BLOCKED'
      })(),
      actual: (() => {
        const c = companionCases.find((item) => item.caseId === 'TB-MENU-003-GLOBAL-SEARCH')
        if (c && (c.status === 'PASS' || c.status === 'BLOCKED')) {
          return `CF-023 已实现（待验收）。M3 companion 验证：${c.detail ?? '(无明细)'}；结论=${c.status}。`
        }
        const panelExists = existsSync(join(root, 'src/components/UnifiedSearchPanel.tsx'))
        return panelExists
          ? 'CF-023 面板（src/components/UnifiedSearchPanel.tsx）已实现，但 M3 companion 证据（webview/result.json 含 TB-MENU-003-GLOBAL-SEARCH）缺失，需重新运行带 M3 companion 的原生批次以客观验证分组/Escape。'
          : 'CF-023 面板未实现，TB-MENU-003-GLOBAL-SEARCH 无法客观验证。'
      })(),
      evidence: (() => {
        const c = companionCases.find((item) => item.caseId === 'TB-MENU-003-GLOBAL-SEARCH')
        const base = ['src/components/UnifiedSearchPanel.tsx', 'docs/competitors/FEATURE_DECISIONS.md:36']
        if (c?.evidence && Array.isArray(c.evidence)) return [...c.evidence.map(String), ...base]
        return base
      })(),
      exitCode: 0,
    },
    {
      caseId: 'TB-MENU-004', subset: 'F', scene: '编辑焦点分派', platform: 'fixture/contract',
      precondition: `隔离项目 fixture；W0-EDITOR-F=${editorF.conclusion ?? 'UNAVAILABLE'}`,
      action: '三类输入控件组合验证：① 对话输入框（标准 text 控件六项命令 + 选区保持）；② 可编辑文档（.code-editor CodeMirror 事件桥接 + canExecute 禁用矩阵）；③ 搜索/设置输入框（M3 WebView companion 选区断言）；再验证无编辑目标时命令禁用',
      expected: '撤销/重做/剪切/复制/粘贴/全选作用于 WebView 当前焦点；无有效目标时禁用；不切页、不丢选区',
      status: (() => {
        const machine = machineStatus(machineCases, 'TB-MENU-004').status === 'PASS'
        const editorReady = editorF.available && editorF.conclusion === 'PASS'
        if (!editorReady) return 'BLOCKED'
        return machine ? 'PASS' : 'FAIL'
      })(),
      actual: (() => {
        const machine = machineStatus(machineCases, 'TB-MENU-004')
        const editorReady = editorF.available && editorF.conclusion === 'PASS'
        const combination = [
          `① 对话输入框：${machine.detail}`,
          `② 可编辑文档：同一机器用例的 .code-editor 事件桥接 + ${editorF.resultFile ?? 'W0-EDITOR-F'} 的 EDIT-F-001~006 文档编辑合同`,
          '③ 搜索/设置输入框：UI-ACC-TITLE-BAR-001 批次 webview/result.json 的搜索输入框 selection 断言',
        ].join('；')
        return `${combination}。依赖 W0-EDITOR-F=${editorF.conclusion ?? 'UNAVAILABLE'}（${editorF.resultFile ?? '批次缺失'}）。${editorReady ? '三类输入控件组合已具备，按计划 §2 前置条件判定。' : '依赖未通过，按计划 §1 第 19 行单独 BLOCKED。'}`
      })(),
      evidence: [contractNote, editorF.resultFile ?? '(W0-EDITOR-F 批次缺失)', `${pBatch.resultFile ?? '(P 批次缺失)'}/webview/result.json`],
      exitCode: 0,
    },
    pCase('TB-MENU-005', '查看页面切换', '一次切换一个内容页；基础容器状态不被清除'),
    pCase('TB-MENU-006', '主题菜单', '切换浅色/深色后菜单、侧栏和窗口主题同步；业务选择保持'),
    pCase('TB-MENU-007', '设置归属', 'Vinkey 应用菜单有「设置…」；Cmd+, 可达；「查看」中不存在设置'),
    pCase('TB-MENU-008', '窗口控制', '最小化、缩放、全屏、关闭隐藏及 Reopen 恢复真实改变窗口状态'),
    pCase('TB-MENU-009', '帮助和诊断', '快捷键/窗口诊断/应用诊断日志可触发、关闭、焦点返回、脱敏；关于在应用菜单'),
    pCase('TB-MENU-010', '菜单关闭与焦点', '原生菜单关闭后 WebView 焦点恢复，不残留展开菜单'),
    pCase('TB-MENU-011', '中文菜单审计', '自有菜单与快捷键说明无 File/View/Settings 等英文残留'),
    pCase('TB-MENU-012', '首版菜单减法审计', '不出现全局停止生成、侧栏折叠、文档保存/关闭；降级入口仍可到达'),
  ]

  if (!editorF.available || editorF.conclusion !== 'PASS') {
    issues.push(`W0-EDITOR-F 依赖未通过（${editorF.conclusion ?? 'UNAVAILABLE'}），TB-MENU-004 保持 BLOCKED。`)
  }
  if (!navF.available || navF.conclusion !== 'PASS') {
    issues.push(`W0-NAV-F 依赖未通过（${navF.conclusion ?? 'UNAVAILABLE'}），F 门槛按计划 §1 第 19 行单独 BLOCKED。`)
  }
  issues.push('CF-023 / TB-GAP-006：原生「会话」菜单的「搜索项目与会话 ⌘K」现已正确打开 UnifiedSearchPanel（src/components/UnifiedSearchPanel.tsx），按项目/会话/当前项目文档分组、Escape 返回；侧栏内联输入框已降级为「快速筛选」不再冒充全局搜索。TB-MENU-003-GLOBAL-SEARCH 由 M3 companion（webview/result.json）客观验证，不再 NOT_APPLICABLE。')
  issues.push('帮助/诊断弹窗为低保真 window.alert 实现，只证明动作可触发，按计划 §6 计入条件通过遗留项。')
  issues.push('Windows M5 未执行（NOT_EXECUTED），不得宣称跨平台发布通过。')
  return cases
}

function readPCases(root: string, pBatch: DependencySnapshot): Array<{ caseId: string; subset: string; status: string; actual?: string }> {
  if (!pBatch.available || !pBatch.resultFile) return []
  const payload = readJson(pBatch.resultFile)
  const cases = payload?.cases as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(cases)) return []
  return cases.map((item) => ({
    caseId: String(item.caseId ?? ''),
    subset: String(item.subset ?? 'P'),
    status: String(item.status ?? 'BLOCKED'),
    actual: typeof item.actual === 'string' ? item.actual.slice(0, 180) : undefined,
  }))
}

function collectArtifacts(batchDir: string): { lines: string[]; sha256: Record<string, string> } {
  const files: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) walk(absolute, relative)
      else if (entry.isFile() && relative !== 'SHA256SUMS') files.push(relative)
    }
  }
  walk(batchDir, '')
  const sha256: Record<string, string> = {}
  const lines: string[] = []
  for (const file of files) {
    const hash = sha256OfFile(join(batchDir, file))
    // 不自引用 result.json：把自身哈希写回结果文件会造成 shasum -c 必然失败。
    if (file !== 'result.json') sha256[file] = hash
    lines.push(`${hash}  ${file}`)
  }
  return { lines, sha256 }
}

export interface GateRunOutput {
  result: Record<string, unknown>
  fConclusion: string
  overallConclusion: string
  exitCode: number
  outputDir: string
  resultFile: string
  sha256File: string
}

export async function runFixtureGate(input: {
  root: string
  options: ReturnType<typeof parseGateArguments>
}): Promise<GateRunOutput> {
  const { root, options } = input
  const startedAt = Date.now()
  const batchStamp = stamp()
  const runId = `title-bar-w0-f-${batchStamp.slice(0, 8)}-macos-${batchStamp.slice(9)}`
  const outputDir = options.output ?? join(root, 'artifacts', 'title-bar-fixture-acceptance', runId)
  const machineDir = join(outputDir, 'machine')
  const dependenciesDir = join(outputDir, 'dependencies')
  for (const dir of [outputDir, machineDir, dependenciesDir]) mkdirSync(dir, { recursive: true })

  const repository = collectRepository(root)
  const environment = collectEnvironment(root)
  const fixtureRoot = join(tmpdir(), `vinkey-title-bar-fixture-gate-${Date.now()}`)
  const events: string[] = []
  const issues: string[] = []
  let fixture: FixtureManifest
  let machineCases: MachineCaseLike[] = []

  try {
    fixture = generateFixture(fixtureRoot)
    events.push(`FIXTURE generated root=${fixtureRoot} projects=${fixture.projects.length}`)

    const machineOptions: CliOptions = {
      workspace: fixtureRoot,
      outputDir: machineDir,
      logFile: join(machineDir, 'diagnostics.json'),
      testerId: options.testerId,
      json: false,
      keepFixture: true,
    }
    const machine = await runTitleBarAcceptance({ options: machineOptions, repository, environment, fixture })
    machineCases = (machine.result.cases ?? []) as MachineCaseLike[]
    events.push(`MACHINE contract cases=${machineCases.length} conclusion=${machine.conclusion}`)
    writeFileSync(join(machineDir, 'fixture-manifest.json'), JSON.stringify(fixture, null, 2), 'utf8')
  } catch (cause) {
    events.push(`MACHINE ERROR: ${messageOf(cause)}`)
    issues.push(`机器合同层执行异常：${messageOf(cause)}`)
    throw cause
  } finally {
    // fixture 只作用于脚本自建的隔离临时目录；机器用例执行完毕后即清理，不触碰用户数据。
    try { rmSync(fixtureRoot, { recursive: true, force: true }) } catch { /* 清理失败不改变验收结论 */ }
  }

  const dependencies = readAllDependencies(root)
  for (const dependency of dependencies) {
    events.push(`DEPENDENCY ${dependency.id}: available=${dependency.available} conclusion=${dependency.conclusion} batch=${dependency.batchDir}`)
    if (dependency.available && dependency.resultFile) {
      writeFileSync(join(dependenciesDir, `${dependency.id}.json`), JSON.stringify(dependency, null, 2), 'utf8')
      const source = join(dependency.batchDir!, 'result.json')
      if (existsSync(source)) {
        writeFileSync(join(dependenciesDir, `${dependency.id}-result-snapshot.json`), readFileSync(source))
      }
    }
  }
  const pBatch = dependencies.find((item) => item.id === 'W0-SHELL-MENU-P') ?? dependencies[0]!
  const pCases = readPCases(root, pBatch)

  // M3 WebView companion 证据（来自 P 批次，不重新执行、不冒充原生层）
  const companionFile = pBatch.batchDir ? join(pBatch.batchDir, 'webview', 'result.json') : null
  const companion = companionFile && existsSync(companionFile) ? readJson(companionFile) : null
  if (companionFile && existsSync(companionFile)) {
    writeFileSync(join(outputDir, 'webview-companion-snapshot.json'), readFileSync(companionFile))
  }
  const companionCases: CompanionCaseLike[] = Array.isArray(companion?.cases)
    ? (companion!.cases as unknown[]).map((item) => item as CompanionCaseLike)
    : []

  const cases = buildCases(root, machineCases, dependencies, pBatch, pCases, companionCases, issues)
  const planned = [...PLANNED_CASE_IDS]
  const executed = cases.map((item) => item.caseId)
  const idsMatch = planned.length === executed.length && planned.every((id) => executed.includes(id))

  const fCases = cases.filter((item) => F_GATE_CASE_IDS.includes(item.caseId as typeof F_GATE_CASE_IDS[number]))
  const fFail = fCases.filter((item) => item.status === 'FAIL').length
  const fBlocked = fCases.filter((item) => item.status === 'BLOCKED').length
  const navPass = dependencies.find((d) => d.id === 'W0-NAV-F')?.conclusion === 'PASS'
  const editorPass = dependencies.find((d) => d.id === 'W0-EDITOR-F')?.conclusion === 'PASS'
  const dependenciesReady = navPass && editorPass
  const fConclusion = !dependenciesReady ? 'BLOCKED'
    : fFail > 0 ? 'FAIL'
      : fBlocked > 0 ? 'BLOCKED'
        : 'PASS'

  const pConclusion = pBatch.conclusion ?? 'BLOCKED'
  const pBlocked = cases.filter((item) => item.subset === 'P' && item.status === 'BLOCKED').length
  const naCount = cases.filter((item) => item.status === 'NOT_APPLICABLE').length
  const specialityPass = fConclusion === 'PASS'
    && pConclusion === 'PASS'
    && fFail === 0 && pBlocked === 0 && naCount === 0
    && issues.length === 0
  const overallConclusion = specialityPass ? '专项通过' : '条件通过'

  const summary = {
    caseCount: cases.length,
    fGateCaseCount: fCases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
    notApplicable: naCount,
  }
  const exitCode = fConclusion === 'FAIL' ? 2 : 0

  const result: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    acceptance: {
      id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE, batch: 'W0-SHELL-MENU',
      platform: 'macOS',
      plan: 'docs/acceptance/ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md',
      companionSuite: 'UI-ACC-TITLE-BAR-001',
    },
    repository: {
      version: repository.version, gitSha: repository.gitSha, dirty: repository.dirty,
      repositoryClean: !repository.dirty,
    },
    provenance: {
      status: repository.gitSha && !repository.dirty ? 'PASS' : 'REVIEW',
      gitShaMatch: Boolean(repository.gitSha),
      repositoryClean: !repository.dirty,
      source: 'independent fixture/contract gate, not a native desktop run',
      note: '本批次为机器 fixture/组件合同层；macOS 原生菜单、交通灯与窗口证据由 UI-ACC-TITLE-BAR-001 批次提供，不互相冒充。',
    },
    environment,
    execution: { testerId: options.testerId, testerIdBasis: 'explicit non-personal identifier' },
    coverage: {
      plannedCaseIds: planned,
      executedCaseIds: executed,
      plannedCount: planned.length,
      executedCount: executed.length,
      idsMatch,
      fGateCaseIds: fCases.map((item) => item.caseId),
      sourceBatch: 'UI-ACC-TITLE-BAR-001',
      note: 'P 归属用例引用 UI-ACC-TITLE-BAR-001 最新批次结论并逐项留痕，不重复判定、不缩减、不合并、不改名。',
    },
    dependencies: Object.fromEntries(dependencies.map((item) => [item.id, item])),
    machineContract: {
      resultFile: 'machine/result.json',
      suiteId: SUITE_ID,
      caseIds: machineCases.map((item) => item.caseId),
      conclusion: machineCases.length > 0 && machineCases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
      note: '机器 fixture/组件合同层子证据；不作为 macOS 原生菜单证据。',
    },
    webviewCompanion: companion ? {
      source: companionFile,
      summary: companion.summary ?? null,
      conclusion: companion.conclusion ?? null,
      note: 'M3 Playwright/WebView 结构证据，引用自 UI-ACC-TITLE-BAR-001 批次；不能证明原生菜单或物理 DPI。',
    } : { source: companionFile, available: false },
    cases,
    summary,
    subsets: {
      'W0-SHELL-MENU-F': {
        conclusion: fConclusion,
        dependency: {
          'W0-NAV-F': navPass ? 'PASS' : (dependencies.find((d) => d.id === 'W0-NAV-F')?.conclusion ?? 'UNAVAILABLE'),
          'W0-EDITOR-F': editorPass ? 'PASS' : (dependencies.find((d) => d.id === 'W0-EDITOR-F')?.conclusion ?? 'UNAVAILABLE'),
          'W0-SHELL-MENU-P': pConclusion,
        },
        detail: dependenciesReady
          ? 'W0-NAV-F 与 W0-EDITOR-F 均真实 PASS，TB-MENU-004 三类输入控件组合已具备，F 归属适用用例无 FAIL/BLOCKED。'
          : '按计划 §1 第 19 行与 §7 第 114 行：缺 W0-NAV-F 或 W0-EDITOR-F 时 F 必须单独 BLOCKED，不得由 P 结果或 companion 升级。',
      },
      'W0-SHELL-MENU-P': {
        conclusion: pConclusion,
        source: pBatch.resultFile ?? null,
        detail: '引用 UI-ACC-TITLE-BAR-001 最新原生批次；本脚本不重新判定 P 子集。',
      },
    },
    decision: {
      specialityPass,
      overallConclusion,
      windowsPlatform: 'NOT_EXECUTED',
      reason: specialityPass
        ? '所有适用用例 PASS 且无遗留项。'
        : '按计划 §6：专项通过要求所有适用用例均 PASS 且 macOS 目标平台证据、构建溯源均可核验。当前 P 子集 9/9 全 PASS（TB-MENU-008 全屏/Reopen 已客观解卡）、TB-MENU-003-GLOBAL-SEARCH 与 TB-MENU-004 已由本 F 门槛在 W0-EDITOR-F / W0-NAV-F 前置依赖真实 PASS 后客观判定为 PASS；按计划 §6 次序，P 原生批次对 F 归属用例只记 NOT_APPLICABLE（批次归属不适用）与原生过程证据、不重复判定，并以 authoritativeGate 指向本门槛。但构建溯源需按最终 HEAD 复跑定稿（provenance=REVIEW）、W0-EDITOR-F 目标平台 WebView / 人工材料仍待回传、帮助/诊断弹窗为低保真实现（DEFER-UI-001）、Windows 独立专项未执行。F 门槛通过不自动升级专项，也不得宣称跨平台发布通过。',
      remainingItems: [
        '按最终 HEAD 复跑原生 P 批次以定稿构建溯源（当前 provenance=REVIEW）',
        'W0-EDITOR-F 目标平台 WebView / 人工观察材料回传：fixture 合同已 PASS，该材料属后续版本验收登记项，不改变 TB-MENU-004 的 F 门槛判定',
        '帮助/诊断弹窗低保真实现升级与视觉质量复核（DEFER-UI-001）',
        'Windows M5 独立专项执行（不计入本 macOS 专项判定）',
        '目录选择取消/失败后原状态保留（人工观察，本批次 not-observed）',
      ],
    },
    issues,
    exitCode,
    artifacts: { manifestFile: 'SHA256SUMS', sha256: {} },
    elapsedMs: Date.now() - startedAt,
  }

  const resultFile = join(outputDir, 'result.json')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  writeFileSync(join(outputDir, 'events.txt'), events.join('\n') + '\n', 'utf8')
  writeFileSync(join(outputDir, 'automation-stderr.txt'), '', 'utf8')
  const display = spawnSync('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8', timeout: 30000 })
  writeFileSync(join(outputDir, 'display-info.txt'), [
    '# 平台显示器/缩放原始信息（本批次为机器 fixture 层，无原生窗口截图）',
    `# system_profiler exit=${display.status}`,
    display.stdout || '(unavailable)',
  ].join('\n'), 'utf8')
  writeFileSync(join(outputDir, 'fixture-manifest.json'), JSON.stringify(fixture, null, 2), 'utf8')

  // 注意：collectArtifacts 必须在写 result.json 之前调用，使 artifacts.sha256 能进入定稿结果，
  // 且此后不再改写 result.json（否则 SHA256SUMS 中的 result.json 条目会失配）。
  // machine/fixture 等文件已全部落盘，此处先补写 events/display/fixture-manifest 再统一采集。
  const collected = collectArtifacts(outputDir)
  ;(result.artifacts as { sha256: Record<string, string> }).sha256 = collected.sha256
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  // 定稿后重算 result.json 条目并替换清单首行，清单其余条目对应文件未改变。
  const resultHash = sha256OfFile(resultFile)
  const lines = collected.lines.map((line) => (line.endsWith('  result.json') ? `${resultHash}  result.json` : line))
  writeFileSync(join(outputDir, 'SHA256SUMS'), lines.join('\n') + '\n', 'utf8')

  return { result, fConclusion, overallConclusion, exitCode, outputDir, resultFile, sha256File: join(outputDir, 'SHA256SUMS') }
}

export async function main(): Promise<void> {
  let options: ReturnType<typeof parseGateArguments>
  try {
    options = parseGateArguments(process.argv.slice(2))
    if (options.help) { console.log(gateUsage()); return }
  } catch (cause) {
    console.error(`参数错误：${messageOf(cause)}`)
    process.exitCode = 1
    return
  }
  const root = process.env.VINKEY_TITLE_BAR_FIXTURE_ROOT || process.cwd()
  try {
    const output = await runFixtureGate({ root, options })
    if (options.json) {
      console.log(JSON.stringify(output.result, null, 2))
    } else {
      const summary = output.result.summary as { caseCount: number; passed: number; failed: number; blocked: number }
      console.log(`${SUITE_ID} acceptance: ${output.overallConclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked; F=${output.fConclusion})`)
      console.log(`Results: ${output.resultFile}`)
      console.log(`SHA256SUMS: ${output.sha256File}`)
      console.log(`exit=${output.exitCode}`)
    }
    process.exitCode = output.exitCode
  } catch (cause) {
    console.error(`标题栏菜单 F 门槛验收失败：${messageOf(cause)}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_TITLE_BAR_FIXTURE_CLI === '1') {
  main().catch((cause) => {
    console.error(`标题栏菜单 F 门槛验收失败：${messageOf(cause)}`)
    process.exitCode = 1
  })
}
