import { describe, expect, it } from 'vitest'
import {
  compareModelEvaluation, deriveModelExecutionModes, MODEL_EVALUATION_CASES, summarizeModelEvaluation,
  type ModelEvaluationObservation,
} from './modelEvaluation'

function observations(): ModelEvaluationObservation[] {
  return [
    { caseId: 'json-contract-1', output: '{"title":"雾港","keywords":["来信"]}', startedAt: 0, firstTokenAt: 100, completedAt: 1_100, outputTokens: 20 },
    { caseId: 'evidence-grounding-1', output: '结论 [source: chapter.md:2-2] [source: timeline.md:4-4]', startedAt: 0, firstTokenAt: 200, completedAt: 1_200, outputTokens: 30 },
    { caseId: 'revision-fidelity-1', output: '林晚在傍晚六点握着第七封信。', startedAt: 0, firstTokenAt: 150, completedAt: 1_150, outputTokens: 25 },
  ]
}

describe('model capability regression evaluation', () => {
  it('scores latency, throughput and task quality on a versioned suite', () => {
    const summary = summarizeModelEvaluation({ id: 'local', model: 'qwen' }, observations(), MODEL_EVALUATION_CASES)
    expect(summary.firstTokenP95Ms).toBe(200)
    expect(summary.outputTokensPerSecond).toBe(25)
    expect(summary.structuredOutputSuccessRate).toBe(1)
    expect(summary.evidenceRecall).toBe(1)
    expect(summary.revisionFaithfulness).toBe(1)
    expect(deriveModelExecutionModes(summary)).toEqual(['direct', 'bounded', 'long-text'])
  })

  it('flags quality and performance regressions against the same model baseline', () => {
    const baseline = summarizeModelEvaluation({ id: 'local', model: 'qwen' }, observations())
    const candidate = { ...baseline, firstTokenP95Ms: 1_000, evidenceRecall: 0.5 }
    const result = compareModelEvaluation(baseline, candidate)
    expect(result.passed).toBe(false)
    expect(result.regressions.map((item) => item.metric)).toEqual(['evidenceRecall', 'firstTokenP95Ms'])
  })

  it('rejects comparisons across models', () => {
    const baseline = summarizeModelEvaluation({ id: 'local', model: 'qwen' }, observations())
    expect(() => compareModelEvaluation(baseline, { ...baseline, model: 'llama' })).toThrow('同一模型')
    expect(() => compareModelEvaluation(baseline, { ...baseline, profileId: 'remote' })).toThrow('同一模型')
  })

  it('treats total latency as a capability regression', () => {
    const baseline = summarizeModelEvaluation({ id: 'local', model: 'qwen' }, observations())
    const result = compareModelEvaluation(baseline, { ...baseline, totalP95Ms: 3_000 })
    expect(result.regressions.map((item) => item.metric)).toContain('totalP95Ms')
  })

  it('rejects incomplete, duplicate or temporally invalid observations', () => {
    expect(() => summarizeModelEvaluation({ id: 'local', model: 'qwen' }, observations().slice(0, 2)))
      .toThrow('每个版本化用例')
    expect(() => summarizeModelEvaluation(
      { id: 'local', model: 'qwen' },
      [...observations().slice(0, 2), observations()[0]],
    )).toThrow('每个版本化用例')
    expect(() => summarizeModelEvaluation(
      { id: 'local', model: 'qwen' },
      observations().map((item, index) => index === 0 ? { ...item, firstTokenAt: -1 } : item),
    )).toThrow('时间或 token')
  })
})
