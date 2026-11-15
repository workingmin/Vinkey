import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

// W4-TASK-E 前置驱动的 CLI 合同测试。这里只验证参数解析、真实数据库模型解析、
// 证据边界与产物清单一致性；不会调用模型，也不会写用户项目目录。

const repositoryRoot = resolve(import.meta.dirname, '../..')
const wrapper = join(repositoryRoot, 'scripts', 'task-process', 'run-ollama-worker-cli.mjs')
const crateDirectory = join(repositoryRoot, 'scripts', 'task-process', 'ollama-worker-cli')
const driverSource = readFileSync(join(crateDirectory, 'main.rs'), 'utf8')
const acceptanceSource = readFileSync(
  join(repositoryRoot, 'scripts', 'task-process', 'task-process-acceptance.ts'),
  'utf8',
)
const temporaryDirectories: string[] = []

function track(directory: string): string {
  temporaryDirectories.push(directory)
  return directory
}

function databaseFixture(): { directory: string; dbPath: string } {
  const directory = track(mkdtempSync(join(tmpdir(), 'vinkey-ollama-driver-cli-')))
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
      ('profile-db', '本地 Ollama', 'ollama', 'http://localhost:11434', 'qwen3:8b', 16384, 0, 1);
    INSERT INTO model_connections VALUES
      ('conn-local', '本地 Ollama', 'ollama', 'http://localhost:11434', 0, 'none', 2);
    INSERT INTO model_profile_connections VALUES ('profile-db', 'conn-local');
    INSERT INTO app_preferences VALUES ('activeModelId', 'profile-db', 3);
  `)
  database.close()
  return { directory, dbPath }
}

function runWrapper(args: string[]) {
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

describe('真实 Ollama Worker CLI 驱动 - 包装入口', () => {
  it('--help 输出用法与证据边界，退出码为 0', () => {
    const result = runWrapper(['--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--workspace')
    expect(result.stdout).toContain('--dry-run')
    expect(result.stdout).toContain('非桌面 UI 发起')
  })

  it('--dry-run 从真实 SQLite 解析当前模型，不编译、不创建工作区、不调用模型', () => {
    const { dbPath } = databaseFixture()
    const workspace = join(track(mkdtempSync(join(tmpdir(), 'vinkey-ollama-driver-ws-'))), 'nested')
    const result = runWrapper(['--dry-run', '--db', dbPath, '--workspace', workspace])
    expect(result.status).toBe(0)
    const payload = JSON.parse(result.stdout)
    expect(payload.dryRun).toBe(true)
    expect(payload.databaseModel).toEqual({
      profileId: 'profile-db',
      model: 'qwen3:8b',
      contextWindow: 16384,
      connectionKind: 'ollama',
      baseUrl: 'http://localhost:11434',
    })
    expect(payload.resolved).toEqual({
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      contextWindow: '16384',
    })
    expect(payload.driverArguments).toContain('--write-sample')
    expect(payload.driverArguments).toContain('profile-db')
    expect(payload.driverArguments).toContain('qwen3:8b')
    expect(existsSync(workspace)).toBe(false)
  })

  it('--dry-run 的显式覆盖优先于数据库值', () => {
    const { dbPath } = databaseFixture()
    const result = runWrapper([
      '--dry-run', '--db', dbPath,
      '--model', 'qwen3:14b',
      '--base-url', 'http://127.0.0.1:11434',
      '--context-window', '8192',
      '--profile-id', 'profile-db',
    ])
    expect(result.status).toBe(0)
    const payload = JSON.parse(result.stdout)
    expect(payload.resolved).toEqual({
      model: 'qwen3:14b',
      baseUrl: 'http://127.0.0.1:11434',
      contextWindow: '8192',
    })
    expect(payload.databaseModel.model).toBe('qwen3:8b')
  })

  it('数据库缺失或非当前模型时拒绝执行并给出明确原因', () => {
    const missing = join(track(mkdtempSync(join(tmpdir(), 'vinkey-ollama-driver-empty-'))), 'absent.sqlite3')
    const result = runWrapper(['--dry-run', '--db', missing])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('无法从真实 Vinkey 数据库解析模型配置')
  })

  it('未知参数返回非零退出码', () => {
    const result = runWrapper(['--unknown-flag'])
    expect(result.status).not.toBe(0)
  })
})

describe('真实 Ollama Worker CLI 驱动 - 证据边界与产物合同', () => {
  it('复用生产 worker_service.rs pipeline，不使用 stub 模型响应', () => {
    expect(driverSource).toContain('include!("../../../src-tauri/src/worker_service.rs")')
    expect(driverSource).toContain('worker_service::start(')
    expect(driverSource).toContain('reqwest::Client')
    expect(driverSource).toContain('/api/chat')
    expect(driverSource).not.toContain('database.responses')
    expect(driverSource).toContain('"stream": false')
    expect(driverSource).toContain('"think": false')
  })

  it('如实声明 CLI 发起而非桌面 UI 发起的证据边界', () => {
    expect(driverSource).toContain('非桌面 UI 发起')
    expect(driverSource).toContain('真实 Ollama')
    expect(driverSource).toContain('desktop pause/resume')
  })

  it('驱动声明的必需产物与 UI-ACC-LOGS-001 的必需产物一致', () => {
    const required = ['job-start.json', 'worker-input.json', 'worker-events.json', 'worker-checkpoints.json']
    for (const name of required) {
      expect(driverSource).toContain(`"${name}"`)
      expect(acceptanceSource).toContain(`'${name}'`)
    }
    expect(driverSource).toContain('"worker-output.json"')
  })

  it('crate 只依赖真实 HTTP 传输，不引入 mock/fixture 模型响应文件', () => {
    const cargo = readFileSync(join(crateDirectory, 'Cargo.toml'), 'utf8')
    expect(cargo).toContain('reqwest')
    expect(cargo).toContain('tempfile')
    expect(cargo).not.toContain('mockall')
  })
})
