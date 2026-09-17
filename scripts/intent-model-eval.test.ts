import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest, ModelConnection, ModelProfile } from '../src/types'
import { invokeModel, listConfiguredProfiles, loadConfiguredRows, parseArguments } from './intent-model-eval'

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
