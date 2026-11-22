import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildManualCases,
  formatProfileListReport,
  generateFixtureWorkspace,
  listConfiguredProfiles,
  mergeManualCases,
  parseArguments,
  readPersistedActiveProfileId,
  resolveSelectedModel,
  runTaskProcessAcceptance,
  scanWorkspace,
  writeManualTemplate,
  type CliOptions,
  type SelectedModelSummary,
} from '../../scripts/task-process/task-process-acceptance'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
}

function databaseFixture(): { directory: string; dbPath: string } {
  const directory = track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-cli-')))
  const dbPath = join(directory, 'vinkey.sqlite3')
  const database = new DatabaseSync(dbPath)
  database.exec(`
    CREATE TABLE model_profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT NOT NULL,
      model TEXT NOT NULL, context_window INTEGER NOT NULL, has_api_key INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE model_connections (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT NOT NULL,
      has_api_key INTEGER NOT NULL, credential_fingerprint TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE model_profile_connections (profile_id TEXT PRIMARY KEY, connection_id TEXT NOT NULL);
    CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO model_profiles VALUES
      ('older', 'Older', 'ollama', 'http://127.0.0.1:11434', 'qwen3:4b', 8192, 0, 1),
      ('router', 'Router', 'ollama', 'http://127.0.0.1:11434', 'qwen3:8b', 16384, 0, 2);
    INSERT INTO model_connections VALUES
      ('local', 'Local Ollama', 'ollama', 'http://127.0.0.1:11434', 0, 'none', 3);
    INSERT INTO model_profile_connections VALUES ('older', 'local'), ('router', 'local');
    INSERT INTO app_preferences VALUES ('activeModelId', 'router', 4);
  `)
  database.close()
  return { directory, dbPath }
}

function mkdirRecursive(path: string): void {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  mkdirSync(path, { recursive: true })
}

function completedJobWorkspace(): string {
  const directory = track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-job-')))
  const jobRoot = join(directory, '.vinkey', 'analysis', 'jobs', 'job-0001')
  mkdirRecursive(jobRoot)
  const now = Date.now()
  const segment = (id: string, label: string, startedAt: number, endedAt?: number) => ({ id, label, startedAt, endedAt })
  const events = [
    { sequence: 1, timestamp: now, jobId: 'job-0001', stage: 'chunking', status: 'running', completed: 0, total: 1, message: '正在将文本分成可分析的片段…', segment: segment('s1', '阅读与分段', now) },
    { sequence: 2, timestamp: now + 1, jobId: 'job-0001', stage: 'chunking', status: 'completed', completed: 1, total: 1, message: '阅读与分段已完成', segment: segment('s1', '阅读与分段', now, now + 1) },
    { sequence: 3, timestamp: now + 2, jobId: 'job-0001', stage: 'map', status: 'running', completed: 0, total: 3, message: '正在分析第 1/3 个文本片段…', segment: segment('s2', '分析文本片段', now + 2) },
    { sequence: 4, timestamp: now + 3, jobId: 'job-0001', stage: 'map', status: 'completed', completed: 3, total: 3, message: '分析文本片段已完成', segment: segment('s2', '分析文本片段', now + 2, now + 3) },
    { sequence: 5, timestamp: now + 4, jobId: 'job-0001', stage: 'synthesis', status: 'running', completed: 0, total: 1, message: '正在综合分析结果…', segment: segment('s3', '综合分析', now + 4) },
    { sequence: 6, timestamp: now + 5, jobId: 'job-0001', stage: 'synthesis', status: 'completed', completed: 1, total: 1, message: '综合分析已完成', segment: segment('s3', '综合分析', now + 4, now + 5) },
    { sequence: 7, timestamp: now + 6, jobId: 'job-0001', stage: 'lifecycle', status: 'completed', completed: 0, total: 0, message: '任务已完成', segment: null },
  ]
  writeFileSync(join(jobRoot, 'job-start.json'), JSON.stringify({ jobId: 'job-0001', workspaceId: 'ws-1', instruction: '分析这篇小说', status: 'completed', createdAt: now, updatedAt: now, documentCount: 1, supportedDocumentCount: 1, excludedDocuments: [], sourceFingerprints: { 'a.md': 'fp' } }))
  writeFileSync(join(jobRoot, 'worker-events.json'), JSON.stringify(events))
  writeFileSync(join(jobRoot, 'worker-input.json'), JSON.stringify({ workerVersion: 'long-text-worker-6', promptVersion: 'long-text-prompts-3', outputSchemaVersion: 'long-text-output-3', compatibilityKey: 'k', workspaceId: 'ws-1', createdAt: now, model: { id: 'm', model: 'qwen3:8b', contextWindow: 16384 }, input: { jobId: 'job-0001', instruction: '分析', instructionHash: 'h', profileId: 'router', contextWindow: 16384, sourcePolicy: 'local-chunks', maxTokens: 8000, overlapTokens: 200, dispatch: {}, documents: [{ path: 'a.md', sourceFingerprint: 'fp' }], excludedDocuments: [] } }))
  writeFileSync(join(jobRoot, 'worker-checkpoints.json'), JSON.stringify({ schemaVersion: 'long-text-checkpoints-2', compatibilityKey: 'k', updatedAt: now, entries: [{ artifact: 'analysis.md', stage: 'synthesis', contentHash: 'h1', createdAt: now, dependencies: [] }] }))
  writeFileSync(join(jobRoot, 'worker-output.json'), JSON.stringify({ workerVersion: 'long-text-worker-6', promptVersion: 'long-text-prompts-3', outputSchemaVersion: 'long-text-output-3', compatibilityKey: 'k', pipelineCompleted: true, jobId: 'job-0001', workspaceId: 'ws-1', sourceFingerprints: {}, manifests: [], content: '分析结果正文内容。', evidence: [], chunkCount: 3, summaryCount: 1, modelInvocationCount: 4, mapCacheHits: 0, stageCacheHits: 0, jobCheckpointHits: 0, durationMs: 5000, completedAt: now + 6 }))
  writeFileSync(join(jobRoot, 'analysis.md'), '# 分析结果\n')
  return directory
}

/**
 * 生产真实产物格式：persist_start_manifest 把 job-start.json 一次性写死为
 * "running"，真实终态由 job.json（completed）/ job-failed.json（failed）承载。
 * 合同测试原先的 completedJobWorkspace 手写 job-start.json=completed，
 * 会掩盖脚本只读 job-start.json 的判据缺陷，故单独构造本 fixture。
 */
function productionFormatJobWorkspace(status: 'completed' | 'failed' | 'running' = 'completed'): string {
  const directory = track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-real-job-')))
  const jobRoot = join(directory, '.vinkey', 'analysis', 'jobs', 'job-real-0001')
  mkdirRecursive(jobRoot)
  const now = Date.now()
  const segment = (id: string, label: string, startedAt: number, endedAt?: number) => ({ id, label, startedAt, endedAt })
  const events = [
    { sequence: 1, timestamp: now, jobId: 'job-real-0001', stage: 'chunking', status: 'running', completed: 0, total: 1, message: '正在将文本分成可分析的片段…', segment: segment('s1', '阅读与分段', now) },
    { sequence: 2, timestamp: now + 1, jobId: 'job-real-0001', stage: 'chunking', status: 'completed', completed: 1, total: 1, message: '阅读与分段已完成', segment: segment('s1', '阅读与分段', now, now + 1) },
    { sequence: 3, timestamp: now + 2, jobId: 'job-real-0001', stage: 'map', status: 'running', completed: 0, total: 1, message: '正在分析第 1/1 个文本片段…', segment: segment('s2', '分析文本片段', now + 2) },
    { sequence: 4, timestamp: now + 3, jobId: 'job-real-0001', stage: 'map', status: 'completed', completed: 1, total: 1, message: '分析文本片段已完成', segment: segment('s2', '分析文本片段', now + 2, now + 3) },
    { sequence: 5, timestamp: now + 4, jobId: 'job-real-0001', stage: 'lifecycle', status, completed: 0, total: 0, message: '任务终态', segment: null },
  ]
  // 与生产 persist_start_manifest 一致：固定 running，不随终态更新。
  writeFileSync(join(jobRoot, 'job-start.json'), JSON.stringify({ jobId: 'job-real-0001', workspaceId: 'ws-real', instruction: '概括正文', status: 'running', createdAt: now, updatedAt: now, documentCount: 1, supportedDocumentCount: 1, excludedDocuments: [], sourceFingerprints: { 'a.md': 'fp' } }))
  writeFileSync(join(jobRoot, 'worker-events.json'), JSON.stringify(events))
  writeFileSync(join(jobRoot, 'worker-input.json'), JSON.stringify({ workerVersion: 'long-text-worker-6', promptVersion: 'long-text-prompts-3', outputSchemaVersion: 'long-text-output-3', compatibilityKey: 'k', workspaceId: 'ws-real', createdAt: now, model: { id: 'm', model: 'qwen3:8b', contextWindow: 16384 }, input: { jobId: 'job-real-0001', instruction: '概括正文', instructionHash: 'h', profileId: 'router', contextWindow: 16384, sourcePolicy: 'local-chunks', maxTokens: 8000, overlapTokens: 200, dispatch: {}, documents: [{ path: 'a.md', sourceFingerprint: 'fp' }], excludedDocuments: [] } }))
  writeFileSync(join(jobRoot, 'worker-checkpoints.json'), JSON.stringify({ schemaVersion: 'long-text-checkpoints-2', compatibilityKey: 'k', updatedAt: now, entries: [{ artifact: 'analysis.md', stage: 'synthesis', contentHash: 'h1', createdAt: now, dependencies: [] }] }))
  if (status === 'completed') {
    writeFileSync(join(jobRoot, 'job.json'), JSON.stringify({ jobId: 'job-real-0001', workspaceId: 'ws-real', instruction: '概括正文', status: 'completed', createdAt: now, updatedAt: now + 4, documentCount: 1, supportedDocumentCount: 1, excludedDocuments: [], sourceFingerprints: { 'a.md': 'fp' }, chunkCount: 1, summaryCount: 1, evidenceCount: 1, modelInvocationCount: 4, mapCacheHits: 0, stageCacheHits: 0, jobCheckpointHits: 0, durationMs: 4000, error: null }))
    writeFileSync(join(jobRoot, 'worker-output.json'), JSON.stringify({ workerVersion: 'long-text-worker-6', promptVersion: 'long-text-prompts-3', outputSchemaVersion: 'long-text-output-3', compatibilityKey: 'k', pipelineCompleted: true, jobId: 'job-real-0001', workspaceId: 'ws-real', sourceFingerprints: {}, manifests: [], content: '分析结果正文内容。', evidence: [], chunkCount: 1, summaryCount: 1, modelInvocationCount: 4, mapCacheHits: 0, stageCacheHits: 0, jobCheckpointHits: 0, durationMs: 4000, completedAt: now + 4 }))
    writeFileSync(join(jobRoot, 'analysis.md'), '# 分析结果\n')
  } else if (status === 'failed') {
    writeFileSync(join(jobRoot, 'job-failed.json'), JSON.stringify({ jobId: 'job-real-0001', workspaceId: 'ws-real', instruction: '概括正文', status: 'failed', createdAt: now, updatedAt: now + 4, error: '模型输出未通过校验' }))
  }
  return directory
}

function baseOptions(partial: Partial<CliOptions> = {}): CliOptions {
  return {
    dbPath: join(tmpdir(), 'vinkey-missing.sqlite3'),
    profileId: null,
    workspace: null,
    jobId: null,
    timeoutMs: 120_000,
    json: false,
    listProfiles: false,
    logFile: null,
    manualFile: null,
    dumpManual: null,
    outputDir: null,
    testerId: 'cli-test',
    ...partial,
  }
}

function runInternal(workspace: string, dbPath: string, extra: Partial<CliOptions> = {}) {
  const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-out-')))
  const logFile = join(outputDir, 'diagnostics.json')
  const options = baseOptions({ dbPath, workspace, outputDir, logFile, ...extra })
  const repository = { version: '0.1.0', gitSha: 'deadbeef', dirty: false, root: repositoryRoot }
  const environment = { os: 'Linux', osVersion: 'ci', arch: process.arch, node: process.version, rust: 'N/A', tauriCli: 'N/A', tauriFramework: 'N/A', ollama: 'N/A' }
  const scan = scanWorkspace(workspace, options.jobId ?? null)
  let selectedModel: SelectedModelSummary | null = null
  let selectedModelError: string | null = null
  try {
    selectedModel = resolveSelectedModel(dbPath, options.profileId ?? null)
  } catch (cause) {
    selectedModelError = cause instanceof Error ? cause.message : String(cause)
  }
  return runTaskProcessAcceptance({
    options,
    repository,
    environment,
    fixture: scan.fixture,
    workspaceRoot: workspace,
    jobs: scan.jobs,
    targetJob: scan.targetJob,
    selectedModel,
    selectedModelError,
    cases: [],
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('task process acceptance CLI', () => {
  it('executes the bundled CLI entry point with a full help text', () => {
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/task-process/run-task-process-acceptance.mjs'), '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('W4-TASK-E')
    expect(result.stdout).toContain('UI-ACC-LOGS-001')
    expect(result.stdout).toContain('test:task-process-acceptance')
    expect(result.stdout).toContain('--workspace')
    expect(result.stdout).toContain('--manual')
    expect(result.stdout).toContain('--dump-manual')
    expect(result.stdout).toContain('--output')
    expect(result.stdout).toContain('--list-profiles')
    expect(result.stdout).toContain('CP-42')
  })

  it('parses arguments with env defaults and explicit overrides', () => {
    const previous = process.env.VINKEY_DB_PATH
    process.env.VINKEY_DB_PATH = '/tmp/from-env.sqlite3'
    process.env.VINKEY_PROFILE_ID = 'router'
    try {
      const options = parseArguments(['--workspace', '/tmp/ws', '--job-id', 'job-1', '--manual', '/tmp/m.json', '--output', '/tmp/out', '--json', '--timeout-ms', '3000'])
      expect(options).toMatchObject({
        dbPath: resolve('/tmp/from-env.sqlite3'),
        profileId: 'router',
        workspace: resolve('/tmp/ws'),
        jobId: 'job-1',
        manualFile: resolve('/tmp/m.json'),
        outputDir: resolve('/tmp/out'),
        json: true,
        timeoutMs: 3000,
      })
      expect(() => parseArguments(['--unknown'])).toThrow('未知参数')
      expect(() => parseArguments(['--timeout-ms', '10'])).toThrow('--timeout-ms')
    } finally {
      if (previous === undefined) delete process.env.VINKEY_DB_PATH
      else process.env.VINKEY_DB_PATH = previous
      delete process.env.VINKEY_PROFILE_ID
    }
  })

  it('lists configured profiles and resolves the SQLite active profile', () => {
    const { dbPath } = databaseFixture()
    const profiles = listConfiguredProfiles(dbPath)
    expect(profiles.map((item) => item.id)).toEqual(['router', 'older'])
    expect(readPersistedActiveProfileId(dbPath)).toBe('router')
    const report = formatProfileListReport(dbPath, profiles, 'router')
    expect(report).toContain('[1] router（当前）')
    expect(report).not.toContain('已执行')
    expect(resolveSelectedModel(dbPath, null).model).toBe('qwen3:8b')
    expect(resolveSelectedModel(dbPath, 'older').model).toBe('qwen3:4b')
  })

  it('refuses to guess the profile when the active preference is missing', () => {
    const { dbPath } = databaseFixture()
    const database = new DatabaseSync(dbPath)
    database.exec("DELETE FROM app_preferences WHERE key = 'activeModelId'")
    database.close()
    expect(() => resolveSelectedModel(dbPath, null)).toThrow('没有已持久化的当前模型')
  })

  it('runs machine checks on a completed job fixture and stays BLOCKED pending manual UI evidence', () => {
    const { dbPath } = databaseFixture()
    const workspace = completedJobWorkspace()
    const output = runInternal(workspace, dbPath)
    const result = output.result as {
      conclusion: string
      exitCode: number
      summary: { caseCount: number; passed: number; failed: number; blocked: number }
      acceptance: { id: string; domainId: string; gate: string }
      targetJobId: string | null
      cases: Array<{ caseId: string; status: string }>
    }
    expect(result.acceptance).toEqual({ id: 'W4-TASK-E', domainId: 'D-TASK-LOG', gate: 'E' })
    expect(result.targetJobId).toBe('job-0001')
    expect(result.summary).toMatchObject({ caseCount: 16, passed: 7, failed: 0, blocked: 9 })
    expect(result.conclusion).toBe('BLOCKED')
    expect(output.exitCode).toBe(0)
    const chk005 = result.cases.find((item) => item.caseId === 'TASK-CHK-005')
    expect(chk005?.status).toBe('PASS')
    const ui001 = result.cases.find((item) => item.caseId === 'TASK-UI-001')
    expect(ui001?.status).toBe('BLOCKED')
    expect(JSON.parse(readFileSync(join(output.outputDir, 'result.json'), 'utf8')).schemaVersion).toBe(1)
    expect(readFileSync(join(output.outputDir, 'SHA256SUMS'), 'utf8')).toContain('result.json')
  })

  it('does not count the production _stage-cache directory as an analysis job', () => {
    const workspace = completedJobWorkspace()
    mkdirRecursive(join(workspace, '.vinkey', 'analysis', 'jobs', '_stage-cache'))
    writeFileSync(join(workspace, '.vinkey', 'analysis', 'jobs', '_stage-cache', 'entry.json'), '{}')
    const scan = scanWorkspace(workspace, null)
    expect(scan.jobs.map((job) => job.jobId)).toEqual(['job-0001'])
    expect(scan.targetJob?.jobId).toBe('job-0001')
  })

  it('finalizes result.json before hashing so SHA256SUMS verifies with shasum -c', () => {
    const { dbPath } = databaseFixture()
    const workspace = completedJobWorkspace()
    const output = runInternal(workspace, dbPath)
    const resultBytes = readFileSync(join(output.outputDir, 'result.json'))
    const actualHash = createHash('sha256').update(resultBytes).digest('hex')
    const manifest = readFileSync(join(output.outputDir, 'SHA256SUMS'), 'utf8')
    const resultLine = manifest.split('\n').find((line) => line.endsWith('  result.json'))
    expect(resultLine).toBe(`${actualHash}  result.json`)
    const onDisk = JSON.parse(resultBytes.toString('utf8')) as {
      artifacts: { sha256: Record<string, string> }
    }
    // result.json 不把自身哈希写回自身，否则定稿后的改写会让清单失配。
    expect(onDisk.artifacts.sha256['result.json']).toBeUndefined()
  })

  it('reads the terminal status from job.json for production-format artifacts', () => {
    const { dbPath } = databaseFixture()
    const output = runInternal(productionFormatJobWorkspace('completed'), dbPath)
    const result = output.result as {
      jobs: Array<{ status: string; terminalStatusSource: string }>
      cases: Array<{ caseId: string; status: string }>
    }
    expect(result.jobs[0]?.status).toBe('completed')
    expect(result.jobs[0]?.terminalStatusSource).toBe('job.json')
    // 其余 TASK-UI-* 仍默认 BLOCKED，故整体结论保持 BLOCKED，不因终态修正而虚标通过。
    expect(result.cases.find((item) => item.caseId === 'TASK-CHK-006')?.status).toBe('PASS')
  })

  it('does not relax TASK-CHK-006 for failed or still-running production-format jobs', () => {
    const { dbPath } = databaseFixture()
    for (const status of ['failed', 'running'] as const) {
      const output = runInternal(productionFormatJobWorkspace(status), dbPath)
      const result = output.result as {
        jobs: Array<{ status: string; terminalStatusSource: string }>
        cases: Array<{ caseId: string; status: string }>
      }
      expect(result.jobs[0]?.status).toBe(status)
      expect(result.cases.find((item) => item.caseId === 'TASK-CHK-006')?.status).toBe('BLOCKED')
    }
  })

  it('emits a single JSON document on --json and the fixed four-line summary otherwise', () => {
    const { dbPath } = databaseFixture()
    const workspace = completedJobWorkspace()
    const outputDir = track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-spawn-')))
    const jsonRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/task-process/run-task-process-acceptance.mjs'),
      '--workspace', workspace, '--db', dbPath, '--output', outputDir, '--tester-id', 'spawn-test', '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(jsonRun.status).toBe(0)
    const payload = JSON.parse(jsonRun.stdout) as { acceptance: { id: string }; summary: { passed: number; blocked: number }; conclusion: string; exitCode: number }
    expect(payload.acceptance.id).toBe('W4-TASK-E')
    expect(payload.summary.passed).toBe(7)
    expect(payload.summary.blocked).toBe(9)
    expect(payload.conclusion).toBe('BLOCKED')
    expect(payload.exitCode).toBe(0)

    const textRun = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/task-process/run-task-process-acceptance.mjs'),
      '--workspace', workspace, '--db', dbPath, '--output', outputDir, '--tester-id', 'spawn-test',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(textRun.status).toBe(0)
    const lines = textRun.stdout.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('UI-ACC-LOGS-001 acceptance: BLOCKED')
    expect(lines[1]).toContain('Results:')
    expect(lines[2]).toContain('SHA256SUMS:')
    expect(lines[3]).toBe('exit=0')
  })

  it('merges tester manual UI evidence and reaches PASS when all cases pass', () => {
    const { dbPath } = databaseFixture()
    const workspace = completedJobWorkspace()
    const manualFile = join(track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-manual-'))), 'manual.json')
    writeManualTemplate(manualFile)
    const template = JSON.parse(readFileSync(manualFile, 'utf8')) as { cases: Array<{ caseId: string; status: string; evidence: string; notes: string }> }
    template.cases.forEach((item) => { item.status = 'PASS'; item.evidence = 'screenshots/evidence.png' })
    writeFileSync(manualFile, JSON.stringify(template, null, 2), 'utf8')
    const output = runInternal(workspace, dbPath, { manualFile })
    const result = output.result as { conclusion: string; summary: { passed: number; blocked: number; caseCount: number } }
    expect(result.conclusion).toBe('PASS')
    expect(result.summary).toMatchObject({ passed: 16, blocked: 0, caseCount: 16 })
    expect(output.exitCode).toBe(0)
  })

  it('fails the gate when event sequence or segment facts are broken', () => {
    const { dbPath } = databaseFixture()
    const directory = track(mkdtempSync(join(tmpdir(), 'vinkey-task-process-bad-')))
    const jobRoot = join(directory, '.vinkey', 'analysis', 'jobs', 'job-bad')
    mkdirRecursive(jobRoot)
    const now = Date.now()
    writeFileSync(join(jobRoot, 'job-start.json'), JSON.stringify({ jobId: 'job-bad', status: 'completed', createdAt: now, updatedAt: now }))
    writeFileSync(join(jobRoot, 'worker-events.json'), JSON.stringify([{ sequence: 5, timestamp: now, jobId: 'job-bad', stage: 'chunking', status: 'running', completed: 0, total: 1, message: 'x', segment: { id: 's', label: '阅读与分段', startedAt: now } }]))
    writeFileSync(join(jobRoot, 'worker-input.json'), JSON.stringify({}))
    writeFileSync(join(jobRoot, 'worker-checkpoints.json'), JSON.stringify({ schemaVersion: 'long-text-checkpoints-2', compatibilityKey: 'k', updatedAt: now, entries: [] }))
    writeFileSync(join(jobRoot, 'worker-output.json'), JSON.stringify({ pipelineCompleted: true, content: 'ok' }))
    const output = runInternal(directory, dbPath)
    const result = output.result as { conclusion: string; exitCode: number; cases: Array<{ caseId: string; status: string; detail: string }> }
    expect(result.conclusion).toBe('FAIL')
    expect(output.exitCode).toBe(2)
    const chk005 = result.cases.find((item) => item.caseId === 'TASK-CHK-005')
    expect(chk005?.status).toBe('FAIL')
    expect(chk005?.detail).toContain('sequence=1')
  })

  it('builds a manual template with exactly the UI acceptance cases', () => {
    const cases = buildManualCases()
    expect(cases).toHaveLength(9)
    expect(cases[0]?.caseId).toBe('TASK-UI-001')
    expect(cases.every((item) => item.category === 'manual' && item.status === 'BLOCKED')).toBe(true)
    const merged = mergeManualCases(cases, null)
    expect(merged).toHaveLength(9)
  })
})
