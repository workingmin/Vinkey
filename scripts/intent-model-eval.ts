import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import type { ChatRequest, ChatStreamEvent, ModelConnection, ModelProfile } from '../src/types'
import {
  INTENT_CLASSIFICATION_EVALUATION_CASES,
  runConfiguredIntentModelEvaluation,
  type IntentModelEvaluationDependencies,
} from '../src/lib/intentModelEvaluation'

interface CliOptions {
  dbPath: string
  profileId: string | null
  timeoutMs: number
  json: boolean
  listProfiles: boolean
}

interface ModelRow {
  profile_id: string
  connection_id: string | null
  profile_name: string
  model: string
  context_window: number
  profile_updated_at: number
  connection_name: string | null
  connection_kind: 'ollama' | 'openai-compatible' | null
  connection_base_url: string | null
  connection_has_api_key: number | null
  connection_updated_at: number | null
}

function defaultDatabasePath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'com.vinkey.desktop', 'vinkey.sqlite3')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) throw new Error('无法确定 Windows APPDATA，请使用 --db 显式指定 vinkey.sqlite3。')
    return join(appData, 'com.vinkey.desktop', 'vinkey.sqlite3')
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'com.vinkey.desktop', 'vinkey.sqlite3')
}

function usage(): string {
  return `Vinkey IntentRouter 本地模型专项评测

用法：
  npm run test:intent-model -- [--profile-id <id>] [--db <path>] [--timeout-ms <ms>] [--list-profiles] [--json]

参数：
  --profile-id <id>   指定模型 profile；默认使用数据库中最近更新的 profile
  --db <path>         指定 vinkey.sqlite3；默认使用当前系统的 Vinkey 应用数据目录
  --timeout-ms <ms>   每个用例的请求超时，默认 120000
  --list-profiles     只列出 SQLite 中的模型 profile，不调用模型
  --json              输出完整 JSON 结果
  -h, --help          显示帮助

环境变量：
  VINKEY_MODEL_API_KEY  当本地 OpenAI-compatible 连接需要 API Key 时使用
  VINKEY_DB_PATH        与 --db 相同，命令行参数优先
  VINKEY_PROFILE_ID     与 --profile-id 相同，命令行参数优先`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    dbPath: resolve(process.env.VINKEY_DB_PATH ?? defaultDatabasePath()),
    profileId: process.env.VINKEY_PROFILE_ID?.trim() || null,
    timeoutMs: 120_000,
    json: false,
    listProfiles: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    if (value === '--list-profiles') { options.listProfiles = true; continue }
    if (value === '--db' || value === '--profile-id' || value === '--timeout-ms') {
      const argument = values[index + 1]
      if (!argument) throw new Error(`参数 ${value} 缺少值。`)
      index += 1
      if (value === '--db') options.dbPath = resolve(argument)
      if (value === '--profile-id') options.profileId = argument.trim()
      if (value === '--timeout-ms') options.timeoutMs = Number(argument)
      continue
    }
    throw new Error(`未知参数 ${value}。`)
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 900_000) {
    throw new Error('--timeout-ms 必须是 1000 到 900000 之间的整数。')
  }
  return options
}

export function listConfiguredProfiles(dbPath: string): Array<{ id: string; name: string; model: string; updatedAt: number }> {
  if (!existsSync(dbPath)) throw new Error(`未找到 Vinkey 数据库：${dbPath}`)
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare(`
      SELECT id, name, model, updated_at AS updatedAt
      FROM model_profiles
      ORDER BY updated_at DESC, id ASC
    `).all().map((row) => row as { id: string; name: string; model: string; updatedAt: number })
  } finally {
    database.close()
  }
}

export function loadConfiguredRows(options: CliOptions): { profile: ModelProfile; connection: ModelConnection } {
  if (!existsSync(options.dbPath)) throw new Error(`未找到 Vinkey 数据库：${options.dbPath}`)
  const database = new DatabaseSync(options.dbPath, { readOnly: true })
  try {
    const row = database.prepare(`
      SELECT
        p.id AS profile_id,
        pc.connection_id AS connection_id,
        p.name AS profile_name,
        p.model AS model,
        p.context_window AS context_window,
        p.updated_at AS profile_updated_at,
        c.name AS connection_name,
        c.kind AS connection_kind,
        c.base_url AS connection_base_url,
        c.has_api_key AS connection_has_api_key,
        c.updated_at AS connection_updated_at
      FROM model_profiles p
      LEFT JOIN model_profile_connections pc ON pc.profile_id = p.id
      LEFT JOIN model_connections c ON c.id = pc.connection_id
      WHERE (? IS NULL OR p.id = ?)
      ORDER BY p.updated_at DESC, p.id ASC
      LIMIT 1
    `).get(options.profileId, options.profileId) as unknown as ModelRow | undefined
    if (!row) {
      throw new Error(options.profileId
        ? `数据库中找不到模型 profile：${options.profileId}`
        : '数据库中没有已配置的模型 profile。')
    }
    if (!row.connection_id || !row.connection_name || !row.connection_kind || !row.connection_base_url) {
      throw new Error(`模型 profile ${row.profile_id} 没有完整的 connection 关联。`)
    }
    const connection: ModelConnection = {
      id: row.connection_id,
      name: row.connection_name,
      kind: row.connection_kind,
      baseUrl: row.connection_base_url,
      hasApiKey: row.connection_has_api_key !== 0,
      updatedAt: Number(row.connection_updated_at ?? 0),
    }
    const profile: ModelProfile = {
      id: row.profile_id,
      connectionId: connection.id,
      name: row.profile_name,
      kind: connection.kind,
      baseUrl: connection.baseUrl,
      model: row.model,
      contextWindow: Number(row.context_window),
      hasApiKey: connection.hasApiKey,
      updatedAt: Number(row.profile_updated_at),
    }
    return { profile, connection }
  } finally {
    database.close()
  }
}

function endpoint(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}${suffix}`
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}：${text.slice(0, 500)}`)
  try { return JSON.parse(text) as Record<string, unknown> }
  catch { throw new Error(`模型服务未返回有效 JSON：${text.slice(0, 500)}`) }
}

export async function invokeModel(profile: ModelProfile, connection: ModelConnection, request: ChatRequest, timeoutMs: number): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs)
  if (connection.kind === 'ollama') {
    const response = await fetch(endpoint(connection.baseUrl, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: profile.model,
        messages: request.messages,
        stream: false,
        format: 'json',
        think: false,
        options: { temperature: 0, num_ctx: profile.contextWindow },
      }),
      signal,
    })
    const payload = await responseJson(response)
    const message = payload.message as { content?: unknown } | undefined
    if (typeof message?.content !== 'string') throw new Error('Ollama 响应缺少 message.content。')
    return message.content
  }

  const apiKey = process.env.VINKEY_MODEL_API_KEY?.trim()
  if (connection.hasApiKey && !apiKey) {
    throw new Error('该连接需要 API Key；命令行脚本不会读取系统凭据库，请设置 VINKEY_MODEL_API_KEY。')
  }
  const base = connection.baseUrl.replace(/\/+$/u, '')
  const response = await fetch(base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: profile.model,
      messages: request.messages,
      temperature: 0,
      stream: false,
      response_format: { type: 'json_object' },
    }),
    signal,
  })
  const payload = await responseJson(response)
  const choices = payload.choices as Array<{ message?: { content?: unknown } }> | undefined
  const content = choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('OpenAI-compatible 响应缺少 choices[0].message.content。')
  return content
}

function dependencies(profile: ModelProfile, connection: ModelConnection, timeoutMs: number): IntentModelEvaluationDependencies {
  return {
    listProfiles: async () => [profile],
    listConnections: async () => [connection],
    getActiveProfileId: () => profile.id,
    stream: async (request: ChatRequest, onEvent: (event: ChatStreamEvent) => void) => {
      try {
        const content = await invokeModel(profile, connection, request, timeoutMs)
        onEvent({ type: 'chunk', content })
        onEvent({ type: 'done' })
      } catch (cause) {
        onEvent({ type: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      }
    },
  }
}

export async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  if (!options) { console.log(usage()); return }
  if (options.listProfiles) {
    const profiles = listConfiguredProfiles(options.dbPath)
    if (options.json) console.log(JSON.stringify({ database: options.dbPath, profiles }, null, 2))
    else {
      console.log(`数据库：${options.dbPath}`)
      if (profiles.length === 0) console.log('没有已配置的模型 profile。')
      for (const profile of profiles) console.log(`${profile.id}\t${profile.name}\t${profile.model}`)
    }
    return
  }
  const configured = loadConfiguredRows(options)
  const evaluation = await runConfiguredIntentModelEvaluation(
    configured.profile.id,
    dependencies(configured.profile, configured.connection, options.timeoutMs),
    INTENT_CLASSIFICATION_EVALUATION_CASES,
  )
  if (options.json) {
    console.log(JSON.stringify({ database: options.dbPath, ...evaluation }, null, 2))
  } else {
    console.log(`数据库：${options.dbPath}`)
    console.log(`模型：${configured.profile.name} (${configured.profile.model})`)
    console.log(`连接：${configured.connection.name} (${configured.connection.baseUrl})`)
    for (const result of evaluation.results) {
      console.log(`${result.exactMatch ? 'PASS' : 'FAIL'}  ${result.caseId}${result.error ? ` - ${result.error}` : ''}`)
    }
    console.log(`Agent 准确率：${(evaluation.summary.agentAccuracy * 100).toFixed(1)}%`)
    console.log(`全字段精确匹配率：${(evaluation.summary.exactMatchRate * 100).toFixed(1)}%`)
    console.log(evaluation.summary.passed ? '结论：通过' : '结论：未通过')
  }
  if (!evaluation.summary.passed) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((cause) => {
    console.error(`IntentRouter 评测失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
