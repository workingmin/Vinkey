import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest, ModelConnection, ModelProfile } from '../src/types'
import type { IntentClassificationCaseResult, IntentClassificationEvaluationSummary } from '../src/lib/intentModelEvaluation'
import {
  formatEvaluationReport,
  formatProfileListReport,
  invokeModel,
  listConfiguredProfiles,
  loadConfiguredRows,
  parseArguments,
  writeEvaluationLog,
} from './intent-model-eval'

const temporaryDirectories: string[] = []

function databaseFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'vinkey-intent-cli-test-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'vinkey.sqlite3')
  const database = new DatabaseSync(path)
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
  return path
}

afterEach(() => {
  vi.unstubAllGlobals()
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('IntentRouter model evaluation CLI', () => {
  it('executes the bundled CLI entry point instead of exiting silently', () => {
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, 'run-intent-model-eval.mjs'), '--help'], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Vinkey IntentRouter 本地模型专项评测')
    expect(result.stdout).toContain('--list-profiles')
    expect(result.stdout).toContain('--log-file')
  })

  it('uses the SQLite active profile instead of the newest updated profile', () => {
    const dbPath = databaseFixture()
    expect(listConfiguredProfiles(dbPath).map((item) => item.id)).toEqual(['router', 'older'])
    const options = parseArguments(['--db', dbPath])
    expect(options).not.toBeNull()
    expect(loadConfiguredRows(options!).profile).toMatchObject({ id: 'router', model: 'qwen3:8b' })
  })

  it('refuses to guess when the SQLite active profile has not been migrated', () => {
    const dbPath = databaseFixture()
    const database = new DatabaseSync(dbPath)
    database.exec("DELETE FROM app_preferences WHERE key = 'activeModelId'")
    database.close()
    const options = parseArguments(['--db', dbPath])
    expect(() => loadConfiguredRows(options!)).toThrow('没有已持久化的当前模型')
  })

  it('loads an explicitly selected profile', () => {
    const dbPath = databaseFixture()
    const options = parseArguments(['--db', dbPath, '--profile-id', 'older', '--timeout-ms', '3000', '--json'])
    expect(options).toMatchObject({ profileId: 'older', timeoutMs: 3000, json: true })
    expect(loadConfiguredRows(options!).profile.model).toBe('qwen3:4b')
  })

  it('makes profile listing explicit about the 12 unexecuted evaluation cases', () => {
    const report = formatProfileListReport('/tmp/vinkey.sqlite3', [
      { id: 'router', name: 'Router', model: 'qwen3:8b', updatedAt: 2 },
      { id: 'older', name: 'Older', model: 'qwen3:4b', updatedAt: 1 },
    ], 'router')
    expect(report).toContain('intent-model-eval-2（12 个版本化用例）')
    expect(report).toContain('[1] router（当前）')
    expect(report).not.toContain('默认候选')
    expect(report).toContain('12 个版本化用例尚未执行')
    expect(report).toContain('请确认带有（当前）标记的 profile')
  })

  it('prints detailed case counts, field metrics, and the final acceptance result', () => {
    const prediction = {
      intent: 'general-chat', agent: 'GeneralConversation', skill: 'general-conversation',
      scope: 'conversation', documentSelection: 'none',
    } as const
    const results: IntentClassificationCaseResult[] = Array.from({ length: 12 }, (_, index) => ({
      caseId: `case-${index + 1}`,
      output: JSON.stringify(prediction),
      prediction,
      matchedFields: ['intent', 'agent', 'skill', 'scope', 'documentSelection'],
      exactMatch: true,
      error: null,
    }))
    const summary: IntentClassificationEvaluationSummary = {
      suiteVersion: 'intent-model-eval-2', profileId: 'router', model: 'qwen3:8b', caseCount: 12,
      parsedCount: 12, exactMatchRate: 1, intentAccuracy: 1, agentAccuracy: 1,
      skillAccuracy: 1, scopeAccuracy: 1, documentSelectionAccuracy: 1, passed: true,
    }
    const profile: ModelProfile = {
      id: 'router', connectionId: 'local', name: 'Router', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen3:8b', contextWindow: 16_384, hasApiKey: false, updatedAt: 1,
    }
    const connection: ModelConnection = {
      id: 'local', name: 'Local Ollama', kind: 'ollama', baseUrl: profile.baseUrl, hasApiKey: false, updatedAt: 1,
    }
    const report = formatEvaluationReport({ database: '/tmp/vinkey.sqlite3', profile, connection, results, summary })
    expect(report).toContain('版本化用例：12 个')
    expect(report).toContain('[01/12] PASS case-1')
    expect(report).toContain('[12/12] PASS case-12')
    expect(report).toContain('执行完成：12/12')
    expect(report).toContain('Agent 准确率：100.0%')
    expect(report).toContain('DocumentSelection 准确率：100.0%')
    expect(report).toContain('验收结论：通过，12 个版本化用例全部执行成功且精确匹配。')
  })

  it('writes a reproducible per-case diagnostic log', () => {
    const dbPath = databaseFixture()
    const logFile = join(resolve(dbPath, '..'), 'intent-eval-log.json')
    const prediction = {
      intent: 'general-chat', agent: 'GeneralConversation', skill: 'general-conversation',
      scope: 'conversation', documentSelection: 'none',
    } as const
    const result: IntentClassificationCaseResult = {
      caseId: 'no-file-general-chat', output: JSON.stringify(prediction), prediction,
      matchedFields: ['intent', 'agent', 'skill', 'scope', 'documentSelection'], exactMatch: true, error: null,
      durationMs: 42,
    }
    const summary: IntentClassificationEvaluationSummary = {
      suiteVersion: 'intent-model-eval-2', profileId: 'router', model: 'qwen3:8b', caseCount: 1,
      parsedCount: 1, exactMatchRate: 1, intentAccuracy: 1, agentAccuracy: 1,
      skillAccuracy: 1, scopeAccuracy: 1, documentSelectionAccuracy: 1, passed: true,
    }
    writeEvaluationLog({ file: logFile, database: dbPath, profile: { id: 'router', connectionId: 'local', name: 'Router', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 16_384, hasApiKey: false, updatedAt: 1 }, connection: { id: 'local', name: 'Local', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', hasApiKey: false, updatedAt: 1 }, results: [result], summary })
    const log = JSON.parse(readFileSync(logFile, 'utf8')) as { promptVersion: string; cases: Array<{ caseId: string; durationMs: number; rawOutput: string }> }
    expect(log.promptVersion).toBe('intent-router-prompt-3')
    expect(log.cases[0]).toMatchObject({ caseId: 'no-file-general-chat', durationMs: 42, rawOutput: JSON.stringify(prediction) })
  })

  it('calls an Ollama endpoint with deterministic JSON settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: '{"intent":"general-chat"}' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const connection: ModelConnection = {
      id: 'local', name: 'Local', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', hasApiKey: false, updatedAt: 1,
    }
    const profile: ModelProfile = {
      id: 'router', connectionId: connection.id, name: 'Router', kind: connection.kind, baseUrl: connection.baseUrl,
      model: 'qwen3:8b', contextWindow: 16_384, hasApiKey: false, updatedAt: 1,
    }
    const request: ChatRequest = {
      requestId: 'test', profileId: profile.id, sourcePolicy: 'metadata-only', messages: [{ role: 'user', content: 'classify' }],
    }
    await expect(invokeModel(profile, connection, request, 3_000)).resolves.toBe('{"intent":"general-chat"}')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:11434/api/chat')
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'qwen3:8b', stream: false, think: false,
      format: expect.objectContaining({ type: 'object', additionalProperties: false }),
    })
  })
})
