export const MODEL_EVALUATION_SUITE_VERSION = 'model-eval-suite-1'
export const MODEL_CAPABILITY_REGISTRY_VERSION = 'model-capabilities-1'

export type ModelEvaluationKind = 'structured-output' | 'evidence-grounding' | 'revision-fidelity'

export interface ModelEvaluationCase {
  id: string
  kind: ModelEvaluationKind
  prompt: string
  requiredJsonKeys?: string[]
  expectedEvidence?: string[]
  fidelityAnchors?: string[]
}

export interface ModelEvaluationObservation {
  caseId: string
  output: string
  startedAt: number
  firstTokenAt: number
  completedAt: number
  outputTokens: number
}

export interface ModelEvaluationSummary {
  schemaVersion: typeof MODEL_CAPABILITY_REGISTRY_VERSION
  suiteVersion: typeof MODEL_EVALUATION_SUITE_VERSION
  profileId: string
  model: string
  caseCount: number
  firstTokenP95Ms: number
  totalP95Ms: number
  outputTokensPerSecond: number
  structuredOutputSuccessRate: number
  evidenceRecall: number
  revisionFaithfulness: number
  completedAt: number
}

export interface ModelRegressionResult {
  passed: boolean
  regressions: Array<{ metric: keyof ModelEvaluationSummary; baseline: number; candidate: number }>
}

export const MODEL_EVALUATION_CASES: ModelEvaluationCase[] = [
  {
    id: 'json-contract-1', kind: 'structured-output',
    prompt: '只返回 JSON：title 为“雾港”，keywords 为包含“来信”的数组。',
    requiredJsonKeys: ['title', 'keywords'],
  },
  {
    id: 'evidence-grounding-1', kind: 'evidence-grounding',
    prompt: '根据给定证据回答并保留 [source: ...] 标记。',
    expectedEvidence: ['chapter.md:2-2', 'timeline.md:4-4'],
  },
  {
    id: 'revision-fidelity-1', kind: 'revision-fidelity',
    prompt: '润色文本但保留人物、时间和关键物件。',
    fidelityAnchors: ['林晚', '傍晚六点', '第七封信'],
  },
]

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

function validJsonKeys(output: string, requiredKeys: string[]): boolean {
  try {
    const parsed = JSON.parse(output.trim()) as unknown
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(parsed, key)))
  } catch { return false }
}

function recall(output: string, expected: string[]): number {
  if (expected.length === 0) return 1
  return expected.filter((item) => output.includes(item)).length / expected.length
}

export function summarizeModelEvaluation(
  profile: { id: string; model: string },
  observations: ModelEvaluationObservation[],
  cases: ModelEvaluationCase[] = MODEL_EVALUATION_CASES,
): ModelEvaluationSummary {
  const caseMap = new Map(cases.map((testCase) => [testCase.id, testCase]))
  const observationIds = observations.map((item) => item.caseId)
  const completeSuite = cases.length > 0
    && observations.length === cases.length
    && new Set(observationIds).size === observations.length
    && cases.every((testCase) => observationIds.includes(testCase.id))
  if (!completeSuite || observations.some((item) => !caseMap.has(item.caseId))) {
    throw new Error('模型评测必须为每个版本化用例提供且只提供一条观测。')
  }
  if (observations.some((item) => !Number.isFinite(item.outputTokens)
    || item.outputTokens < 0
    || item.firstTokenAt < item.startedAt
    || item.completedAt < item.firstTokenAt)) {
    throw new Error('模型评测观测包含无效的时间或 token 数据。')
  }
  const firstToken = observations.map((item) => Math.max(0, item.firstTokenAt - item.startedAt))
  const total = observations.map((item) => Math.max(0, item.completedAt - item.startedAt))
  const totalOutputTokens = observations.reduce((sum, item) => sum + Math.max(0, item.outputTokens), 0)
  const generationMs = observations.reduce((sum, item) => sum + Math.max(1, item.completedAt - item.firstTokenAt), 0)
  const structured = observations.filter((item) => caseMap.get(item.caseId)?.kind === 'structured-output')
  const evidence = observations.filter((item) => caseMap.get(item.caseId)?.kind === 'evidence-grounding')
  const revisions = observations.filter((item) => caseMap.get(item.caseId)?.kind === 'revision-fidelity')
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  return {
    schemaVersion: MODEL_CAPABILITY_REGISTRY_VERSION,
    suiteVersion: MODEL_EVALUATION_SUITE_VERSION,
    profileId: profile.id,
    model: profile.model,
    caseCount: observations.length,
    firstTokenP95Ms: percentile(firstToken, 0.95),
    totalP95Ms: percentile(total, 0.95),
    outputTokensPerSecond: totalOutputTokens / (generationMs / 1000),
    structuredOutputSuccessRate: average(structured.map((item) => validJsonKeys(item.output, caseMap.get(item.caseId)?.requiredJsonKeys ?? [] ) ? 1 : 0)),
    evidenceRecall: average(evidence.map((item) => recall(item.output, caseMap.get(item.caseId)?.expectedEvidence ?? []))),
    revisionFaithfulness: average(revisions.map((item) => recall(item.output, caseMap.get(item.caseId)?.fidelityAnchors ?? []))),
    completedAt: Math.max(...observations.map((item) => item.completedAt)),
  }
}

export function compareModelEvaluation(
  baseline: ModelEvaluationSummary,
  candidate: ModelEvaluationSummary,
): ModelRegressionResult {
  if (baseline.suiteVersion !== candidate.suiteVersion
    || baseline.profileId !== candidate.profileId
    || baseline.model !== candidate.model) {
    throw new Error('只能比较同一模型配置和同一评测套件的结果。')
  }
  const regressions: ModelRegressionResult['regressions'] = []
  const lowerBound = (metric: 'structuredOutputSuccessRate' | 'evidenceRecall' | 'revisionFaithfulness', tolerance: number) => {
    if (candidate[metric] + tolerance < baseline[metric]) regressions.push({ metric, baseline: baseline[metric], candidate: candidate[metric] })
  }
  lowerBound('structuredOutputSuccessRate', 0.05)
  lowerBound('evidenceRecall', 0.05)
  lowerBound('revisionFaithfulness', 0.05)
  if (candidate.firstTokenP95Ms > baseline.firstTokenP95Ms * 1.25 + 250) {
    regressions.push({ metric: 'firstTokenP95Ms', baseline: baseline.firstTokenP95Ms, candidate: candidate.firstTokenP95Ms })
  }
  if (candidate.totalP95Ms > baseline.totalP95Ms * 1.25 + 500) {
    regressions.push({ metric: 'totalP95Ms', baseline: baseline.totalP95Ms, candidate: candidate.totalP95Ms })
  }
  if (candidate.outputTokensPerSecond + 0.5 < baseline.outputTokensPerSecond * 0.8) {
    regressions.push({ metric: 'outputTokensPerSecond', baseline: baseline.outputTokensPerSecond, candidate: candidate.outputTokensPerSecond })
  }
  return { passed: regressions.length === 0, regressions }
}

export function deriveModelExecutionModes(summary: ModelEvaluationSummary): Array<'direct' | 'bounded' | 'long-text'> {
  const modes: Array<'direct' | 'bounded' | 'long-text'> = []
  if (summary.structuredOutputSuccessRate >= 0.9 && summary.firstTokenP95Ms <= 5_000) modes.push('direct')
  if (summary.structuredOutputSuccessRate >= 0.9 && summary.revisionFaithfulness >= 0.85) modes.push('bounded')
  if (summary.evidenceRecall >= 0.8 && summary.structuredOutputSuccessRate >= 0.85) modes.push('long-text')
  return modes
}
