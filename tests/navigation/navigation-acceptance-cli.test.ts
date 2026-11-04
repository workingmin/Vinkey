import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyIfMatchesActive,
  createProjectsDatabase,
  deleteProjectRecord,
  generateFixture,
  listConversations,
  parseArguments,
  projectCount,
  projectIdOf,
  registerProject,
  runMachineCases,
  runNavigationAcceptance,
  searchWorkspaceFixture,
  type CaseResult,
  type CliOptions,
  type EnvironmentInfo,
  type FixtureManifest,
  type RepositoryInfo,
} from '../../scripts/navigation/navigation-acceptance'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
}

function fixtureRoot(): string {
  return track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-fixture-')))
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
  const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-out-')))
  return runNavigationAcceptance({
    options: baseOptions({ outputDir, logFile: join(outputDir, 'diagnostics.json'), ...extra }),
    repository,
    environment,
    fixture,
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('navigation acceptance CLI', () => {
  it('executes the bundled CLI entry point with a full help text', () => {
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/navigation/run-navigation-acceptance.mjs'), '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('W0-NAV-F')
    expect(result.stdout).toContain('UI-ACC-NAV-FIXTURE-001')
    expect(result.stdout).toContain('test:navigation-acceptance')
    expect(result.stdout).toContain('--workspace')
    expect(result.stdout).toContain('--keep-fixture')
    expect(result.stdout).toContain('search.rs')
  })

  it('parses arguments with explicit overrides and rejects invalid input', () => {
    const options = parseArguments(['--workspace', '/tmp/nav-ws', '--output', '/tmp/nav-out', '--log-file', '/tmp/nav-log.json', '--tester-id', 'tester-1', '--json', '--keep-fixture'])
    expect(options).toMatchObject({
      workspace: '/tmp/nav-ws',
      outputDir: '/tmp/nav-out',
      logFile: '/tmp/nav-log.json',
      testerId: 'tester-1',
      json: true,
      keepFixture: true,
    })
    expect(() => parseArguments(['--unknown'])).toThrow('未知参数')
    expect(() => parseArguments(['--workspace'])).toThrow('缺少值')
    expect(parseArguments(['--help'])).toBeNull()
  })

  it('derives stable project ids from the root path', () => {
    const root = join('/tmp', 'vinkey-nav-stable')
    expect(projectIdOf(root)).toBe(projectIdOf(root))
    expect(projectIdOf(root)).toMatch(/^[0-9a-f]{16}$/u)
    expect(projectIdOf(root)).not.toBe(projectIdOf(join('/tmp', 'vinkey-nav-other')))
  })

  it('generates an isolated bilingual fixture with two projects and two conversations each', () => {
    const root = fixtureRoot()
    const fixture = generateFixture(root)
    expect(fixture.created).toBe(true)
    expect(fixture.projects).toHaveLength(2)
    expect(fixture.projects.map((item) => item.name)).toEqual(['project-a', 'project-b'])
    for (const project of fixture.projects) {
      expect(project.conversations).toHaveLength(2)
      expect(project.files.length).toBeGreaterThanOrEqual(3)
      expect(project.files.every((file) => /^[0-9a-f]{64}$/u.test(file.sha256))).toBe(true)
    }
    expect(fixture.dbSummary).toMatchObject({ projectCount: 2, conversationCount: 4, messageCount: 9 })
    expect(fixture.dbSummary.projectRecords.every((record) => existsSync(record.path))).toBe(true)
    expect(fixture.projects[0]!.files.some((file) => file.relativePath.includes('第1章'))).toBe(true)
    expect(fixture.projects[1]!.files.some((file) => file.relativePath.includes('双语'))).toBe(true)
    expect(existsSync(join(root, 'app-data', 'project-records'))).toBe(true)
  })

  it('deduplicates project registration by stable id and unique root', () => {
    const root = fixtureRoot()
    const fixture = generateFixture(root)
    const projectA = fixture.projects[0]!
    const before = projectCount(fixture.dbPath)
    const again = registerProject(fixture.dbPath, projectA.root)
    expect(again.id).toBe(projectA.id)
    expect(projectCount(fixture.dbPath)).toBe(before)
    const database = new DatabaseSync(fixture.dbPath)
    try {
      expect(() => database.prepare('INSERT INTO projects (id, root, name, opened_at) VALUES (?, ?, ?, ?)').run('collision', projectA.root, 'collision', Date.now())).toThrow()
    } finally {
      database.close()
    }
    expect(projectCount(fixture.dbPath)).toBe(before)
  })

  it('drops stale writes whose target workspace is not active', () => {
    expect(applyIfMatchesActive('a', 'a')).toBe(true)
    expect(applyIfMatchesActive('a', 'b')).toBe(false)
  })

  it('replicates search.rs boundary, ignore rules, Chinese paths and the 100 hit cap', () => {
    const root = fixtureRoot()
    const fixture = generateFixture(root)
    const projectA = fixture.projects[0]!
    const hits = searchWorkspaceFixture(projectA.root, '灯塔', 100)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits.every((hit) => Array.from(hit.snippet).length <= 180)).toBe(true)
    expect(searchWorkspaceFixture(projectA.root, '星轨', 100)).toHaveLength(0)
    expect(searchWorkspaceFixture(projectA.root, 'forbidden-needle', 100)).toHaveLength(0)
    expect(searchWorkspaceFixture(projectA.root, 'vinkey', 100).every((hit) => !hit.path.startsWith('project-b'))).toBe(true)
    expect(searchWorkspaceFixture(projectA.root, '重复行', 100)).toHaveLength(100)
    expect(searchWorkspaceFixture(projectA.root, '   ', 100)).toHaveLength(0)
  })

  it('deletes only application records and never touches fixture files', () => {
    const root = fixtureRoot()
    const fixture = generateFixture(root)
    const projectB = fixture.projects[1]!
    const recordPath = join(fixture.projectRecordsDir, `${projectB.id}.sqlite3`)
    const beforeConversations = listConversations(recordPath).length
    expect(beforeConversations).toBe(2)
    const beforeHashes = projectB.files.map((file) => ({ relativePath: file.relativePath, sha256: file.sha256 }))
    expect(() => deleteProjectRecord(fixture.dbPath, projectB.id, 'wrong-name')).toThrow('项目名称不匹配')
    expect(listConversations(recordPath)).toHaveLength(beforeConversations)
    deleteProjectRecord(fixture.dbPath, projectB.id, projectB.name)
    expect(listConversations(recordPath)).toHaveLength(0)
    for (const file of beforeHashes) {
      const filePath = join(projectB.root, file.relativePath)
      expect(statSync(filePath).isFile()).toBe(true)
      expect(createHash('sha256').update(readFileSync(filePath)).digest('hex')).toBe(file.sha256)
    }
    expect(readdirSync(projectB.root).length).toBeGreaterThan(0)
  })

  it('runs all six machine cases and archives a passing result', () => {
    const fixture = generateFixture(fixtureRoot())
    const cases = runMachineCases({ dbPath: fixture.dbPath, fixture })
    expect(cases.map((item) => item.caseId)).toEqual(['NAV-F-001', 'NAV-F-002', 'NAV-F-003', 'NAV-F-004', 'NAV-F-005', 'NAV-F-006'])
    expect(cases.every((item) => item.status === 'PASS')).toBe(true)
    const output = runOnFixture(generateFixture(fixtureRoot()))
    const result = output.result as {
      acceptance: { id: string; domainId: string; gate: string }
      summary: { caseCount: number; passed: number; failed: number; blocked: number }
      conclusion: string
      exitCode: number
      fixtureManifest: FixtureManifest
    }
    expect(result.acceptance).toEqual({ id: 'W0-NAV-F', domainId: 'D-NAV', gate: 'F' })
    expect(result.summary).toMatchObject({ caseCount: 6, passed: 6, failed: 0, blocked: 0 })
    expect(result.conclusion).toBe('PASS')
    expect(output.exitCode).toBe(0)
    expect(JSON.parse(readFileSync(join(output.outputDir, 'result.json'), 'utf8')).schemaVersion).toBe(1)
    expect(readFileSync(join(output.outputDir, 'SHA256SUMS'), 'utf8')).toContain('result.json')
    expect(result.fixtureManifest.projects).toHaveLength(2)
  })

  it('reports FAIL with exit code 2 when a case fails', () => {
    const root = fixtureRoot()
    const fixture = generateFixture(root)
    const injected: CaseResult[] = [{ caseId: 'NAV-F-999', title: '注入失败用例', category: 'machine', status: 'FAIL', detail: 'injected' }]
    const failing = runNavigationAcceptance({
      options: baseOptions({ outputDir: track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-fail-'))), logFile: join(track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-log-'))), 'diag.json'), testerId: 'cli-test' }),
      repository,
      environment,
      fixture,
      cases: injected,
    })
    expect(failing.conclusion).toBe('FAIL')
    expect(failing.exitCode).toBe(2)
  })

  it('emits a single JSON document on --json and the fixed four-line summary otherwise', () => {
    const workspace = track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-spawn-')))
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-spawn-out-')))
    const jsonRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/navigation/run-navigation-acceptance.mjs'),
      '--workspace', workspace, '--output', outputDir, '--tester-id', 'spawn-test', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(jsonRun.status).toBe(0)
    const payload = JSON.parse(jsonRun.stdout) as { acceptance: { id: string }; summary: { passed: number; blocked: number }; conclusion: string; exitCode: number; fixtureManifest: { cleanup: string } }
    expect(payload.acceptance.id).toBe('W0-NAV-F')
    expect(payload.summary).toMatchObject({ passed: 6, blocked: 0 })
    expect(payload.conclusion).toBe('PASS')
    expect(payload.exitCode).toBe(0)
    expect(payload.fixtureManifest.cleanup).toBe('caller-owned')

    const textRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/navigation/run-navigation-acceptance.mjs'),
      '--workspace', workspace, '--output', outputDir, '--tester-id', 'spawn-test',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(textRun.status).toBe(0)
    const lines = textRun.stdout.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('UI-ACC-NAV-FIXTURE-001 acceptance: PASS')
    expect(lines[1]).toContain('Results:')
    expect(lines[2]).toContain('SHA256SUMS:')
    expect(lines[3]).toBe('exit=0')
    expect(existsSync(workspace)).toBe(true)
  })

  it('cleans up an auto-generated fixture on a successful run', () => {
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-auto-')))
    const run = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/navigation/run-navigation-acceptance.mjs'),
      '--output', outputDir, '--tester-id', 'spawn-test', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(run.status).toBe(0)
    const payload = JSON.parse(run.stdout) as { fixtureManifest: { fixtureRoot: string; cleanup: string } }
    expect(payload.fixtureManifest.cleanup).toBe('removed')
    expect(existsSync(payload.fixtureManifest.fixtureRoot)).toBe(false)
  })

  it('classifies an empty project store as the empty state instead of an error', () => {
    const directory = track(mkdtempSync(join(tmpdir(), 'vinkey-navigation-empty-')))
    const dbPath = join(directory, 'empty.sqlite3')
    createProjectsDatabase(dbPath)
    const database = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = database.prepare('SELECT active_id AS activeId FROM project_selection WHERE singleton = 1').get() as { activeId: string | null }
      expect(row.activeId).toBeNull()
      expect(database.prepare('SELECT COUNT(*) AS count FROM projects').get()).toMatchObject({ count: 0 })
    } finally {
      database.close()
    }
  })
})
