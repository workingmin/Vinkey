import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  KEYRING_SERVICE, SUITE_ID,
  computeConclusion, parseKeychainArguments, runKeychainAcceptance, runKeychainCases,
} from '../../scripts/model/keychain-acceptance.mjs'

const repository = { gitSha: 'contract-test-sha', repositoryClean: true, status: 'PASS' }

function fakeExecutor({ add = true, read = true, remove = true, gone = true } = {}) {
  const calls = []
  let stored = null
  const ok = (overrides = {}) => ({ status: 0, stdout: '', stderr: '', error: null, ...overrides })
  const fail = (message) => ({ status: 1, stdout: '', stderr: message, error: null })
  const run = (args) => {
    calls.push(args[0])
    if (args[0] === 'add-generic-password') {
      if (!add) return fail('mock: add failed')
      stored = args[args.indexOf('-w') + 1]
      return ok()
    }
    if (args[0] === 'find-generic-password') {
      if (stored === null) return fail('errSecItemNotFound')
      if (!read) return fail('mock: read failed')
      return ok({ stdout: `${stored}\n` })
    }
    if (args[0] === 'delete-generic-password') {
      if (!remove) return fail('mock: delete failed')
      if (!gone) return ok() // 模拟删除命令成功但凭据仍可读取
      stored = null
      return ok()
    }
    return fail('unexpected security command')
  }
  return { calls, run }
}

describe('macOS keychain acceptance CLI contract', () => {
  it('parses help, defaults and explicit flags', () => {
    expect(parseKeychainArguments(['--help'])).toBeNull()
    expect(parseKeychainArguments(['-h'])).toBeNull()
    const defaults = parseKeychainArguments([])
    expect(defaults.service).toBe(KEYRING_SERVICE)
    expect(defaults.json).toBe(false)
    const explicit = parseKeychainArguments(['--service', 'custom.service', '--tester-id', 'tester-01', '--json'])
    expect(explicit.service).toBe('custom.service')
    expect(explicit.testerId).toBe('tester-01')
    expect(explicit.json).toBe(true)
  })

  it('rejects unknown flags, missing values and an empty service', () => {
    expect(() => parseKeychainArguments(['--unknown'])).toThrow('未知参数')
    expect(() => parseKeychainArguments(['--service'])).toThrow('缺少值')
    expect(() => parseKeychainArguments(['--service', ''])).toThrow('不能为空')
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
    const cases = runKeychainCases({ service: KEYRING_SERVICE, repository, platform: 'darwin', executor: fake.run })
    expect(cases).toHaveLength(5)
    expect(cases.every((item) => item.status === 'PASS')).toBe(true)
    expect(cases.map((item) => item.caseId)).toEqual([
      'MODEL-KC-001', 'MODEL-KC-002', 'MODEL-KC-003', 'MODEL-KC-004', 'MODEL-KC-005',
    ])
    expect(fake.calls).toContain('add-generic-password')
    expect(fake.calls).toContain('delete-generic-password')
    expect(JSON.stringify(cases)).not.toContain('vinkey-acceptance-')
  })

  it('marks downstream cases BLOCKED when the write fails', () => {
    const cases = runKeychainCases({ service: KEYRING_SERVICE, repository, platform: 'darwin', executor: fakeExecutor({ add: false }).run })
    expect(cases.find((item) => item.caseId === 'MODEL-KC-001').status).toBe('FAIL')
    for (const id of ['MODEL-KC-002', 'MODEL-KC-003', 'MODEL-KC-004']) {
      expect(cases.find((item) => item.caseId === id).status).toBe('BLOCKED')
    }
    expect(computeConclusion(cases)).toBe('FAIL')
  })

  it('fails the deletion case when the credential is still readable afterwards', () => {
    const cases = runKeychainCases({ service: KEYRING_SERVICE, repository, platform: 'darwin', executor: fakeExecutor({ gone: false }).run })
    expect(cases.find((item) => item.caseId === 'MODEL-KC-004').status).toBe('FAIL')
    expect(computeConclusion(cases)).toBe('FAIL')
  })

  it('marks every case NOT_APPLICABLE outside macOS and never touches the keychain', () => {
    const fake = fakeExecutor()
    const cases = runKeychainCases({ service: KEYRING_SERVICE, repository, platform: 'win32', executor: fake.run })
    expect(fake.calls).toHaveLength(0)
    expect(cases.filter((item) => item.status === 'NOT_APPLICABLE')).toHaveLength(5)
    expect(computeConclusion(cases)).toBe('BLOCKED')
  })

  it('writes a final result.json with a matching SHA256SUMS manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'vinkey-keychain-cli-'))
    try {
      const options = { service: KEYRING_SERVICE, testerId: 'tester-01', logFile: join(root, 'diagnostic.json'), json: true }
      const cases = runKeychainCases({ service: KEYRING_SERVICE, repository, platform: 'darwin', executor: fakeExecutor().run })
      const output = runKeychainAcceptance({ options, root, cases, repository })
      expect(output.conclusion).toBe('PASS')
      expect(output.exitCode).toBe(0)
      expect(existsSync(output.resultFile)).toBe(true)
      expect(existsSync(output.sha256File)).toBe(true)
      const resultText = readFileSync(output.resultFile, 'utf8')
      const parsed = JSON.parse(resultText)
      expect(parsed.suite.id).toBe(SUITE_ID)
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
