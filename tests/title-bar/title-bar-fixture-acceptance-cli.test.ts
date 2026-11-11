import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCEPTANCE_ID,
  DOMAIN_ID,
  F_GATE_CASE_IDS,
  GATE,
  PLANNED_CASE_IDS,
  SUITE_ID,
  gateUsage,
  parseGateArguments,
  readAllDependencies,
  runFixtureGate,
} from '../../scripts/title-bar/title-bar-fixture-acceptance'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryDirectories: string[] = []

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function writeResult(directory: string, payload: unknown): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'result.json'), JSON.stringify(payload, null, 2), 'utf8')
}

/** 构造与真实批次同构的最小依赖证据，避免测试依赖本机 artifacts/ 历史归档。 */
function syntheticRoot(editorConclusion = 'PASS'): string {
  const root = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-gate-')))
  const repository = { gitSha: 'deadbeef', repositoryClean: true }
  const provenance = { status: 'PASS' }
  const summary = { caseCount: 6, passed: 6, failed: 0, blocked: 0 }
  writeResult(join(root, 'artifacts/navigation-acceptance/run-20260101T000000Z'), {
    suite: { id: 'UI-ACC-NAV-FIXTURE-001' }, conclusion: 'PASS', exitCode: 0, summary, repository, provenance,
  })
  writeResult(join(root, 'artifacts/editor-acceptance/run-20260101T000001Z'), {
    suite: { id: 'UI-ACC-EDITOR-001' }, conclusion: editorConclusion, exitCode: editorConclusion === 'PASS' ? 0 : 2, summary, repository, provenance,
  })
  const pBatch = join(root, 'artifacts/title-bar-acceptance/title-bar-w0-p-20260101-macos-000002Z')
  writeResult(pBatch, {
    conclusion: '条件通过',
    subsets: { 'W0-SHELL-MENU-P': { conclusion: 'PASS' } },
    // 新口径：P 原生批次对 F 归属的 TB-MENU-004 记 NOT_APPLICABLE（批次归属不适用），
    // 用 authoritativeGate 指向独立门槛；cases[].status 只用四态，不新增 DEFERRED/DELEGATED。
    cases: PLANNED_CASE_IDS.map((id) => id === 'TB-MENU-004'
      ? {
        caseId: id, subset: 'F', status: 'NOT_APPLICABLE',
        actual: '合成 P 批次：F 归属，批次归属不适用，仅保留原生过程证据',
        authoritativeGate: { suite: 'UI-ACC-TITLE-BAR-FIXTURE-001' },
      }
      : { caseId: id, subset: 'P', status: 'PASS', actual: 'synthetic P batch' }),
    summary: { caseCount: 13, passed: 12, failed: 0, blocked: 0, notApplicable: 1 },
    repository,
    provenance,
  })
  // CF-023 完成后 F 门槛从 companion 的 cases 读取 TB-MENU-003-GLOBAL-SEARCH 结论；
  // 合成证据必须同构（含该用例 PASS），否则会被正确地回退为 BLOCKED 并连带 F=BLOCKED。
  writeResult(join(pBatch, 'webview'), {
    conclusion: 'PASS', summary: { caseCount: 5, passed: 5, failed: 0, blocked: 0 },
    cases: [
      { caseId: 'TB-MENU-003-GLOBAL-SEARCH', status: 'PASS', detail: '合成 companion：项目/会话/当前项目文档三组、过滤与 Escape 均通过', evidence: ['screenshots/m3-global-search-open.png'] },
      { caseId: 'TB-MENU-004', status: 'PASS', detail: '合成 companion：搜索输入框 selection 断言' },
      { caseId: 'TB-MENU-005', status: 'PASS', detail: '合成 companion：查看页面结构证据' },
      { caseId: 'TB-MENU-010', status: 'PASS', detail: '合成 companion：菜单关闭与焦点结构证据' },
      { caseId: 'TB-MENU-012', status: 'PASS', detail: '合成 companion：首版减法结构证据' },
    ],
  })
  return root
}

function verifySha256Sums(batchDir: string): void {
  const lines = readFileSync(join(batchDir, 'SHA256SUMS'), 'utf8').trim().split('\n')
  for (const line of lines) {
    const [expected, relative] = line.split('  ')
    expect(existsSync(join(batchDir, relative!))).toBe(true)
    expect(createHash('sha256').update(readFileSync(join(batchDir, relative!))).digest('hex')).toBe(expected)
  }
}

describe('UI-ACC-TITLE-BAR-FIXTURE-001 independent F gate', () => {
  it('declares the independent suite and the full planned 13-case coverage', () => {
    expect(SUITE_ID).toBe('UI-ACC-TITLE-BAR-FIXTURE-001')
    expect(ACCEPTANCE_ID).toBe('W0-SHELL-MENU-F')
    expect(DOMAIN_ID).toBe('D-SHELL')
    expect(GATE).toBe('F')
    expect(PLANNED_CASE_IDS).toHaveLength(13)
    expect(new Set(PLANNED_CASE_IDS).size).toBe(13)
    expect(PLANNED_CASE_IDS).toContain('TB-MENU-003-GLOBAL-SEARCH')
    for (let index = 1; index <= 12; index += 1) {
      expect(PLANNED_CASE_IDS).toContain(`TB-MENU-${String(index).padStart(3, '0')}`)
    }
    expect([...F_GATE_CASE_IDS].sort()).toEqual([
      'TB-MENU-002', 'TB-MENU-003', 'TB-MENU-003-GLOBAL-SEARCH', 'TB-MENU-004',
    ].sort())
  })

  it('parses gate arguments and rejects invalid input', () => {
    expect(parseGateArguments(['--output', '/tmp/gate-out', '--tester-id', 'tester-1', '--json'])).toMatchObject({
      output: resolve('/tmp/gate-out'), testerId: 'tester-1', json: true, help: false,
    })
    expect(parseGateArguments(['--help']).help).toBe(true)
    expect(() => parseGateArguments(['--unknown'])).toThrow('未知参数')
    expect(() => parseGateArguments(['--output'])).toThrow('缺少值')
    expect(() => parseGateArguments(['--tester-id', '姓名 邮箱'])).toThrow('--tester-id')
  })

  it('exposes CLI help that names the independent suite and its npm entry', { timeout: 30_000 }, () => {
    const usage = gateUsage()
    expect(usage).toContain(SUITE_ID)
    expect(usage).toContain(ACCEPTANCE_ID)
    expect(usage).toContain('test:title-bar-fixture-acceptance')
    expect(usage).toContain('UI-ACC-TITLE-BAR-001')
    const run = spawnSync(process.execPath, [join(repositoryRoot, 'scripts/title-bar/run-title-bar-fixture-acceptance.mjs'), '--help'], {
      cwd: repositoryRoot, encoding: 'utf8',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain(SUITE_ID)
  })

  it('reads dependency conclusions from real result.json batches instead of hardcoding them', () => {
    const passing = readAllDependencies(syntheticRoot())
    expect(passing.map((item) => item.id)).toEqual(['W0-NAV-F', 'W0-EDITOR-F', 'W0-SHELL-MENU-P'])
    expect(passing.every((item) => item.available && item.resultFile)).toBe(true)
    expect(passing[1]!.conclusion).toBe('PASS')
    expect(passing[2]!.conclusion).toBe('PASS')
    expect(passing[2]!.note).toContain("subsets['W0-SHELL-MENU-P']")

    const blocked = readAllDependencies(syntheticRoot('BLOCKED'))
    expect(blocked[1]!.conclusion).toBe('BLOCKED')
    expect(readAllDependencies(track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-empty-')))).every((item) => !item.available)).toBe(true)
  })

  it('derives F=PASS from machine cases and dependencies but keeps the specialty conditional', { timeout: 90_000 }, async () => {
    const root = syntheticRoot()
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-gate-out-')))
    const output = await runFixtureGate({ root, options: parseGateArguments(['--output', outputDir, '--tester-id', 'gate-test']) })
    const result = output.result as {
      suite: { id: string }
      coverage: { plannedCount: number; executedCount: number; idsMatch: boolean }
      subsets: Record<string, { conclusion: string }>
      decision: { specialityPass: boolean; overallConclusion: string; windowsPlatform: string }
      summary: { caseCount: number; failed: number; notApplicable: number }
      machineContract: { conclusion: string; caseIds: string[] }
    }
    expect(output.fConclusion).toBe('PASS')
    expect(output.exitCode).toBe(0)
    expect(result.suite.id).toBe(SUITE_ID)
    expect(result.coverage.plannedCount).toBe(13)
    expect(result.coverage.executedCount).toBe(13)
    expect(result.coverage.idsMatch).toBe(true)
    expect(result.machineContract.conclusion).toBe('PASS')
    expect(result.subsets['W0-SHELL-MENU-F']!.conclusion).toBe('PASS')
    // 忠实于计划 §6：F 门槛通过不自动升级专项；NOT_APPLICABLE / 人工遗留项 / Windows 未执行仍在。
    expect(result.decision.specialityPass).toBe(false)
    expect(result.decision.overallConclusion).toBe('条件通过')
    expect(result.decision.windowsPlatform).toBe('NOT_EXECUTED')
    // CF-023 已实现后该用例由 NOT_APPLICABLE 转为客观 PASS，13 项不再有 N/A。
    expect(result.summary.notApplicable).toBe(0)
    expect(result.summary.passed).toBe(13)
    expect(result.summary.failed).toBe(0)
    // 脚本计划 §8「不新增状态值」：F 门槛输出四态；P 批次的批次归属 N/A 不改变
    // TB-MENU-004 的权威 PASS，也不会把 F 结论降级。
    const gateCases = (output.result.cases ?? []) as Array<{ caseId: string; status: string }>
    expect(gateCases).toHaveLength(13)
    expect(gateCases.every((item) => ['PASS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE'].includes(item.status))).toBe(true)
    expect(gateCases.find((item) => item.caseId === 'TB-MENU-004')!.status).toBe('PASS')
    expect(JSON.stringify(gateCases)).not.toMatch(/DEFERRED|DELEGATED|deferredTo/)
    expect(result.summary).not.toHaveProperty('delegated')
    expect(JSON.parse(readFileSync(output.resultFile, 'utf8')).schemaVersion).toBe(1)
    verifySha256Sums(outputDir)
  })

  it('keeps F BLOCKED when a hard dependency has not passed', { timeout: 90_000 }, async () => {
    const root = syntheticRoot('BLOCKED')
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-gate-blocked-')))
    const output = await runFixtureGate({ root, options: parseGateArguments(['--output', outputDir]) })
    expect(output.fConclusion).toBe('BLOCKED')
    expect(output.overallConclusion).toBe('条件通过')
    const cases = (output.result.cases ?? []) as Array<{ caseId: string; status: string }>
    expect(cases.find((item) => item.caseId === 'TB-MENU-004')!.status).toBe('BLOCKED')
    expect(cases).toHaveLength(13)
    verifySha256Sums(outputDir)
  })
})
