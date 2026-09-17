import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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
    INSERT INTO model_profiles VALUES
      ('older', 'Older', 'ollama', 'http://127.0.0.1:11434', 'qwen3:4b', 8192, 0, 1),
      ('router', 'Router', 'ollama', 'http://127.0.0.1:11434', 'qwen3:8b', 16384, 0, 2);
    INSERT INTO model_connections VALUES
      ('local', 'Local Ollama', 'ollama', 'http://127.0.0.1:11434', 0, 'none', 3);
    INSERT INTO model_profile_connections VALUES ('older', 'local'), ('router', 'local');
  `)
  database.close()
  return path
}

afterEach(() => {
  vi.unstubAllGlobals()
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('IntentRouter model evaluation CLI', () => {
  it('lists profiles and defaults to the most recently updated SQLite profile', () => {
    const dbPath = databaseFixture()
    expect(listConfiguredProfiles(dbPath).map((item) => item.id)).toEqual(['router', 'older'])
    const options = parseArguments(['--db', dbPath])
    expect(options).not.toBeNull()
    const configured = loadConfiguredRows(options!)
    expect(configured.profile).toMatchObject({ id: 'router', connectionId: 'local', model: 'qwen3:8b' })
    expect(configured.connection).toMatchObject({ id: 'local', kind: 'ollama', hasApiKey: false })
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
    ])
    expect(report).toContain('intent-model-eval-2（12 个版本化用例）')
    expect(report).toContain('[1] router（默认候选）')
    expect(report).toContain('12 个版本化用例尚未执行')
    expect(report).toContain('npm run test:intent-model -- --profile-id router')
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
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'qwen3:8b', stream: false, format: 'json', think: false })
  })
})
