import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  formatSuiteSummary,
  runCommand,
  sha256OfFile,
  summarizeCases,
  type CaseResult,
} from '../../scripts/lib/acceptance'

const temporaryDirectories: string[] = []

function temporaryFile(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'vinkey-lib-acceptance-'))
  temporaryDirectories.push(directory)
  const file = join(directory, 'payload.txt')
  writeFileSync(file, content)
  return file
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function caseResult(status: CaseResult['status']): CaseResult {
  return { caseId: status, title: status, category: 'machine', status, detail: null }
}

describe('summarizeCases', () => {
  it('returns zero counters for an empty suite', () => {
    expect(summarizeCases([])).toEqual({ caseCount: 0, passed: 0, failed: 0, blocked: 0 })
  })

  it('counts every status independently', () => {
    const cases = [
      caseResult('PASS'),
      caseResult('PASS'),
      caseResult('FAIL'),
      caseResult('BLOCKED'),
      caseResult('PASS'),
    ]
    expect(summarizeCases(cases)).toEqual({ caseCount: 5, passed: 3, failed: 1, blocked: 1 })
  })

  it('does not mutate the input case list', () => {
    const cases = [caseResult('PASS'), caseResult('FAIL')]
    summarizeCases(cases)
    expect(cases.map((item) => item.status)).toEqual(['PASS', 'FAIL'])
  })
})

describe('sha256OfFile', () => {
  it('matches the digest of the raw file bytes', () => {
    const file = temporaryFile('abc')
    const expected = createHash('sha256').update('abc').digest('hex')
    expect(sha256OfFile(file)).toBe(expected)
    expect(sha256OfFile(file)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('changes when the file content changes', () => {
    expect(sha256OfFile(temporaryFile('one'))).not.toBe(sha256OfFile(temporaryFile('two')))
  })
})

describe('runCommand', () => {
  it('captures trimmed stdout and a zero exit code', () => {
    const result = runCommand(process.execPath, ['-e', 'process.stdout.write("  hello  ")'])
    expect(result).toEqual({ ok: true, stdout: 'hello', stderr: '', code: 0 })
  })

  it('reports a non-zero exit code as not ok', () => {
    const result = runCommand(process.execPath, ['-e', 'process.stderr.write("boom"); process.exit(3)'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe(3)
    expect(result.stderr).toBe('boom')
  })

  it('returns a null code for a missing executable', () => {
    const result = runCommand('vinkey-command-that-does-not-exist', [])
    expect(result).toEqual({ ok: false, stdout: '', stderr: '', code: null })
  })

  it('kills a command that exceeds the timeout', () => {
    const result = runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 5_000)'], 100)
    expect(result.ok).toBe(false)
    expect(result.code).toBeNull()
  })
})

describe('formatSuiteSummary', () => {
  it('renders the shared four-line footer', () => {
    const footer = formatSuiteSummary('UI-ACC-LIB-001', {
      conclusion: 'PASS',
      resultFile: '/tmp/result.json',
      sha256File: '/tmp/SHA256SUMS',
      exitCode: 0,
      result: { summary: { caseCount: 3, passed: 2, failed: 1, blocked: 0 } },
    })
    expect(footer.split('\n')).toEqual([
      'UI-ACC-LIB-001 acceptance: PASS (2/3 passed, 1 failed, 0 blocked)',
      'Results: /tmp/result.json',
      'SHA256SUMS: /tmp/SHA256SUMS',
      'exit=0',
    ])
  })

  it('keeps blocked counts and non-zero exit codes visible', () => {
    const footer = formatSuiteSummary('UI-ACC-LIB-002', {
      conclusion: 'BLOCKED',
      resultFile: 'r.json',
      sha256File: 'SHA256SUMS',
      exitCode: 2,
      result: { summary: { caseCount: 4, passed: 1, failed: 0, blocked: 3 } },
    })
    expect(footer).toContain('BLOCKED (1/4 passed, 0 failed, 3 blocked)')
    expect(footer).toContain('exit=2')
  })
})
