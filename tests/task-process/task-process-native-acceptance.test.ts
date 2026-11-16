import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  SOURCE_CHANGED_MESSAGE,
  SUITE_ID,
  assembleNativeResult,
  buildEvidencePackage,
  evaluateObjectiveCases,
  readRealEvents,
  seedRealJobIntoFixture,
  sequencesContinuous,
  statusLabel,
  summarizeCases,
  terminalEventsHaveEndedAt,
  type Observation,
  type SeedEvent,
} from '../../scripts/task-process/task-process-native-acceptance'

function track<T>(value: T): T { return value }

function observation(overrides: Partial<Observation> = {}): Observation {
  const events: SeedEvent[] = [
    { sequence: 1, stage: 'chunking', status: 'running', message: '正在将文本分成可分析的片段…', segment: { id: 's1', label: '阅读与分段', startedAt: 1, endedAt: 2 } },
    { sequence: 2, stage: 'lifecycle', status: 'completed', message: '任务已完成', segment: { id: 's2', label: '任务', startedAt: 2, endedAt: 3 } },
  ]
  return {
    launched: true, windowReady: true,     axTextCount: 12,
    axTexts: ['处理过程', '已完成', '已暂停后续步骤'],
    axButtonTitles: ['继续处理', '收起全部过程', '展开全部过程', '阅读与分段 2 条记录'],
    axNodeCount: 40, segmentExpanded: [true, false], screenshots: [],
    realEvents: events, realTerminalStatus: 'completed',
    collapsePress: { ok: true }, expandPress: { ok: true },
    restartTextsBefore: ['处理中'], restartTextsAfter: ['已完成', '正在将文本分成可分析的片段…'],
    restartSucceeded: true,
    sourceChange: {
      documentPath: 'README.md',
      fingerprintBefore: 'a'.repeat(64),
      fingerprintAfter: 'b'.repeat(64),
      resumePressed: true,
      taskStatusAfter: 'failed',
      failureMessage: `源文档已变化，无法继续 Worker（README.md）：${SOURCE_CHANGED_MESSAGE}`,
      failureCode: 'worker.compatibility_mismatch',
      failureRetryable: false,
      jobJsonCreated: false,
      workerOutputCreated: false,
      checkpointReuseEvents: 0,
      uiMessageVisible: true,
    },
    errors: [],
    ...overrides,
  }
}

describe('task-process-native-acceptance 纯逻辑', () => {
  it('套件 ID 与证据边界标识稳定', () => {
    expect(SUITE_ID).toBe('UI-ACC-TASK-NATIVE-001')
  })

  it('状态标签与生产文案表一致', () => {
    expect(statusLabel('running')).toBe('处理中')
    expect(statusLabel('completed')).toBe('已完成')
    expect(statusLabel('unknown-x')).toBe('unknown-x')
  })

  it('事件序列连续性：严格从 1 递增', () => {
    expect(sequencesContinuous([
      { sequence: 1, stage: '', status: '', message: '', segment: null },
      { sequence: 2, stage: '', status: '', message: '', segment: null },
    ])).toBe(true)
    expect(sequencesContinuous([
      { sequence: 1, stage: '', status: '', message: '', segment: null },
      { sequence: 3, stage: '', status: '', message: '', segment: null },
    ])).toBe(false)
    expect(sequencesContinuous([])).toBe(false)
  })

  it('终态事件必须有 endedAt', () => {
    expect(terminalEventsHaveEndedAt([
      { sequence: 1, stage: '', status: 'completed', message: '', segment: { id: 's', label: '', endedAt: 9 } },
    ])).toBe(true)
    expect(terminalEventsHaveEndedAt([
      { sequence: 1, stage: '', status: 'completed', message: '', segment: { id: 's', label: '' } },
    ])).toBe(false)
  })

  it('信号齐全且事实一致时客观用例全部 PASS', () => {
    const cases = evaluateObjectiveCases(observation())
    expect(cases).toHaveLength(5)
    expect(cases.map((c) => c.caseId)).toEqual([
      'TASK-NAT-001', 'TASK-NAT-002', 'TASK-NAT-003', 'TASK-NAT-004', 'TASK-NAT-005',
    ])
    expect(cases.find((c) => c.caseId === 'TASK-NAT-001')?.status).toBe('PASS')
    expect(cases.find((c) => c.caseId === 'TASK-NAT-002')?.status).toBe('PASS')
    expect(cases.find((c) => c.caseId === 'TASK-NAT-003')?.status).toBe('PASS')
    expect(cases.find((c) => c.caseId === 'TASK-NAT-004')?.status).toBe('PASS')
    expect(cases.find((c) => c.caseId === 'TASK-NAT-005')?.status).toBe('PASS')
  })

  it('未取得窗口/AX 信号时一律 BLOCKED，不虚标 PASS', () => {
    const cases = evaluateObjectiveCases(observation({ windowReady: false, axTextCount: 0, axTexts: [], axButtonTitles: [], restartSucceeded: false }))
    for (const c of cases) expect(c.status).toBe('BLOCKED')
  })

  it('观测到信号但与事实矛盾时 FAIL（事件可见但终态不符）', () => {
    const cases = evaluateObjectiveCases(observation({ axTexts: ['处理失败', '正在将文本分成可分析的片段…'] }))
    expect(cases.find((c) => c.caseId === 'TASK-NAT-001')?.status).toBe('FAIL')
  })

  it('源变化未采集恢复回执时 NAT-003 保持 BLOCKED', () => {
    const cases = evaluateObjectiveCases(observation({ sourceChange: null }))
    expect(cases.find((c) => c.caseId === 'TASK-NAT-003')?.status).toBe('BLOCKED')
  })

  it('源变化观测到但与拒绝事实矛盾时 NAT-003 判 FAIL', () => {
    const base = observation().sourceChange!
    const cases = evaluateObjectiveCases(observation({
      sourceChange: { ...base, taskStatusAfter: 'running', failureMessage: null, failureCode: null, uiMessageVisible: false },
    }))
    expect(cases.find((c) => c.caseId === 'TASK-NAT-003')?.status).toBe('FAIL')
  })

  it('证据包全部 BLOCKED 且引用 §8.5，不写成 PASS', () => {
    const items = buildEvidencePackage(observation())
    expect(items).toHaveLength(5)
    expect(items.every((i) => i.status === 'BLOCKED')).toBe(true)
    expect(items.every((i) => /§8\.5/.test(i.reason))).toBe(true)
  })

  it('四态计数正确', () => {
    const summary = summarizeCases(evaluateObjectiveCases(observation()))
    expect(summary.caseCount).toBe(5)
    expect(summary.passed + summary.failed + summary.blocked).toBe(5)
  })

  it('readRealEvents 兼容数组与 {events} 两种格式', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'native-events-')))
    const file = join(dir, 'worker-events.json')
    const event = { sequence: 1, stage: 'chunking', status: 'running', message: 'M', segment: { id: 's', label: 'L', endedAt: 5 } }
    writeFileSync(file, JSON.stringify([event]))
    expect(readRealEvents(dir)).toEqual([event])
    writeFileSync(file, JSON.stringify({ events: [event] }))
    expect(readRealEvents(dir)).toEqual([event])
  })

  it('seedRealJobIntoFixture 只复制真实产物白名单', () => {
    const src = track(mkdtempSync(join(tmpdir(), 'native-src-')))
    const dst = track(mkdtempSync(join(tmpdir(), 'native-dst-')))
    for (const name of ['worker-events.json', 'worker-output.json', 'job.json', 'worker-input.json', 'secret.txt']) {
      writeFileSync(join(src, name), name)
    }
    const copied = seedRealJobIntoFixture(src, join(dst, 'job'))
    expect(copied).toEqual(['worker-events.json', 'job.json', 'worker-output.json', 'worker-input.json'])
    expect(existsSync(join(dst, 'job', 'secret.txt'))).toBe(false)
  })

  it('assembleNativeResult：result.json 定稿后目标文件 SHA256 可独立重算（不自引用）', () => {
    const out = track(mkdtempSync(join(tmpdir(), 'native-result-')))
    const result = assembleNativeResult({
      observation: observation(),
      repository: { gitSha: 'abc123', dirty: false, version: '0.1.0' },
      application: { path: '/Applications/Vinkey.app' },
      sourceBatch: { driverWorkspace: '/ws', jobId: 'job-1' },
      outputDir: out,
    })
    expect(result.conclusion).toBe('PASS')
    expect(result.summary.passed).toBe(5)
    expect(result.summary.blocked).toBe(0)
    const decision = (result.result as { decision: { specialityPass: boolean; overallConclusion: string; remainingItems: unknown[]; humanReview: { items: unknown[] } } }).decision
    expect(decision.specialityPass).toBe(true)
    expect(decision.overallConclusion).toBe('专项通过')
    expect(decision.remainingItems).toEqual([])
    expect(decision.humanReview.items).toHaveLength(5)
    const manifest = readFileSync(result.sha256File, 'utf8')
    const resultLine = manifest.split('\n').find((line) => line.endsWith('  result.json'))!
    const actual = createHash('sha256').update(readFileSync(result.resultFile)).digest('hex')
    expect(resultLine).toBe(`${actual}  result.json`)
    expect((result.result as { artifacts: { sha256?: unknown } }).artifacts.sha256).toBeUndefined()
  })

  it('assembleNativeResult：工作树不干净时 provenance=BLOCKED 且结论非 PASS', () => {
    const out = track(mkdtempSync(join(tmpdir(), 'native-dirty-')))
    const result = assembleNativeResult({
      observation: observation(),
      repository: { gitSha: 'abc123', dirty: true, version: '0.1.0' },
      application: {}, sourceBatch: { driverWorkspace: '/ws', jobId: null }, outputDir: out,
    })
    expect((result.result as { provenance: { status: string } }).provenance.status).toBe('BLOCKED')
    expect((result.result as { decision: { specialityPass: boolean } }).decision.specialityPass).toBe(false)
    expect(result.conclusion).not.toBe('PASS')
  })
})
