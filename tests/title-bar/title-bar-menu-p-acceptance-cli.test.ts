import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parsePlatformArguments,
  runPMenuAcceptance,
  type AcceptanceRunInput,
} from '../../scripts/title-bar/title-bar-menu-p-acceptance'
import type {
  CaseResult,
  CliOptions,
  EnvironmentInfo,
  RepositoryInfo,
} from '../../scripts/title-bar/title-bar-acceptance'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
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

function input(extra: Partial<CliOptions> = {}, cases: CaseResult[] | null = null): AcceptanceRunInput {
  const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-p-out-')))
  return {
    options: baseOptions({ outputDir, logFile: join(outputDir, 'diagnostics.json'), ...extra }),
    repository,
    environment,
    cases,
  }
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('title-bar menu P acceptance CLI', () => {
  it('executes the bundled CLI entry point with a full help text', { timeout: 30_000 }, () => {
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-menu-p-acceptance.mjs'), '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('W0-SHELL-MENU-P')
    expect(result.stdout).toContain('UI-ACC-TITLE-BAR-001')
    expect(result.stdout).toContain('TB-MENU-008')
  })

  it('rejects fixture options that belong to the F subset', () => {
    expect(() => parsePlatformArguments(['--workspace', '/tmp/p-ws'])).toThrow('不接受 --workspace')
    expect(() => parsePlatformArguments(['--keep-fixture'])).toThrow('不接受 --keep-fixture')
    expect(parsePlatformArguments(['--json'])).toMatchObject({ json: true, workspace: null })
  })

  it('runs the machine band with 8 pass and 1 native-pending blocked case', { timeout: 60_000 }, async () => {
    const output = await runPMenuAcceptance(input())
    const result = output.result as {
      acceptance: { id: string; domainId: string; gate: string }
      summary: { caseCount: number; passed: number; failed: number; blocked: number }
      machineBand: { nativePendingCases: string[] }
      conclusion: string
      exitCode: number
    }
    expect(result.acceptance).toEqual({ id: 'W0-SHELL-MENU-P', domainId: 'D-SHELL', gate: 'P' })
    expect(result.summary).toMatchObject({ caseCount: 9, passed: 8, failed: 0, blocked: 1 })
    expect(result.machineBand.nativePendingCases).toEqual(['TB-MENU-008'])
    expect(result.conclusion).toBe('BLOCKED')
    expect(output.exitCode).toBe(0)
    expect(JSON.parse(readFileSync(join(output.outputDir, 'result.json'), 'utf8')).schemaVersion).toBe(1)
    expect(readFileSync(join(output.outputDir, 'SHA256SUMS'), 'utf8')).toContain('result.json')
  })

  it('reports FAIL with exit code 2 when a case fails', { timeout: 30_000 }, async () => {
    const injected: CaseResult[] = [{ caseId: 'TB-MENU-999', title: '注入失败用例', category: 'machine', status: 'FAIL', detail: 'injected' }]
    const failing = await runPMenuAcceptance(input({}, injected))
    expect(failing.conclusion).toBe('FAIL')
    expect(failing.exitCode).toBe(2)
  })

  it('emits a single JSON document on --json and the fixed four-line summary otherwise', { timeout: 60_000 }, () => {
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-title-bar-p-spawn-')))
    const jsonRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-menu-p-acceptance.mjs'),
      '--output', outputDir, '--tester-id', 'spawn-test', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(jsonRun.status).toBe(0)
    const payload = JSON.parse(jsonRun.stdout) as { acceptance: { id: string }; summary: { passed: number; blocked: number }; conclusion: string; exitCode: number }
    expect(payload.acceptance.id).toBe('W0-SHELL-MENU-P')
    expect(payload.summary).toMatchObject({ passed: 8, blocked: 1 })
    expect(payload.conclusion).toBe('BLOCKED')
    expect(payload.exitCode).toBe(0)
    expect(existsSync(join(outputDir, 'result.json'))).toBe(true)

    const textRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/title-bar/run-title-bar-menu-p-acceptance.mjs'),
      '--output', outputDir, '--tester-id', 'spawn-test',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(textRun.status).toBe(0)
    const lines = textRun.stdout.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('UI-ACC-TITLE-BAR-001 acceptance: BLOCKED')
    expect(lines[1]).toContain('Results:')
    expect(lines[2]).toContain('SHA256SUMS:')
    expect(lines[3]).toBe('exit=0')
  })
})
