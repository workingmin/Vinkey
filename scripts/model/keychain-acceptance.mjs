#!/usr/bin/env node
// W1-MODEL-E / D-MODEL 模型设置专项：macOS 系统凭据库（Keychain）自动化验收。
// 证据边界：本脚本验证 Vinkey 生产代码使用的同一 service/account 命名空间下，
// 系统凭据库通道的写入、读回、删除与删除后不可读；不通过 Vinkey UI 或 Rust command 调用，
// 也不读取真实用户凭据。Rust 生产路径（keyring apple-native）由 models.rs 的测试与代码审阅覆盖。
// Windows 凭据库验收属独立 Windows 专项，本脚本不代为判定。

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SUITE_ID = 'UI-ACC-SETTINGS-KEYCHAIN-001'
export const SUITE_VERSION = 'keychain-acceptance-1'
export const ACCEPTANCE_ID = 'W1-MODEL-E'
export const DOMAIN_ID = 'D-MODEL'
export const GATE = 'E'
export const KEYRING_SERVICE = 'com.vinkey.desktop'

function usage() {
  return `Vinkey 模型设置 macOS 系统凭据库验收（${SUITE_ID} / ${ACCEPTANCE_ID}）

用途：
  在 Vinkey 生产代码使用的 Keychain service 命名空间下，以一次性随机账号验证
  凭据写入、读回一致、显式删除与删除后不可读，并核对构建溯源。不读取真实凭据。

用法：
  npm run test:model-keychain-acceptance -- [选项]

参数：
  --service <name>     Keychain service（默认 ${KEYRING_SERVICE}）
  --tester-id <id>     非个人测试人员代号
  --log-file <path>    诊断日志路径；未指定写入系统临时目录
  --json               仅输出单个完整 JSON 文档到 stdout
  -h, --help           显示帮助

说明：
  - 仅适用于 macOS；其他平台所有用例记 NOT_APPLICABLE，结论 BLOCKED。
  - 测试凭据为随机生成，无论成功失败都在结束时清理，不写入 result.json 或日志。`
}

export function parseKeychainArguments(values) {
  const options = {
    service: KEYRING_SERVICE,
    testerId: null,
    logFile: null,
    json: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    const take = (flag) => {
      const arg = values[index + 1]
      if (arg === undefined) throw new Error(`参数 ${flag} 缺少值。`)
      index += 1
      return arg
    }
    if (value === '--service') options.service = take(value).trim()
    else if (value === '--tester-id') options.testerId = take(value).trim()
    else if (value === '--log-file') options.logFile = resolve(take(value))
    else throw new Error(`未知参数 ${value}。`)
  }
  if (!options.service) throw new Error('--service 不能为空。')
  return options
}

export function computeConclusion(cases) {
  const failed = cases.filter((item) => item.status === 'FAIL').length
  const blocked = cases.filter((item) => item.status === 'BLOCKED').length
  const applicable = cases.filter((item) => item.status !== 'NOT_APPLICABLE').length
  if (failed > 0) return 'FAIL'
  if (blocked > 0 || applicable === 0) return 'BLOCKED'
  return 'PASS'
}

function security(args) {
  const run = spawnSync('security', args, { encoding: 'utf8' })
  return { status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '', error: run.error?.message ?? null }
}

function collectRepository(root) {
  const sha = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  const gitSha = sha.status === 0 ? sha.stdout.trim() : null
  const dirty = Boolean(status.stdout.trim())
  return {
    gitSha,
    repositoryClean: !dirty,
    status: gitSha && !dirty ? 'PASS' : 'BLOCKED',
  }
}

/**
 * 执行客观用例。executor 可注入以便合同测试在不触碰 Keychain 的情况下验证判定逻辑。
 */
export function runKeychainCases({ service, repository, executor = security, platform = process.platform }) {
  const account = `model-acceptance-${Date.now()}-${randomBytes(4).toString('hex')}`
  const secret = `vinkey-acceptance-${randomBytes(24).toString('hex')}`
  const cases = []
  let created = false

  const record = (caseId, title, status, detail, extra = {}) => {
    cases.push({ caseId, title, category: 'machine', status, detail, ...extra })
  }

  try {
    if (platform !== 'darwin') {
      record('MODEL-KC-001', '系统凭据库写入', 'NOT_APPLICABLE', '非 macOS 平台；Windows 凭据库验收属独立 Windows 专项。')
      record('MODEL-KC-002', '凭据读回一致且明文不落证据', 'NOT_APPLICABLE', '非 macOS 平台。')
      record('MODEL-KC-003', '显式删除凭据', 'NOT_APPLICABLE', '非 macOS 平台。')
      record('MODEL-KC-004', '删除后不可读', 'NOT_APPLICABLE', '非 macOS 平台。')
    } else {
      const reason = (run) => (run.error ?? run.stderr.trim()) || `exit=${run.status}`
      const added = executor(['add-generic-password', '-U', '-s', service, '-a', account, '-w', secret])
      created = added.status === 0
      record('MODEL-KC-001', '系统凭据库写入', created ? 'PASS' : 'FAIL',
        created ? `写入成功：service=${service}，一次性账号已创建。` : `写入失败：${reason(added)}`)

      if (created) {
        const found = executor(['find-generic-password', '-s', service, '-a', account, '-w'])
        const readBack = found.status === 0 ? found.stdout.replace(/\r?\n$/u, '') : ''
        const matches = readBack === secret
        record('MODEL-KC-002', '凭据读回一致且明文不落证据', matches ? 'PASS' : 'FAIL',
          matches ? '读回值与一次性随机值逐字一致；result.json 与诊断日志均不记录凭据明文。'
            : `读回不一致或读取失败：${reason(found)}`)

        const deleted = executor(['delete-generic-password', '-s', service, '-a', account])
        const removed = deleted.status === 0
        created = !removed
        record('MODEL-KC-003', '显式删除凭据', removed ? 'PASS' : 'FAIL',
          removed ? 'delete-generic-password 成功。' : `删除失败：${reason(deleted)}`)

        if (removed) {
          const after = executor(['find-generic-password', '-s', service, '-a', account, '-w'])
          const gone = after.status !== 0
          record('MODEL-KC-004', '删除后不可读', gone ? 'PASS' : 'FAIL',
            gone ? '删除后查询返回 errSecItemNotFound（非 0 退出码），凭据已不存在。'
              : '删除后仍可读出凭据，删除未生效。')
        } else {
          record('MODEL-KC-004', '删除后不可读', 'BLOCKED', '前置删除未成功，无法判定。')
        }
      } else {
        record('MODEL-KC-002', '凭据读回一致且明文不落证据', 'BLOCKED', '前置写入未成功，无法判定。')
        record('MODEL-KC-003', '显式删除凭据', 'BLOCKED', '前置写入未成功，无法判定。')
        record('MODEL-KC-004', '删除后不可读', 'BLOCKED', '前置写入未成功，无法判定。')
      }
    }
  } finally {
    if (created && platform === 'darwin') {
      executor(['delete-generic-password', '-s', service, '-a', account])
    }
  }

  if (platform !== 'darwin') {
    record('MODEL-KC-005', '构建溯源', 'NOT_APPLICABLE', '非 macOS 平台，本批次不判定。')
  } else {
    record('MODEL-KC-005', '构建溯源', repository.status === 'PASS' ? 'PASS' : 'BLOCKED',
      repository.status === 'PASS'
        ? '仓库 HEAD 可读且工作树干净，批次可溯源。'
        : `构建溯源未定稿：gitSha=${repository.gitSha ?? 'null'}，repositoryClean=${repository.repositoryClean}。`,
      { gitSha: repository.gitSha, repositoryClean: repository.repositoryClean })
  }

  return cases
}

export function runKeychainAcceptance({ options, root, cases, repository = collectRepository(root) }) {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = join(root, 'artifacts', 'model-keychain-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? join(tmpdir(), `vinkey-model-keychain-${Date.now()}.json`)

  const summary = {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
    notApplicable: cases.filter((item) => item.status === 'NOT_APPLICABLE').length,
  }
  const conclusion = computeConclusion(cases)
  const exitCode = conclusion === 'FAIL' ? 2 : conclusion === 'BLOCKED' ? 1 : 0

  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    platform: process.platform,
    keyringService: options.service,
    evidenceBoundary: 'macOS 系统凭据库通道级客观证据；不通过 Vinkey UI / Rust command 调用，不读取真实用户凭据。',
    execution: { testerId: options.testerId ?? 'local-tester' },
    provenance: repository,
    cases,
    summary,
    conclusion,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS' },
  }

  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, suite: { id: SUITE_ID, version: SUITE_VERSION }, cases: cases.map(({ caseId, status, detail }) => ({ caseId, status, detail })) }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  // result.json 定稿后再计算哈希，清单不自引用。
  const sha = createHash('sha256').update(readFileSync(resultFile)).digest('hex')
  writeFileSync(sha256File, `${sha}  result.json\n`, 'utf8')
  return { result, conclusion, exitCode, outputDir, resultFile, sha256File, logFile }
}

function stdoutSummary(output) {
  const s = output.result.summary
  return [
    `${SUITE_ID} acceptance: ${output.conclusion} (${s.passed}/${s.caseCount} passed, ${s.failed} failed, ${s.blocked} blocked, ${s.notApplicable} not-applicable)`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.exitCode}`,
  ].join('\n')
}

export function main(argv = process.argv.slice(2), root = resolve(import.meta.dirname, '../..')) {
  let options
  try {
    const parsed = parseKeychainArguments(argv)
    if (!parsed) { console.log(usage()); return 0 }
    options = parsed
  } catch (cause) {
    console.error(`参数错误：${cause instanceof Error ? cause.message : String(cause)}`)
    return 1
  }
  const repository = collectRepository(root)
  const cases = runKeychainCases({ service: options.service, repository })
  const output = runKeychainAcceptance({ options, root, cases, repository })
  for (const item of cases) console.error(`[${item.caseId}] ${item.status} ${item.title}`)
  if (options.json) console.log(JSON.stringify(output.result, null, 2))
  else console.log(stdoutSummary(output))
  return output.exitCode
}

const isDirectRun = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) process.exitCode = main()
