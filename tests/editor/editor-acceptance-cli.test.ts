import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyDocument,
  createDocument,
  ensureDocumentExtension,
  generateFixture,
  modifiedMs,
  parseArguments,
  readDocument,
  runEditorAcceptance,
  saveDocument,
  type CaseResult,
  type CliOptions,
  type EnvironmentInfo,
  type FixtureManifest,
  type RepositoryInfo,
} from '../../scripts/editor/editor-acceptance'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
}

function fixtureRoot(): string {
  return track(mkdtempSync(join(tmpdir(), 'vinkey-editor-fixture-')))
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
  const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-editor-out-')))
  return runEditorAcceptance({
    options: baseOptions({ outputDir, logFile: join(outputDir, 'diagnostics.json'), ...extra }),
    repository,
    environment,
    fixture,
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('editor acceptance CLI', () => {
  it('executes the bundled CLI entry point with a full help text', () => {
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/editor/run-editor-acceptance.mjs'), '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('W0-EDITOR-F')
    expect(result.stdout).toContain('UI-ACC-EDITOR-001')
    expect(result.stdout).toContain('test:editor-acceptance')
    expect(result.stdout).toContain('--workspace')
    expect(result.stdout).toContain('src-tauri/src/lib.rs')
  })

  it('parses arguments with explicit overrides and rejects invalid input', () => {
    expect(parseArguments(['--workspace', '/tmp/editor-ws', '--output', '/tmp/editor-out', '--tester-id', 'tester-1', '--json', '--keep-fixture'])).toMatchObject({
      workspace: '/tmp/editor-ws',
      outputDir: '/tmp/editor-out',
      testerId: 'tester-1',
      json: true,
      keepFixture: true,
    })
    expect(() => parseArguments(['--unknown'])).toThrow('未知参数')
    expect(() => parseArguments(['--workspace'])).toThrow('缺少值')
    expect(() => parseArguments(['--tester-id', '姓名 邮箱'])).toThrow('--tester-id')
    expect(parseArguments(['--help'])).toBeNull()
  })

  it('classifies documents by extension and .env rule', () => {
    expect(classifyDocument('第1章.md')).toBe('markdown')
    expect(classifyDocument('src/main.ts')).toBe('code')
    expect(classifyDocument('.env')).toBe('code')
    expect(classifyDocument('pic.png')).toBe('image')
    expect(classifyDocument('archive.zip')).toBe('binary')
    expect(ensureDocumentExtension('第1章.md')).toBe('markdown')
    expect(() => ensureDocumentExtension('pic.png')).toThrow()
    expect(() => ensureDocumentExtension('archive.zip')).toThrow()
  })

  it('reads BOM and CRLF documents with Chinese paths', () => {
    const fixture = generateFixture(fixtureRoot())
    const markdown = readDocument(fixture.workspaceRoot, '第1章.md')
    expect(markdown.kind).toBe('markdown')
    expect(markdown.hasBom).toBe(true)
    expect(markdown.content).toContain('灯塔在黎明前亮起。')
    const notes = readDocument(fixture.workspaceRoot, 'notes/中文路径.txt')
    expect(notes.lineEnding).toBe('crlf')
    expect(notes.content).toBe('第一行\n第二行\n')
  })

  it('rejects out-of-date saves and preserves the original bytes', () => {
    const fixture = generateFixture(fixtureRoot())
    const target = join(fixture.workspaceRoot, 'src/main.ts')
    const before = readFileSync(target)
    expect(() => saveDocument(fixture.workspaceRoot, 'src/main.ts', 'overwrite\n', modifiedMs(target) - 1, 'lf', false)).toThrow()
    expect(readFileSync(target).equals(before)).toBe(true)
  })

  it('creates documents with parent directories and guards name/binary/traversal', () => {
    const fixture = generateFixture(fixtureRoot())
    const created = createDocument(fixture.workspaceRoot, '生成/新文档-中文.md')
    expect(created.kind).toBe('markdown')
    expect(existsSync(join(fixture.workspaceRoot, '生成', '新文档-中文.md'))).toBe(true)
    expect(() => createDocument(fixture.workspaceRoot, '第1章.md')).toThrow()
    expect(() => createDocument(fixture.workspaceRoot, 'new.png')).toThrow()
    expect(() => createDocument(fixture.workspaceRoot, '../outside/escape.md')).toThrow()
  })

  it('runs all six machine cases and archives a passing result', async () => {
    const fixture = generateFixture(fixtureRoot())
    const output = await runOnFixture(fixture)
    const result = output.result as {
      acceptance: { id: string; domainId: string; gate: string }
      summary: { caseCount: number; passed: number; failed: number; blocked: number }
      conclusion: string
      exitCode: number
    }
    expect(result.acceptance).toEqual({ id: 'W0-EDITOR-F', domainId: 'D-EDITOR', gate: 'F' })
    expect(result.summary).toMatchObject({ caseCount: 6, passed: 6, failed: 0, blocked: 0 })
    expect(result.conclusion).toBe('PASS')
    expect(output.exitCode).toBe(0)
    expect(JSON.parse(readFileSync(join(output.outputDir, 'result.json'), 'utf8')).schemaVersion).toBe(1)
    expect(readFileSync(join(output.outputDir, 'SHA256SUMS'), 'utf8')).toContain('result.json')
    const manifestHash = readFileSync(join(fixture.workspaceRoot, '第1章.md'))
    expect(createHash('sha256').update(manifestHash).digest('hex')).not.toBe('')
  })

  it('reports FAIL with exit code 2 when a case fails', async () => {
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-editor-fail-')))
    const fixture = generateFixture(fixtureRoot())
    const injected: CaseResult[] = [{ caseId: 'EDIT-F-999', title: '注入失败用例', category: 'machine', status: 'FAIL', detail: 'injected' }]
    const failing = await runEditorAcceptance({
      options: baseOptions({ outputDir, logFile: join(outputDir, 'diag.json') }),
      repository,
      environment,
      fixture,
      cases: injected,
    })
    expect(failing.conclusion).toBe('FAIL')
    expect(failing.exitCode).toBe(2)
  })

  it('emits a single JSON document on --json and the fixed four-line summary otherwise', () => {
    const workspace = track(mkdtempSync(join(tmpdir(), 'vinkey-editor-spawn-')))
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-editor-spawn-out-')))
    const jsonRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/editor/run-editor-acceptance.mjs'),
      '--workspace', workspace, '--output', outputDir, '--tester-id', 'spawn-test', '--keep-fixture', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(jsonRun.status).toBe(0)
    const payload = JSON.parse(jsonRun.stdout) as { acceptance: { id: string }; summary: { passed: number; blocked: number }; conclusion: string; exitCode: number; fixtureManifest: { cleanup: string } }
    expect(payload.acceptance.id).toBe('W0-EDITOR-F')
    expect(payload.summary).toMatchObject({ passed: 6, blocked: 0 })
    expect(payload.conclusion).toBe('PASS')
    expect(payload.exitCode).toBe(0)
    expect(payload.fixtureManifest.cleanup).toBe('caller-owned')

    const textWorkspace = track(mkdtempSync(join(tmpdir(), 'vinkey-editor-spawn-text-')))
    const textRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/editor/run-editor-acceptance.mjs'),
      '--workspace', textWorkspace, '--output', outputDir, '--tester-id', 'spawn-test', '--keep-fixture',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(textRun.status).toBe(0)
    const lines = textRun.stdout.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('UI-ACC-EDITOR-001 acceptance: PASS')
    expect(lines[1]).toContain('Results:')
    expect(lines[2]).toContain('SHA256SUMS:')
    expect(lines[3]).toBe('exit=0')
  })

  it('cleans up an auto-generated fixture on a successful run', () => {
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-editor-auto-')))
    const run = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/editor/run-editor-acceptance.mjs'),
      '--output', outputDir, '--tester-id', 'spawn-test', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(run.status).toBe(0)
    const payload = JSON.parse(run.stdout) as { fixtureManifest: { fixtureRoot: string; cleanup: string } }
    expect(payload.fixtureManifest.cleanup).toBe('removed')
    expect(existsSync(payload.fixtureManifest.fixtureRoot)).toBe(false)
  })
})
