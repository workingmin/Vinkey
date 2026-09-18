import { existsSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ChatRequest, ChatStreamEvent, ModelConnection, ModelProfile } from '../../src/types'
import {
  INTENT_CLASSIFICATION_EVALUATION_CASES,
  INTENT_CLASSIFICATION_JSON_SCHEMA,
  INTENT_ROUTER_PROMPT_VERSION,
  INTENT_MODEL_EVALUATION_SUITE_VERSION,
  runConfiguredIntentModelEvaluation,
  type IntentClassificationCaseResult,
  type IntentClassificationEvaluationSummary,
  type IntentClassificationPrediction,
  type IntentModelEvaluationDependencies,
} from '../../src/lib/intentModelEvaluation'

interface CliOptions {
  dbPath: string
  profileId: string | null
  timeoutMs: number
  json: boolean
  listProfiles: boolean
  logFile: string | null
}

export function readPersistedActiveProfileId(dbPath: string): string | null {
  if (!existsSync(dbPath)) throw new Error(`未找到 Vinkey 数据库：${dbPath}`)
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const table = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_preferences'").get()
    if (!table) return null
    return (database.prepare('SELECT value FROM app_preferences WHERE key = ?').get('activeModelId') as { value?: string } | undefined)?.value ?? null
  } finally {
    database.close()
  }
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

export interface ConfiguredProfileSummary {
  id: string
  name: string
  model: string
  updatedAt: number
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
  npm run test:intent-router-acceptance -- [--profile-id <id>] [--db <path>] [--timeout-ms <ms>] [--log-file <path>] [--list-profiles] [--json]

参数：
  --profile-id <id>   指定要验收的模型 profile；未传时读取 SQLite 当前值
  --db <path>         指定 vinkey.sqlite3；默认使用当前系统的 Vinkey 应用数据目录
  --timeout-ms <ms>   每个用例的请求超时，默认 120000
  --log-file <path>   写入逐用例 JSON 诊断日志；未指定时写入系统临时目录
  --list-profiles     只检查并列出 SQLite 模型配置，不执行 ${INTENT_CLASSIFICATION_EVALUATION_CASES.length} 个评测用例
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
    logFile: null,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    if (value === '--list-profiles') { options.listProfiles = true; continue }
    if (value === '--db' || value === '--profile-id' || value === '--timeout-ms' || value === '--log-file') {
      const argument = values[index + 1]
      if (!argument) throw new Error(`参数 ${value} 缺少值。`)
      index += 1
      if (value === '--db') options.dbPath = resolve(argument)
      if (value === '--profile-id') options.profileId = argument.trim()
      if (value === '--timeout-ms') options.timeoutMs = Number(argument)
      if (value === '--log-file') options.logFile = resolve(argument)
      continue
    }
    throw new Error(`未知参数 ${value}。`)
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 900_000) {
    throw new Error('--timeout-ms 必须是 1000 到 900000 之间的整数。')
  }
  return options
}

function defaultLogFile(profileId: string): string {
  const safeProfileId = profileId.replace(/[^a-zA-Z0-9_-]/gu, '_')
  const directory = process.platform === 'win32' ? tmpdir() : '/tmp'
  return join(directory, `vinkey-intent-router-acceptance-${safeProfileId}-${Date.now()}.json`)
}

function mismatchFieldsForPrediction(prediction: IntentClassificationPrediction | null | undefined, expected: IntentClassificationPrediction | undefined): string[] {
  if (!expected || !prediction) return []
  return (['intent', 'agent', 'skill', 'scope', 'documentSelection'] as const)
    .filter((field) => prediction[field] !== expected[field])
}

function mismatchFields(result: IntentClassificationCaseResult, expected: IntentClassificationPrediction | undefined): string[] {
  return mismatchFieldsForPrediction(result.prediction, expected)
}

function diagnoseMismatchForPrediction(prediction: IntentClassificationPrediction | null | undefined, expected: IntentClassificationPrediction | undefined): string {
  if (!prediction) return 'format'
  const fields = mismatchFieldsForPrediction(prediction, expected)
  if (fields.length === 0) return 'none'
  if (fields.every((field) => field === 'documentSelection')) return 'selection-contract'
  if (fields.every((field) => field === 'scope' || field === 'documentSelection')) return 'scope-contract'
  if (fields.some((field) => field === 'intent' || field === 'agent' || field === 'skill')) return 'semantic-routing'
  return 'mixed'
}

function diagnoseMismatch(result: IntentClassificationCaseResult, expected: IntentClassificationPrediction | undefined): string {
  return diagnoseMismatchForPrediction(result.prediction, expected)
}

function diagnoseMismatchLabel(diagnosis: string): string {
  return ({
    format: '输出格式/枚举不符合合同',
    'selection-contract': '目标数量推导错误',
    'scope-contract': '作用域合同错误',
    'semantic-routing': 'Intent/Agent/Skill 语义路由错误',
    mixed: '混合字段错误',
    none: '无差异',
  } as Record<string, string>)[diagnosis] ?? diagnosis
}

export function writeEvaluationLog(input: {
  file: string
  database: string
  profile: ModelProfile
  connection: ModelConnection
  results: IntentClassificationCaseResult[]
  summary: IntentClassificationEvaluationSummary
  effectiveSummary?: IntentClassificationEvaluationSummary
}): void {
  const cases = input.results.map((result) => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.id === result.caseId)
    const expected = testCase?.expected
    return {
      caseId: result.caseId,
      instruction: testCase?.instruction ?? null,
      targets: testCase?.targets ?? [],
      expected: expected ?? null,
      prediction: result.prediction,
      effectivePrediction: result.effectivePrediction ?? result.prediction,
      matchedFields: result.matchedFields,
      effectiveMatchedFields: result.effectiveMatchedFields ?? result.matchedFields,
      mismatchFields: mismatchFields(result, expected),
      effectiveMismatchFields: mismatchFieldsForPrediction(result.effectivePrediction ?? result.prediction, expected),
      effectiveExactMatch: result.effectiveExactMatch ?? result.exactMatch,
      resolutionSource: result.resolutionSource ?? 'model',
      resolutionEvidence: result.resolutionEvidence ?? [],
      candidateOutput: result.candidateOutput ?? null,
      candidateMode: result.candidateMode ?? null,
      candidateDecision: result.candidateDecision ?? 'route',
      candidateMargin: result.candidateMargin ?? null,
      diagnosis: diagnoseMismatch(result, expected),
      effectiveDiagnosis: diagnoseMismatchForPrediction(result.effectivePrediction ?? result.prediction, expected),
      exactMatch: result.exactMatch,
      parseError: result.error,
      durationMs: result.durationMs ?? null,
      rawOutput: result.output,
    }
  })
  writeFileSync(input.file, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    promptVersion: INTENT_ROUTER_PROMPT_VERSION,
    database: input.database,
    profile: input.profile,
    connection: { ...input.connection, hasApiKey: input.connection.hasApiKey },
    summary: input.summary,
    effectiveSummary: input.effectiveSummary ?? input.summary,
    cases,
  }, null, 2), 'utf8')
}

export function listConfiguredProfiles(dbPath: string): ConfiguredProfileSummary[] {
  if (!existsSync(dbPath)) throw new Error(`未找到 Vinkey 数据库：${dbPath}`)
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare(`
      SELECT id, name, model, updated_at AS updatedAt
      FROM model_profiles
      ORDER BY updated_at DESC, id ASC
    `).all().map((row) => row as unknown as ConfiguredProfileSummary)
  } finally {
    database.close()
  }
}

export function formatProfileListReport(dbPath: string, profiles: ConfiguredProfileSummary[], activeProfileId: string | null = null): string {
  const lines = [
    'Vinkey IntentRouter 本地模型专项评测 - 配置检查',
    `数据库：${dbPath}`,
    `评测套件：${INTENT_MODEL_EVALUATION_SUITE_VERSION}（${INTENT_CLASSIFICATION_EVALUATION_CASES.length} 个版本化用例）`,
    `已配置模型：${profiles.length} 个`,
  ]
  profiles.forEach((profile, index) => {
    lines.push(`[${index + 1}] ${profile.id}${profile.id === activeProfileId ? '（当前）' : ''}`)
    lines.push(`    名称：${profile.name}`)
    lines.push(`    模型：${profile.model}`)
  })
  if (profiles.length === 0) lines.push('没有已配置的模型 profile。')
  lines.push(`说明：--list-profiles 仅检查配置，未调用模型，${INTENT_CLASSIFICATION_EVALUATION_CASES.length} 个版本化用例尚未执行。`)
  lines.push('请确认带有（当前）标记的 profile；也可显式传入对应 profile ID 执行评测。')
  return lines.join('\n')
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatEvaluationReport(input: {
  database: string
  profile: ModelProfile
  connection: ModelConnection
  results: IntentClassificationCaseResult[]
  summary: IntentClassificationEvaluationSummary
  effectiveSummary?: IntentClassificationEvaluationSummary
  logFile?: string
}): string {
  const { database, profile, connection, results, summary, effectiveSummary = summary, logFile } = input
  const passedCount = results.filter((result) => result.effectiveExactMatch ?? result.exactMatch).length
  const rawPassedCount = results.filter((result) => result.exactMatch).length
  const semanticExactCount = results.filter((result) => ['intent', 'agent', 'skill'].every((field) => result.matchedFields.includes(field as keyof IntentClassificationPrediction))).length
  const contextExactCount = results.filter((result) => ['scope', 'documentSelection'].every((field) => result.matchedFields.includes(field as keyof IntentClassificationPrediction))).length
  const effectiveSemanticExactCount = results.filter((result) => ['intent', 'agent', 'skill'].every((field) => (result.effectiveMatchedFields ?? result.matchedFields).includes(field as keyof IntentClassificationPrediction))).length
  const effectiveContextExactCount = results.filter((result) => ['scope', 'documentSelection'].every((field) => (result.effectiveMatchedFields ?? result.matchedFields).includes(field as keyof IntentClassificationPrediction))).length
  const lines = [
    'Vinkey IntentRouter 本地模型专项评测 - 验收结果',
    `数据库：${database}`,
    `评测套件：${summary.suiteVersion}`,
    `版本化用例：${summary.caseCount} 个`,
    `模型配置：${profile.name}（profileId=${profile.id}）`,
    `模型：${profile.model}（contextWindow=${profile.contextWindow}）`,
    `连接：${connection.name}（${connection.kind}，${connection.baseUrl}）`,
    '',
    `逐项结果（工程化路由精确匹配 ${passedCount}/${effectiveSummary.caseCount}；模型原始 ${rawPassedCount}/${summary.caseCount}）：`,
  ]
  results.forEach((result, index) => {
    const prediction = result.prediction
    const effectivePrediction = result.effectivePrediction ?? prediction
    const rawExactMatch = result.exactMatch
    const effectiveExactMatch = result.effectiveExactMatch ?? rawExactMatch
    const expected = INTENT_CLASSIFICATION_EVALUATION_CASES.find((testCase) => testCase.id === result.caseId)?.expected
    const detail = prediction
      ? `intent=${prediction.intent} | agent=${prediction.agent} | skill=${prediction.skill} | scope=${prediction.scope} | documentSelection=${prediction.documentSelection}`
      : `无法解析${result.error ? ` | ${result.error}` : ''}`
    lines.push(`[${String(index + 1).padStart(2, '0')}/${summary.caseCount}] ${effectiveExactMatch ? 'PASS' : 'FAIL'} ${result.caseId}（模型原始 ${rawExactMatch ? 'PASS' : 'FAIL'}）`)
    lines.push(`         ${detail}`)
    if (result.candidateOutput) {
      const candidates = [...result.candidateOutput.candidates]
        .sort((left, right) => right.modelScore - left.modelScore)
        .map((candidate) => `${candidate.intent}:${candidate.modelScore.toFixed(2)}`)
        .join(' > ')
      lines.push(`         候选排序：${candidates}`)
      lines.push(`         候选决策：${result.candidateDecision ?? 'route'}${result.candidateMargin === null || result.candidateMargin === undefined ? '' : `（margin=${result.candidateMargin.toFixed(2)}）`}`)
      if (result.candidateOutput.missingFacts.length > 0) lines.push(`         缺失事实：${result.candidateOutput.missingFacts.join('，')}`)
    }
    if (effectivePrediction && (result.resolutionSource ?? 'model') !== 'model') {
      lines.push(`         工程化结果：intent=${effectivePrediction.intent} | agent=${effectivePrediction.agent} | skill=${effectivePrediction.skill} | scope=${effectivePrediction.scope} | documentSelection=${effectivePrediction.documentSelection}`)
      lines.push(`         工程化修正来源：${result.resolutionSource ?? 'facts'}`)
      if (result.resolutionEvidence?.length) {
        lines.push(`         工程化词元证据：${result.resolutionEvidence.map((item) => `${item.token}=${item.match}`).join('，')}`)
      }
    }
    if (!effectiveExactMatch && expected) {
      lines.push(`         期望：intent=${expected.intent} | agent=${expected.agent} | skill=${expected.skill} | scope=${expected.scope} | documentSelection=${expected.documentSelection}`)
      const fields = mismatchFieldsForPrediction(effectivePrediction, expected)
      lines.push(`         归因：${diagnoseMismatchLabel(diagnoseMismatchForPrediction(effectivePrediction, expected))}`)
      lines.push(`         差异字段：${fields.join(', ') || '无法解析'}`)
      lines.push(`         输入：${INTENT_CLASSIFICATION_EVALUATION_CASES.find((testCase) => testCase.id === result.caseId)?.instruction ?? '未知'}`)
      lines.push(`         原始输出：${result.output.trim() || '<空>'}`)
    } else if (!rawExactMatch && expected) {
      lines.push(`         模型原始差异字段：${mismatchFields(result, expected).join(', ') || '无法解析'}`)
    }
  })
  lines.push(
    '',
    '汇总指标：',
    `  执行完成：${results.length}/${summary.caseCount}`,
    `  JSON 解析：${summary.parsedCount}/${summary.caseCount}（${percentage(summary.parsedCount / summary.caseCount)}）`,
    `  模型原始 Intent 准确率：${percentage(summary.intentAccuracy)}`,
    `  模型原始 Agent 准确率：${percentage(summary.agentAccuracy)}`,
    `  模型原始 Skill 准确率：${percentage(summary.skillAccuracy)}`,
    `  模型/事实原始 Scope 准确率：${percentage(summary.scopeAccuracy)}`,
    `  模型/事实原始 DocumentSelection 准确率：${percentage(summary.documentSelectionAccuracy)}`,
    `  模型原始语义路由精确匹配：${semanticExactCount}/${summary.caseCount}`,
    `  模型原始上下文合同精确匹配：${contextExactCount}/${summary.caseCount}`,
    `  模型原始全字段精确匹配率：${percentage(summary.exactMatchRate)}`,
    `  候选合同解析率：${percentage(summary.candidateParseRate)}`,
    `  候选 Top-2 召回率：${percentage(summary.candidateTop2Recall)}`,
    `  澄清请求比例：${percentage(summary.clarificationRate)}`,
    `  工程化路由语义精确匹配：${effectiveSemanticExactCount}/${effectiveSummary.caseCount}`,
    `  工程化路由上下文合同精确匹配：${effectiveContextExactCount}/${effectiveSummary.caseCount}`,
    `  工程化路由 Intent 准确率：${percentage(effectiveSummary.intentAccuracy)}`,
    `  工程化路由 Agent 准确率：${percentage(effectiveSummary.agentAccuracy)}`,
    `  工程化路由 Skill 准确率：${percentage(effectiveSummary.skillAccuracy)}`,
    `  工程化路由 Scope 准确率：${percentage(effectiveSummary.scopeAccuracy)}`,
    `  工程化路由 DocumentSelection 准确率：${percentage(effectiveSummary.documentSelectionAccuracy)}`,
    `  工程化路由全字段精确匹配率：${percentage(effectiveSummary.exactMatchRate)}`,
    `  提示合同版本：${INTENT_ROUTER_PROMPT_VERSION}`,
    ...(logFile ? [`详细诊断日志：${logFile}`] : []),
    effectiveSummary.passed
      ? summary.passed
        ? `验收结论：通过，${summary.caseCount} 个版本化用例全部执行成功且精确匹配。`
        : `验收结论：通过，工程化路由修正后 ${effectiveSummary.caseCount} 个版本化用例全部匹配；模型原始结果为 ${rawPassedCount}/${summary.caseCount}。`
      : `验收结论：未通过，工程化路由后 ${passedCount}/${effectiveSummary.caseCount} 个版本化用例精确匹配。`,
  )
  return lines.join('\n')
}

export function loadConfiguredRows(options: CliOptions): { profile: ModelProfile; connection: ModelConnection } {
  if (!existsSync(options.dbPath)) throw new Error(`未找到 Vinkey 数据库：${options.dbPath}`)
  const selectedProfileId = options.profileId?.trim() || readPersistedActiveProfileId(options.dbPath)
  if (!selectedProfileId) {
    throw new Error('数据库中没有已持久化的当前模型。请先启动新版 Vinkey 完成 activeModelId 迁移，或显式传入 --profile-id <id>。')
  }
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
      WHERE p.id = ?
      ORDER BY p.updated_at DESC, p.id ASC
      LIMIT 1
    `).get(selectedProfileId) as unknown as ModelRow | undefined
    if (!row) {
      throw new Error(selectedProfileId
        ? `数据库中找不到模型 profile：${selectedProfileId}`
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
        format: INTENT_CLASSIFICATION_JSON_SCHEMA,
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
    const activeProfileId = readPersistedActiveProfileId(options.dbPath)
    if (options.json) console.log(JSON.stringify({ database: options.dbPath, activeProfileId, profiles }, null, 2))
    else console.log(formatProfileListReport(options.dbPath, profiles, activeProfileId))
    return
  }
  const configured = loadConfiguredRows(options)
  if (!options.json) {
    console.log(`开始评测：${INTENT_MODEL_EVALUATION_SUITE_VERSION}，共 ${INTENT_CLASSIFICATION_EVALUATION_CASES.length} 个版本化用例。`)
    console.log('正在逐项调用本地模型，请等待...\n')
  }
  const evaluation = await runConfiguredIntentModelEvaluation(
    configured.profile.id,
    dependencies(configured.profile, configured.connection, options.timeoutMs),
    INTENT_CLASSIFICATION_EVALUATION_CASES,
  )
  const logFile = options.logFile ?? defaultLogFile(configured.profile.id)
  writeEvaluationLog({
    file: logFile,
    database: options.dbPath,
    profile: configured.profile,
    connection: configured.connection,
    results: evaluation.results,
    summary: evaluation.summary,
    effectiveSummary: evaluation.effectiveSummary,
  })
  if (options.json) {
    console.log(JSON.stringify({ database: options.dbPath, logFile, promptVersion: INTENT_ROUTER_PROMPT_VERSION, ...evaluation }, null, 2))
  } else {
    console.log(`提示合同：${INTENT_ROUTER_PROMPT_VERSION}`)
    console.log(formatEvaluationReport({
      database: options.dbPath,
      profile: configured.profile,
      connection: configured.connection,
      results: evaluation.results,
      summary: evaluation.summary,
      effectiveSummary: evaluation.effectiveSummary,
      logFile,
    }))
  }
  if (!evaluation.effectiveSummary.passed) process.exitCode = 2
}

if (process.env.VINKEY_INTENT_MODEL_EVAL_CLI === '1') {
  main().catch((cause) => {
    console.error(`IntentRouter 评测失败：${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
}
