import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  generateFixture,
  parseArguments,
  projectIdOf,
  readProjects,
  registerProject,
  runTitleBarAcceptance,
  type CaseResult,
  type CliOptions,
  type EnvironmentInfo,
  type FixtureManifest,
  type RepositoryInfo,
} from '../../scripts/title-bar/title-bar-acceptance'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
}

function fixtureRoot(): string {
  return track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-fixture-')))
}

function baseOptions(partial: Partial<CliOptions> = {}): CliOptions {
  return {
    workspace: null,
    outputDir: null,
    logFile: null,
    testerId: 'cli-test',
    json: false,
    keepFixture: false,
    ...partial,
  }
}

const repository: RepositoryInfo = { version: '0.1.0', gitSha: 'deadbeef', dirty: false, root: repositoryRoot }
const environment: EnvironmentInfo = { os: 'Linux', osVersion: 'ci', arch: process.arch, node: process.version, rust: 'N/A', tauriCli: 'N/A', tauriFramework: 'N/A' }

function runOnFixture(fixture: FixtureManifest, extra: Partial<CliOptions> = {}) {
  const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-out-')))
  return runTitleBarAcceptance({
    options: baseOptions({ outputDir, logFile: join(outputDir, 'diagnostics.json'), ...extra }),
    repository,
    environment,
    fixture,
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('title-bar acceptance CLI', () => {
  it('executes the bundled CLI entry point with a full help text', { timeout: 30_000 }, () => {
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-acceptance.mjs'), '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('W0-SHELL-MENU-F')
    expect(result.stdout).toContain('UI-ACC-TITLE-BAR-FIXTURE-001')
    expect(result.stdout).toContain('test:title-bar-acceptance')
    expect(result.stdout).toContain('--workspace')
    expect(result.stdout).toContain('W0-SHELL-MENU-P')
  })

  it('parses arguments with explicit overrides and rejects invalid input', () => {
    const options = parseArguments(['--workspace', '/tmp/tb-ws', '--output', '/tmp/tb-out', '--log-file', '/tmp/tb-log.json', '--tester-id', 'tester-1', '--json', '--keep-fixture'])
    expect(options).toMatchObject({
      workspace: '/tmp/tb-ws',
      outputDir: '/tmp/tb-out',
      logFile: '/tmp/tb-log.json',
      testerId: 'tester-1',
      json: true,
      keepFixture: true,
    })
    expect(() => parseArguments(['--unknown'])).toThrow('未知参数')
    expect(() => parseArguments(['--workspace'])).toThrow('缺少值')
    expect(() => parseArguments(['--tester-id', '姓名 邮箱'])).toThrow('--tester-id')
    expect(parseArguments(['--help'])).toBeNull()
  })

  it('derives a stable project id from the root path', () => {
    const root = join('/tmp', 'vinkey-title-bar-stable')
    expect(projectIdOf(root)).toBe(projectIdOf(root))
    expect(projectIdOf(root)).toMatch(/^[0-9a-f]{16}$/u)
    expect(projectIdOf(root)).not.toBe(projectIdOf(join('/tmp', 'vinkey-title-bar-other')))
  })

  it('generates an isolated fixture with a registered project, conversations and a draft file', () => {
    const fixture = generateFixture(fixtureRoot())
    expect(fixture.created).toBe(true)
    expect(fixture.projects).toHaveLength(1)
    expect(fixture.projects[0]!.conversations).toHaveLength(2)
    expect(fixture.projects[0]!.files.some((file) => file.relativePath === 'draft.md')).toBe(true)
    expect(fixture.draftSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(fixture.draftSha256).toBe(createHash('sha256').update(readFileSync(join(fixture.workspaceRoot, fixture.draftRelativePath))).digest('hex'))
    expect(existsSync(fixture.dbPath)).toBe(true)
    expect(existsSync(join(fixture.projectRecordsDir, `${fixture.projects[0]!.id}.sqlite3`))).toBe(true)
  })

  it('deduplicates project registration and keeps conversations and draft across refresh', () => {
    const fixture = generateFixture(fixtureRoot())
    const before = readProjectCount(fixture)
    const reRegistered = registerProject(fixture.dbPath, fixture.workspaceRoot)
    expect(reRegistered.id).toBe(fixture.projects[0]!.id)
    expect(readProjectCount(fixture)).toBe(before)
    registerProject(fixture.dbPath, fixture.workspaceRoot)
    expect(readFileSync(join(fixture.workspaceRoot, fixture.draftRelativePath), 'utf8')).toContain('未保存草稿')
    expect(readProjectCount(fixture)).toBe(before)
  })

  it('runs all six F-subset machine cases and archives a passing result', async () => {
    const output = await runOnFixture(generateFixture(fixtureRoot()))
    const result = output.result as {
      acceptance: { id: string; domainId: string; gate: string }
      summary: { caseCount: number; passed: number; failed: number; blocked: number }
      conclusion: string
      exitCode: number
      fixtureManifest: FixtureManifest
    }
    expect(result.acceptance).toEqual({ id: 'W0-SHELL-MENU-F', domainId: 'D-SHELL', gate: 'F' })
    expect(result.summary).toMatchObject({ caseCount: 6, passed: 6, failed: 0, blocked: 0 })
    expect(result.conclusion).toBe('PASS')
    expect(output.exitCode).toBe(0)
    expect(JSON.parse(readFileSync(join(output.outputDir, 'result.json'), 'utf8')).schemaVersion).toBe(1)
    expect(readFileSync(join(output.outputDir, 'SHA256SUMS'), 'utf8')).toContain('result.json')
    expect(result.fixtureManifest.projects).toHaveLength(1)
  })

  it('reports FAIL with exit code 2 when a case fails', async () => {
    const fixture = generateFixture(fixtureRoot())
    const injected: CaseResult[] = [{ caseId: 'TB-MENU-999', title: '注入失败用例', category: 'machine', status: 'FAIL', detail: 'injected' }]
    const failing = await runTitleBarAcceptance({
      options: baseOptions({ outputDir: track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-fail-'))), logFile: join(track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-log-'))), 'diag.json') }),
      repository,
      environment,
      fixture,
      cases: injected,
    })
    expect(failing.conclusion).toBe('FAIL')
    expect(failing.exitCode).toBe(2)
  })

  it('emits a single JSON document on --json and the fixed four-line summary otherwise', { timeout: 60_000 }, () => {
    const workspace = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-spawn-')))
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-spawn-out-')))
    const jsonRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-acceptance.mjs'),
      '--workspace', workspace, '--output', outputDir, '--tester-id', 'spawn-test', '--keep-fixture', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(jsonRun.status).toBe(0)
    const payload = JSON.parse(jsonRun.stdout) as { acceptance: { id: string }; summary: { passed: number; blocked: number }; conclusion: string; exitCode: number; fixtureManifest: { cleanup: string } }
    expect(payload.acceptance.id).toBe('W0-SHELL-MENU-F')
    expect(payload.summary).toMatchObject({ passed: 6, blocked: 0 })
    expect(payload.conclusion).toBe('PASS')
    expect(payload.exitCode).toBe(0)
    expect(payload.fixtureManifest.cleanup).toBe('caller-owned')

    const textRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-acceptance.mjs'),
      '--workspace', workspace, '--output', outputDir, '--tester-id', 'spawn-test', '--keep-fixture',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(textRun.status).toBe(0)
    const lines = textRun.stdout.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('UI-ACC-TITLE-BAR-FIXTURE-001 acceptance: PASS')
    expect(lines[1]).toContain('Results:')
    expect(lines[2]).toContain('SHA256SUMS:')
    expect(lines[3]).toBe('exit=0')
    expect(existsSync(workspace)).toBe(true)
  })

  it('cleans up an auto-generated fixture on a successful run', { timeout: 30_000 }, () => {
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-auto-')))
    const run = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-acceptance.mjs'),
      '--output', outputDir, '--tester-id', 'spawn-test', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(run.status).toBe(0)
    const payload = JSON.parse(run.stdout) as { fixtureManifest: { fixtureRoot: string; cleanup: string } }
    expect(payload.fixtureManifest.cleanup).toBe('removed')
    expect(existsSync(payload.fixtureManifest.fixtureRoot)).toBe(false)
  })
})

function readProjectCount(fixture: FixtureManifest): number {
  return readProjects(fixture.dbPath).projects.length
}
