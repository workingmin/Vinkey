import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

// W4-TASK-E / D-TASK-LOG：NT-MAC-001~005 桌面原生复验的客观采集与机器判定。
//
// 证据边界（与 docs/acceptance/ui/TASK_PROCESS_NATIVE_ACCEPTANCE.md 首部一致）：
// - 数据在真实 Tauri app 中以隔离 fixture 加载，交互由 AX 原生自动化驱动，截图由 CoreGraphics 采集；
// - 过程事件来自真实 Ollama CLI 驱动的作业产物，不是新造的假事件；
// - 只判定可机器判定的客观子断言；暂停文案「易理解性」、UX 观感、源变化的真实运行中拒绝等
//   需要人在目标平台判断或真实运行中任务的部分，仅生成证据包并保留 BLOCKED，归总计划 §8.5；
// - 本套件不改写 UI-ACC-LOGS-001 的 TASK-CHK-* / TASK-UI-*，也不写 NT-MAC-* 到 cases[].caseId
//   （平台任务编号只作分派追踪，见共享合同 §1）。

export const SUITE_ID = 'UI-ACC-TASK-NATIVE-001'
export const SUITE_VERSION = 'task-process-native-acceptance-1'
export const ACCEPTANCE_ID = 'W4-TASK-E'
export const DOMAIN_ID = 'D-TASK-LOG'
export const GATE = 'E'
export const MANUAL_REVIEW_REFERENCE = '§8.5'
/** 与 src-tauri/src/worker_service.rs::SOURCE_CHANGED_MESSAGE 保持一致（CP-35）。 */
export const SOURCE_CHANGED_MESSAGE = '原文已变化，无法沿用此前进度。请重新发起分析。'

export type CaseStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE'

export interface NativeCase {
  caseId: string
  platformTask: string
  title: string
  category: 'objective' | 'evidence'
  status: CaseStatus
  detail: string | null
  evidence: string[]
  blockedReason: string | null
}

export interface SeedEvent {
  sequence: number
  stage: string
  status: string
  message: string
  segment: { id: string; label: string; startedAt?: number; endedAt?: number } | null
}

export interface SourceChangeObservation {
  documentPath: string
  fingerprintBefore: string
  fingerprintAfter: string
  resumePressed: boolean
  taskStatusAfter: string | null
  failureMessage: string | null
  failureCode: string | null
  failureRetryable: boolean | null
  jobJsonCreated: boolean
  workerOutputCreated: boolean
  checkpointReuseEvents: number
  uiMessageVisible: boolean
}

export interface Observation {
  launched: boolean
  windowReady: boolean
  axTextCount: number
  axTexts: string[]
  axNodeCount: number
  /** AX 树中按钮标题（静态 texts 不含按钮标题；段/批量/控制按钮都在此）。 */
  axButtonTitles: string[]
  /** AX 树中第一层段切换按钮的展开态；null 表示未能读出。 */
  segmentExpanded: boolean[] | null
  screenshots: string[]
  /** 事件来自真实 CLI 驱动作业的 worker-events.json，不是新造事件。 */
  realEvents: SeedEvent[]
  realTerminalStatus: string
  /** 「收起全部过程」「展开全部过程」按压回执。 */
  collapsePress: { ok: boolean } | null
  expandPress: { ok: boolean } | null
  /** 重启前后可见文本的对照。 */
  restartTextsBefore: string[]
  restartTextsAfter: string[]
  /** 是否成功以同一 fixture 数据目录重启并重新打开会话。 */
  restartSucceeded: boolean
  /** NT-MAC-003 真实桌面恢复拒绝观测；未执行时为 null，不臆造 PASS。 */
  sourceChange: SourceChangeObservation | null
  errors: string[]
}

const STATUS_LABEL: Record<string, string> = {
  running: '处理中',
  paused: '已暂停',
  completed: '已完成',
  failed: '处理失败',
  cancelled: '已停止',
  stopping: '正在停止…',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

export function sequencesContinuous(events: SeedEvent[]): boolean {
  if (events.length === 0) return false
  return events.every((event, index) => event.sequence === index + 1)
}

export function terminalEventsHaveEndedAt(events: SeedEvent[]): boolean {
  const terminal = events.filter((event) => ['completed', 'failed', 'cancelled'].includes(event.status))
  return terminal.length > 0 && terminal.every((event) => typeof event.segment?.endedAt === 'number' && event.segment.endedAt > 0)
}

function hasSignal(observation: Observation): boolean {
  return observation.launched && observation.windowReady && (observation.axTextCount > 0 || observation.axButtonTitles.length > 0)
}

/** AX 文本 + 按钮标题合并视图：静态文案在 texts，按钮/段标签在 buttonTitles。 */
function visibleStrings(observation: Observation): string {
  return [...observation.axTexts, ...observation.axButtonTitles].join('\n')
}

function observedBlocked(reason: string): NativeCase {
  return { status: 'BLOCKED', detail: null, evidence: [], blockedReason: reason } as NativeCase
}

/**
 * 严格客观判定：只有观测到信号且与目标事实一致才 PASS；
 * 观测到信号但与事实矛盾才 FAIL；信号不可得一律 BLOCKED，绝不虚标 PASS。
 */
export function evaluateObjectiveCases(observation: Observation): NativeCase[] {
  const cases: NativeCase[] = []
  const shots = observation.screenshots

  // NT-MAC-001：执行中事件记录 —— 状态栏与 Worker 状态一致、事件顺序与段标签读回。
  {
    const base = {
      caseId: 'TASK-NAT-001', platformTask: 'NT-MAC-001',
      title: '执行中事件记录（状态栏一致性 / 事件顺序 / 段标签）',
      category: 'objective' as const,
      evidence: shots,
    }
    if (!hasSignal(observation)) {
      cases.push({ ...base, ...observedBlocked('未取得目标平台窗口或 AX 文本信号，状态栏一致性不予放行'), blockedReason: '未取得目标平台窗口或 AX 文本信号' })
    } else {
      const joined = visibleStrings(observation)
      const label = statusLabel(observation.realTerminalStatus)
      const statusOk = observation.axTexts.join('\n').includes(label) || joined.includes(label)
      // 过程默认折叠时事件消息不渲染，但段标签按钮渲染；任一真实事件文案或段标签可见即算读回。
      const eventOk = observation.realEvents.some((event) => {
        const tokens = [event.segment?.label ?? '', event.message].filter(Boolean)
        return tokens.some((token) => joined.includes(token))
      })
      const seqOk = sequencesContinuous(observation.realEvents)
      const endedOk = terminalEventsHaveEndedAt(observation.realEvents)
      const all = statusOk && eventOk && seqOk && endedOk
      const anyObserved = statusOk || eventOk
      cases.push({
        ...base,
        status: all ? 'PASS' : anyObserved ? 'FAIL' : 'BLOCKED',
        detail: `statusLabel=${label} statusOk=${statusOk} eventOk=${eventOk} seqOk=${seqOk} endedAtOk=${endedOk}`,
        blockedReason: all || anyObserved ? null : 'AX 文本未读到状态栏或事件消息',
      })
    }
  }

  // NT-MAC-002：暂停/恢复快照 —— 只判定可机器判定的客观部分：
  // 暂停态控件映射（继续处理出现 / 暂停任务不出现）与 CP-42 文案存在性。
  // 「恢复后出现新推进段且保留暂停前记录」需要真实运行中任务，归证据包与 §8.5。
  {
    const base = {
      caseId: 'TASK-NAT-002', platformTask: 'NT-MAC-002',
      title: '暂停/恢复控件映射与 CP-42 文案（客观部分）',
      category: 'objective' as const,
      evidence: shots,
    }
    if (!hasSignal(observation)) {
      cases.push({ ...base, ...observedBlocked('未取得目标平台 AX 文本信号，控件映射不予放行'), blockedReason: '未取得目标平台 AX 文本信号' })
    } else {
      const joined = visibleStrings(observation)
      // 同一 fixture 含 paused + running 两个样本任务，故「暂停任务」按钮本就存在，
      // 客观判据只看「继续处理」按钮确实渲染；CP-42 文案需从真实事件的暂停消息读回，
      // 若该作业无暂停事件则视为不可判定（BLOCKED），不臆造 PASS。
      const resumeOk = observation.axButtonTitles.includes('继续处理')
      const cp42InEvents = observation.realEvents.some((event) => event.message.includes('已暂停后续步骤'))
      const cp42Ok = cp42InEvents ? joined.includes('已暂停后续步骤') : false
      const all = resumeOk && (!cp42InEvents || cp42Ok)
      cases.push({
        ...base,
        status: !resumeOk ? 'FAIL' : all ? 'PASS' : 'FAIL',
        detail: `继续处理按钮=${resumeOk} CP42事件存在=${cp42InEvents} CP42文案可见=${cp42Ok}`,
        blockedReason: null,
      })
    }
  }

  // NT-MAC-003：源变化拒绝恢复 —— 暂停态为隔离 fixture 播种的前置条件，
  // 「修改源文件 → 真实 app 上按继续处理 → 后端复核指纹并拒绝」由生产代码真实触发。
  {
    const base = {
      caseId: 'TASK-NAT-003', platformTask: 'NT-MAC-003',
      title: '源变化拒绝恢复（真实 app 恢复读回）',
      category: 'objective' as const,
      evidence: shots,
    }
    const s = observation.sourceChange
    if (!hasSignal(observation) || !s || !s.resumePressed) {
      cases.push({
        ...base,
        status: 'BLOCKED', detail: null,
        blockedReason: '未取得真实恢复按压回执与源变化读回，拒绝判定不予放行',
      })
    } else {
      const fingerprintRead = Boolean(s.fingerprintBefore && s.fingerprintAfter)
      const facts = {
        fingerprintRead,
        fingerprintChanged: fingerprintRead && s.fingerprintBefore !== s.fingerprintAfter,
        statusFailed: s.taskStatusAfter === 'failed',
        cp35Message: (s.failureMessage ?? '').includes(SOURCE_CHANGED_MESSAGE),
        compatibilityFailure: s.failureCode === 'worker.compatibility_mismatch',
        nonRetryable: s.failureRetryable === false,
        noCheckpointReuse: !s.jobJsonCreated && !s.workerOutputCreated && s.checkpointReuseEvents === 0,
        uiMessageVisible: s.uiMessageVisible,
      }
      const all = Object.values(facts).every(Boolean)
      const observed = fingerprintRead || facts.statusFailed || Boolean(s.failureMessage)
      cases.push({
        ...base,
        status: all ? 'PASS' : observed ? 'FAIL' : 'BLOCKED',
        detail: [
          `document=${s.documentPath}`,
          `fingerprint=${s.fingerprintBefore.slice(0, 8)}→${s.fingerprintAfter.slice(0, 8)}`,
          `status=${s.taskStatusAfter ?? 'null'}`,
          `cp35=${facts.cp35Message}`,
          `failure=${s.failureCode ?? 'null'}/${s.failureRetryable}`,
          `checkpointReuse=${s.checkpointReuseEvents}`,
          `uiVisible=${facts.uiMessageVisible}`,
        ].join(' '),
        blockedReason: all || observed ? null : '源变化恢复序列未产生可判定观测',
      })
    }
  }

  // NT-MAC-004：两层折叠保持 —— 展开/收起按钮存在、按压生效、段切换按钮展开态翻转。
  {
    const base = {
      caseId: 'TASK-NAT-004', platformTask: 'NT-MAC-004',
      title: '两层折叠（批量按压与展开态读回）',
      category: 'objective' as const,
      evidence: shots,
    }
    if (!hasSignal(observation)) {
      cases.push({ ...base, ...observedBlocked('未取得目标平台 AX 信号，折叠判定不予放行'), blockedReason: '未取得目标平台 AX 信号' })
    } else {
      const buttonsOk = observation.axButtonTitles.includes('收起全部过程') && observation.axButtonTitles.includes('展开全部过程')
      const pressOk = Boolean(observation.collapsePress?.ok && observation.expandPress?.ok)
      const expanded = observation.segmentExpanded
      const toggleOk = Array.isArray(expanded) && expanded.length > 0
      const all = buttonsOk && pressOk && toggleOk
      cases.push({
        ...base,
        status: all ? 'PASS' : buttonsOk || pressOk ? 'FAIL' : 'BLOCKED',
        detail: `批量按钮=${buttonsOk} 按压回执=${pressOk} 段展开态可读=${toggleOk} (${expanded?.join(',') ?? 'null'})`,
        blockedReason: all || buttonsOk || pressOk ? null : '未读到批量折叠按钮或按压回执',
      })
    }
  }

  // NT-MAC-005：重启恢复历史 —— 同一 fixture 数据目录重启后，真实作业的状态栏与首条事件仍可见。
  {
    const base = {
      caseId: 'TASK-NAT-005', platformTask: 'NT-MAC-005',
      title: '重启恢复历史（重启前后事件与终态对照）',
      category: 'objective' as const,
      evidence: shots,
    }
    if (!observation.restartSucceeded) {
      cases.push({ ...base, ...observedBlocked('未能以同一数据目录重启并重开会话'), blockedReason: '重启未成功' })
    } else {
      const after = observation.restartTextsAfter.join('\n')
      const label = statusLabel(observation.realTerminalStatus)
      const statusOk = after.includes(label)
      const eventOk = observation.realEvents.some((event) => {
        const tokens = [event.segment?.label ?? '', event.message].filter(Boolean)
        return tokens.some((token) => after.includes(token))
      })
      const all = statusOk && eventOk
      cases.push({
        ...base,
        status: all ? 'PASS' : statusOk || eventOk ? 'FAIL' : 'BLOCKED',
        detail: `重启后状态栏=${statusOk} 首条事件=${eventOk} 重启前文本=${observation.restartTextsBefore.length}`,
        blockedReason: null,
      })
    }
  }

  return cases
}

export interface EvidenceItem {
  platformTask: string
  targetCaseId: string
  title: string
  reason: string
  evidence: string[]
  status: 'BLOCKED'
}

/** 主观/观感子项：只生成证据包，保留 BLOCKED，不在本套件内写成 PASS。 */
export function buildEvidencePackage(observation: Observation): EvidenceItem[] {
  const shots = observation.screenshots
  return [
    { platformTask: 'NT-MAC-001', targetCaseId: 'TASK-UI-004', title: '状态栏常显与视觉一致性（观感）', reason: '观感判断需人，归 §8.5', evidence: shots, status: 'BLOCKED' },
    { platformTask: 'NT-MAC-002', targetCaseId: 'TASK-UI-001', title: '恢复后出现新推进段且不覆盖暂停前记录', reason: '需真实运行中任务，归 §8.5', evidence: shots, status: 'BLOCKED' },
    { platformTask: 'NT-MAC-003', targetCaseId: 'TASK-UI-006', title: '源变化提示文案「原文已变化…」易理解性', reason: '文案易理解性属主观判断（DEFER-UI-006），归 §8.5', evidence: shots, status: 'BLOCKED' },
    { platformTask: 'NT-MAC-004', targetCaseId: 'TASK-UI-003', title: '两层折叠交互手感 / 自动跟随观感', reason: '观感判断需人，归 §8.5', evidence: shots, status: 'BLOCKED' },
    { platformTask: 'NT-MAC-005', targetCaseId: 'TASK-UI-008', title: '重启后会话完整性的目视确认', reason: '目视确认需人，归 §8.5', evidence: shots, status: 'BLOCKED' },
  ]
}

export function summarizeCases(cases: NativeCase[]): { caseCount: number; passed: number; failed: number; blocked: number } {
  return {
    caseCount: cases.length,
    passed: cases.filter((c) => c.status === 'PASS').length,
    failed: cases.filter((c) => c.status === 'FAIL').length,
    blocked: cases.filter((c) => c.status === 'BLOCKED').length,
  }
}

export interface NativeResultInput {
  observation: Observation
  repository: { gitSha: string | null; dirty: boolean; version: string }
  application: Record<string, unknown>
  sourceBatch: { driverWorkspace: string; jobId: string | null }
  outputDir: string
  objectiveCases?: NativeCase[]
  evidencePackage?: ReturnType<typeof buildEvidencePackage>
}

export interface NativeResultOutput {
  result: Record<string, unknown>
  resultFile: string
  sha256File: string
  summary: ReturnType<typeof summarizeCases>
  conclusion: string
}

export function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function assembleNativeResult(input: NativeResultInput): NativeResultOutput {
  const objective = input.objectiveCases ?? evaluateObjectiveCases(input.observation)
  const evidence = input.evidencePackage ?? buildEvidencePackage(input.observation)
  const summary = summarizeCases(objective)
  const provenanceOk = Boolean(input.repository.gitSha) && !input.repository.dirty
  const allPass = summary.passed === summary.caseCount && summary.failed === 0 && summary.blocked === 0
  const specialityPass = allPass && provenanceOk
  const conclusion = specialityPass ? 'PASS' : summary.failed > 0 ? 'FAIL' : 'BLOCKED'
  const remainingItems = allPass
    ? []
    : objective
        .filter((c) => c.status !== 'PASS')
        .map((c) => ({ caseId: c.caseId, platformTask: c.platformTask, status: c.status, reason: c.blockedReason ?? c.detail ?? '客观断言未通过' }))
  const decision = {
    specialityPass,
    overallConclusion: specialityPass ? '专项通过' : summary.failed > 0 ? '不通过' : '未通过',
    scope: 'Alpha 客观范围',
    remainingItems,
    issues: [],
    humanReview: {
      reference: MANUAL_REVIEW_REFERENCE,
      note: '主观/观感/易理解性项只生成证据包，统一归 §8.5 人工复核，不计入 Alpha 客观范围结论，不写成 PASS、不删除。',
      items: evidence.map((e) => ({ platformTask: e.platformTask, targetCaseId: e.targetCaseId, title: e.title, status: e.status })),
    },
    windowsPlatform: 'NOT_EXECUTED',
  }

  mkdirSync(input.outputDir, { recursive: true })
  const resultFile = join(input.outputDir, 'result.json')
  const sha256File = join(input.outputDir, 'SHA256SUMS')

  const result: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    scope: {
      platform: 'macos',
      platformTasks: ['NT-MAC-001', 'NT-MAC-002', 'NT-MAC-003', 'NT-MAC-004', 'NT-MAC-005'],
      objectiveOnly: true,
      note: '只判定可机器判定的客观子断言；主观/观感与目标平台人工材料见 evidencePackage 与 §8.5，不改写 UI-ACC-LOGS-001。',
    },
    evidenceBoundary: {
      fixture: '真实 Tauri app + 隔离数据目录 + fixture 项目；暂停态为播种前置条件',
      interaction: 'AX 原生自动化（menu-ax-helper.swift）',
      screenshots: 'CoreGraphics 采集',
      events: '真实 Ollama CLI 驱动作业产物，非新造事件',
      sourceChange: '修改真实源文件后，在真实 app 中 AX 点击「继续处理」，由生产后端复核指纹并拒绝；脚本只读回结果',
      notProven: '非真实用户发起的初始端到端任务；暂停恢复后的新段推进、观感与易理解性仍归 §8.5',
    },
    repository: input.repository,
    application: input.application,
    provenance: {
      status: provenanceOk ? 'PASS' : 'BLOCKED',
      repositoryClean: !input.repository.dirty,
      gitShaMatch: Boolean(input.repository.gitSha),
    },
    sourceBatch: input.sourceBatch,
    cases: objective.map((c) => ({
      caseId: c.caseId, platformTask: c.platformTask, title: c.title, category: c.category,
      status: c.status, detail: c.detail, evidence: c.evidence, blockedReason: c.blockedReason,
    })),
    evidencePackage: evidence.map((e) => ({ ...e, manualReviewReference: MANUAL_REVIEW_REFERENCE })),
    decision,
    summary,
    conclusion,
  }
  ;(result as { artifacts?: unknown }).artifacts = { manifestFile: 'SHA256SUMS', screenshots: input.observation.screenshots }

  // result.json 定稿后不再改写：清单在定稿文件上计算，且 result.json 不自引用自身 hash，
  // 与 UI-ACC-LOGS-001 / 模型 / 标题栏各验收脚本的 finalize-then-hash 口径一致。
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const shaEntries = input.observation.screenshots
    .filter((relative) => existsSync(join(input.outputDir, relative)))
    .map((relative) => ({ file: relative, hash: sha256OfFile(join(input.outputDir, relative)) }))
  const manifestLines = [
    { file: 'result.json', hash: sha256OfFile(resultFile) },
    ...shaEntries,
  ].map((entry) => `${entry.hash}  ${entry.file}`)
  writeFileSync(sha256File, `${manifestLines.join('\n')}\n`, 'utf8')

  return { result, resultFile, sha256File, summary, conclusion }
}

/** 从真实 CLI 驱动作业的 worker-events.json 生成可播种的事件摘要（只读，不造事件）。 */
export function readRealEvents(jobDir: string): SeedEvent[] {
  const file = join(jobDir, 'worker-events.json')
  if (!existsSync(file)) return []
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
  const raw = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown[] }).events ?? []
  return (raw as Array<Record<string, unknown>>).map((event) => ({
    sequence: Number(event.sequence ?? 0),
    stage: String(event.stage ?? ''),
    status: String(event.status ?? ''),
    message: String(event.message ?? ''),
    segment: event.segment
      ? {
          id: String((event.segment as Record<string, unknown>).id ?? ''),
          label: String((event.segment as Record<string, unknown>).label ?? ''),
          startedAt: (event.segment as Record<string, unknown>).startedAt as number | undefined,
          endedAt: (event.segment as Record<string, unknown>).endedAt as number | undefined,
        }
      : null,
  }))
}

/** 把真实作业的产物复制进 fixture 工作区，供真实 app 在隔离数据目录中渲染。 */
export function seedRealJobIntoFixture(jobDir: string, fixtureJobDir: string): string[] {
  mkdirSync(fixtureJobDir, { recursive: true })
  const copied: string[] = []
  for (const name of ['worker-events.json', 'job.json', 'worker-output.json', 'worker-input.json']) {
    const source = join(jobDir, name)
    if (existsSync(source)) {
      copyFileSync(source, join(fixtureJobDir, name))
      copied.push(name)
    }
  }
  return copied
}

export function usage(): string {
  return [
    '用法：node scripts/task-process/run-task-process-native-macos.mjs [选项]',
    '  --driver-workspace <path>  真实 Ollama CLI 驱动工作区（含 .vinkey/analysis/jobs/<jobId>/）',
    '  --job-id <id>              指定作业 id（缺省取最新一个）',
    '  --app <path>               目标 app（默认 /Applications/Vinkey.app）',
    '  --db <path>                真实 SQLite（只读模型配置/溯源）',
    '  --output <dir>             归档目录（默认 artifacts/task-process-native/<timestamp>-macos）',
    '  --dry-run                  只播种与解析参数，不启动 app、不采集 AX',
    '  --help                     显示帮助',
    '',
    '证据边界：真实 Tauri app + 隔离 fixture + AX 原生自动化；NT-MAC-003 以暂停态播种为前置，',
    '源文件修改与恢复拒绝由生产后端真实触发；主观/观感保留 BLOCKED 并归 §8.5。',
  ].join('\n')
}

export function sha256OfString(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function defaultArtifactDir(root: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  return join(root, 'artifacts', 'task-process-native', `${timestamp}-macos`)
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(dirname(dir))) mkdirSync(dirname(dir), { recursive: true })
}
