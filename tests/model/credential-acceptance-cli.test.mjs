import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  KEYRING_SERVICE, SUITE_ID,
  computeConclusion, parseCredentialArguments, runCredentialAcceptance, runCredentialCases,
} from '../../scripts/model/credential-acceptance.mjs'

const repository = { gitSha: 'contract-test-sha', repositoryClean: true, status: 'PASS' }

function fakeExecutor({ write = true, read = true, remove = true, gone = true } = {}) {
  const calls = []
  let stored = null
  const ok = (overrides = {}) => ({ status: 0, stdout: '', stderr: '', error: null, ...overrides })
  const fail = (message) => ({ status: 1, stdout: '', stderr: message, error: null })
  const run = (args) => {
    calls.push(args[0])
    if (args[0] === 'write') {
      if (!write) return fail('mock: write failed')
      stored = args[2]
      return ok()
    }
    if (args[0] === 'read') {
      if (stored === null) return fail('Win32 error 1168')
      if (!read) return fail('mock: read failed')
      return ok({ stdout: `${stored}\n` })
    }
    if (args[0] === 'delete') {
      if (!remove) return fail('mock: delete failed')
      if (!gone) return ok() // 模拟删除命令成功但凭据仍可读取
      stored = null
      return ok()
    }
    return fail('unexpected credential operation')
  }
  return { calls, run }
}

describe('Windows credential acceptance CLI contract', () => {
  it('parses help, defaults and explicit flags', () => {
    expect(parseCredentialArguments(['--help'])).toBeNull()
    expect(parseCredentialArguments(['-h'])).toBeNull()
    const defaults = parseCredentialArguments([])
    expect(defaults.service).toBe(KEYRING_SERVICE)
    expect(defaults.json).toBe(false)
    const explicit = parseCredentialArguments(['--service', 'custom.service', '--tester-id', 'tester-01', '--json'])
    expect(explicit.service).toBe('custom.service')
    expect(explicit.testerId).toBe('tester-01')
    expect(explicit.json).toBe(true)
  })

  it('rejects unknown flags, missing values and an empty service', () => {
    expect(() => parseCredentialArguments(['--unknown'])).toThrow('未知参数')
    expect(() => parseCredentialArguments(['--service'])).toThrow('缺少值')
    expect(() => parseCredentialArguments(['--service', ''])).toThrow('不能为空')
  })

  it('derives conclusions from the four case states', () => {
    const pass = (status) => ({ caseId: 'X', status })
    expect(computeConclusion([pass('PASS'), pass('PASS')])).toBe('PASS')
    expect(computeConclusion([pass('PASS'), pass('FAIL')])).toBe('FAIL')
    expect(computeConclusion([pass('PASS'), pass('BLOCKED')])).toBe('BLOCKED')
    expect(computeConclusion([pass('NOT_APPLICABLE')])).toBe('BLOCKED')
    expect(computeConclusion([pass('PASS'), pass('NOT_APPLICABLE')])).toBe('PASS')
  })

  it('passes a healthy write/read/delete/verify chain without leaking the secret', () => {
    const fake = fakeExecutor()
    const cases = runCredentialCases({ service: KEYRING_SERVICE, repository, platform: 'win32', executor: fake.run })
    expect(cases).toHaveLength(5)
    expect(cases.every((item) => item.status === 'PASS')).toBe(true)
    expect(cases.map((item) => item.caseId)).toEqual([
      'MODEL-KC-001', 'MODEL-KC-002', 'MODEL-KC-003', 'MODEL-KC-004', 'MODEL-KC-005',
    ])
    expect(fake.calls).toContain('write')
    expect(fake.calls).toContain('delete')
    expect(JSON.stringify(cases)).not.toContain('vinkey-acceptance-')
  })

  it('marks downstream cases BLOCKED when the write fails', () => {
    const cases = runCredentialCases({ service: KEYRING_SERVICE, repository, platform: 'win32', executor: fakeExecutor({ write: false }).run })
    expect(cases.find((item) => item.caseId === 'MODEL-KC-001').status).toBe('FAIL')
    for (const id of ['MODEL-KC-002', 'MODEL-KC-003', 'MODEL-KC-004']) {
      expect(cases.find((item) => item.caseId === id).status).toBe('BLOCKED')
    }
    expect(computeConclusion(cases)).toBe('FAIL')
  })

  it('fails the deletion case when the credential is still readable afterwards', () => {
    const cases = runCredentialCases({ service: KEYRING_SERVICE, repository, platform: 'win32', executor: fakeExecutor({ gone: false }).run })
    expect(cases.find((item) => item.caseId === 'MODEL-KC-004').status).toBe('FAIL')
    expect(computeConclusion(cases)).toBe('FAIL')
  })

  it('marks every case NOT_APPLICABLE outside Windows and never touches the credential store', () => {
    const fake = fakeExecutor()
    const cases = runCredentialCases({ service: KEYRING_SERVICE, repository, platform: 'darwin', executor: fake.run })
    expect(fake.calls).toHaveLength(0)
    expect(cases.filter((item) => item.status === 'NOT_APPLICABLE')).toHaveLength(5)
    expect(computeConclusion(cases)).toBe('BLOCKED')
  })

  it('writes a final result.json with a matching SHA256SUMS manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'vinkey-credential-cli-'))
    try {
      const options = { service: KEYRING_SERVICE, testerId: 'tester-01', logFile: join(root, 'diagnostic.json'), json: true }
      const cases = runCredentialCases({ service: KEYRING_SERVICE, repository, platform: 'win32', executor: fakeExecutor().run })
      const output = runCredentialAcceptance({ options, root, cases, repository })
      expect(output.conclusion).toBe('PASS')
      expect(output.exitCode).toBe(0)
      expect(existsSync(output.resultFile)).toBe(true)
      expect(existsSync(output.sha256File)).toBe(true)
      const resultText = readFileSync(output.resultFile, 'utf8')
      const parsed = JSON.parse(resultText)
      expect(parsed.suite.id).toBe(SUITE_ID)
      expect(parsed.credentialBackend).toContain('Windows Credential Manager')
      expect(parsed.summary.passed).toBe(5)
      expect(parsed.provenance.status).toBe('PASS')
      expect(resultText).not.toContain('vinkey-acceptance-')
      expect(readFileSync(output.logFile, 'utf8')).not.toContain('vinkey-acceptance-')
      const expected = createHash('sha256').update(readFileSync(output.resultFile)).digest('hex')
      expect(readFileSync(output.sha256File, 'utf8')).toBe(`${expected}  result.json\n`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
