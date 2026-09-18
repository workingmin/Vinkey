import { describe, expect, it } from 'vitest'
import type { ChatRequest, ChatStreamEvent, ModelConnection, ModelProfile } from '../types'
import { createTaskRequest, routeTask } from './taskRuntime'
import {
  buildIntentClassificationMessages,
  evaluateIntentClassificationOutput,
  INTENT_CLASSIFICATION_EVALUATION_CASES,
  loadConfiguredIntentModel,
  runConfiguredIntentModelEvaluation,
  summarizeIntentClassificationEvaluation,
  type IntentModelEvaluationDependencies,
} from './intentModelEvaluation'
import { parseIntentCandidateOutput } from './intentCandidates'

const connection: ModelConnection = {
  id: 'local-connection', name: 'Local Ollama', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', hasApiKey: false, updatedAt: 1,
}
const profile: ModelProfile = {
  id: 'local-profile', connectionId: connection.id, name: 'Qwen Router', kind: connection.kind,
  baseUrl: connection.baseUrl, model: 'qwen3:8b', contextWindow: 16_384, hasApiKey: false, updatedAt: 2,
}
function dependencies(stream?: IntentModelEvaluationDependencies['stream']): IntentModelEvaluationDependencies {
  return {
    listProfiles: async () => [profile],
    listConnections: async () => [connection],
    getActiveProfileId: () => profile.id,
    stream: stream ?? (async () => undefined),
  }
}

describe('IntentRouter local model evaluation', () => {
  it('keeps the versioned model cases aligned with deterministic agent routing', () => {
    for (const testCase of INTENT_CLASSIFICATION_EVALUATION_CASES) {
      const plan = routeTask(createTaskRequest({ instruction: testCase.instruction, targets: testCase.targets }))
      expect({
        intent: plan.intent,
        agent: plan.agent,
        skill: plan.skill,
        scope: plan.scope,
        documentSelection: plan.documentSelection,
      }, testCase.id).toEqual(testCase.expected)
    }
  })

  it('loads the active profile and its connection through the configured data source', async () => {
    const secondary = { ...profile, id: 'secondary', connectionId: connection.id, model: 'qwen3:4b', updatedAt: 3 }
    const source = dependencies()
    source.listProfiles = async () => [secondary, profile]
    source.getActiveProfileId = () => profile.id
    await expect(loadConfiguredIntentModel(undefined, source)).resolves.toEqual({ profile, connection })
  })

  it('rejects a missing profile connection or a non-local endpoint', async () => {
    const missing = dependencies()
    missing.listConnections = async () => []
    await expect(loadConfiguredIntentModel(profile.id, missing)).rejects.toThrow('缺少关联连接')

    const remoteConnection = { ...connection, baseUrl: 'https://models.example.com/v1' }
    const remoteProfile = { ...profile, baseUrl: remoteConnection.baseUrl }
    const remote = dependencies()
    remote.listProfiles = async () => [remoteProfile]
    remote.listConnections = async () => [remoteConnection]
    await expect(loadConfiguredIntentModel(profile.id, remote)).rejects.toThrow('只允许使用回环地址')
  })

  it('runs every case through the selected profile using metadata-only prompts', async () => {
    const requests: ChatRequest[] = []
    const stream = async (request: ChatRequest, onEvent: (event: ChatStreamEvent) => void) => {
      requests.push(request)
      const payload = JSON.parse(request.messages.at(-1)?.content ?? '{}') as { instruction: string }
      const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.instruction === payload.instruction)
      if (!testCase) throw new Error('unknown test case')
      const output = JSON.stringify(testCase.expected)
      onEvent({ type: 'chunk', content: output.slice(0, 20) })
      onEvent({ type: 'chunk', content: output.slice(20) })
      onEvent({ type: 'done' })
    }
    const result = await runConfiguredIntentModelEvaluation(profile.id, dependencies(stream), INTENT_CLASSIFICATION_EVALUATION_CASES)
    expect(result.summary).toMatchObject({
      profileId: profile.id,
      model: profile.model,
      caseCount: INTENT_CLASSIFICATION_EVALUATION_CASES.length,
      parsedCount: INTENT_CLASSIFICATION_EVALUATION_CASES.length,
      exactMatchRate: 1,
      agentAccuracy: 1,
      documentSelectionAccuracy: 1,
      candidateParseRate: 0,
      candidateTop2Recall: 0,
      clarificationRate: 0,
      passed: true,
    })
    expect(result.effectiveSummary).toMatchObject({ candidateParseRate: 0, candidateTop2Recall: 0, clarificationRate: 0, passed: false })
    expect(requests).toHaveLength(INTENT_CLASSIFICATION_EVALUATION_CASES.length)
    expect(requests.every((request) => request.profileId === profile.id && request.sourcePolicy === 'metadata-only')).toBe(true)
    expect(requests.every((request) => {
      const payload = JSON.parse(request.messages.at(-1)?.content ?? '{}') as { targets?: Array<Record<string, unknown>> }
      return payload.targets?.every((target) => !('content' in target)) ?? false
    })).toBe(true)
  })

  it('scores malformed and incorrect model output without silently accepting it', () => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES[0]
    const secondCase = { ...testCase, id: `${testCase.id}-incorrect` }
    const malformed = evaluateIntentClassificationOutput(testCase, '```json\n{}\n```')
    const extraField = evaluateIntentClassificationOutput(testCase, JSON.stringify({ ...testCase.expected, confidence: 'high' }))
    const incorrect = evaluateIntentClassificationOutput(secondCase, JSON.stringify({
      ...testCase.expected,
      agent: 'StoryDeconstruction',
    }))
    const summary = summarizeIntentClassificationEvaluation(profile, [malformed, incorrect], [testCase, secondCase])
    expect(malformed.error).toContain('有效 JSON')
    expect(extraField.error).toContain('分类合同')
    expect(incorrect.matchedFields).not.toContain('agent')
    expect(summary.passed).toBe(false)
  })

  it('parses a strict top-k candidate contract and preserves scores', () => {
    const output = JSON.stringify({
      candidates: [
        { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', modelScore: 0.62, reasonCodes: ['character-fate'] },
        { intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', modelScore: 0.38, reasonCodes: ['story-structure'] },
      ],
      needsClarification: false,
      missingFacts: [],
    })
    expect(parseIntentCandidateOutput(output)).toMatchObject({
      candidates: [{ intent: 'character-analysis', modelScore: 0.62 }, { intent: 'document-analysis', modelScore: 0.38 }],
      needsClarification: false,
    })
    expect(() => parseIntentCandidateOutput(JSON.stringify({
      candidates: [
        { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', modelScore: 0.5, reasonCodes: ['character-fate'] },
        { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', modelScore: 0.5, reasonCodes: ['character-fate'] },
      ], needsClarification: false, missingFacts: [],
    }))).toThrow('重复 Intent')
  })

  it('uses lexical evidence to resolve a candidate conflict while retaining the raw top candidate', () => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.id === 'single-long-file-analysis')!
    const result = evaluateIntentClassificationOutput(testCase, JSON.stringify({
      candidates: [
        { intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', modelScore: 0.58, reasonCodes: ['story-structure'] },
        { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', modelScore: 0.42, reasonCodes: ['character-fate'] },
      ],
      needsClarification: false,
      missingFacts: [],
    }))
    expect(result.prediction?.intent).toBe('document-analysis')
    expect(result.effectivePrediction).toMatchObject(testCase.expected)
    expect(result.exactMatch).toBe(false)
    expect(result.effectiveExactMatch).toBe(true)
    expect(result.candidateDecision).toBe('route')
    expect(result.candidateMargin).toBeCloseTo(0.16)
  })

  it('reports candidate and effective metrics for a configured model run', async () => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.id === 'single-long-file-analysis')!
    const source = dependencies(async (_request, onEvent) => {
      onEvent({ type: 'chunk', content: JSON.stringify({
        candidates: [
          { intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', modelScore: 0.58, reasonCodes: ['story-structure'] },
          { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', modelScore: 0.42, reasonCodes: ['character-fate'] },
        ], needsClarification: false, missingFacts: [],
      }) })
      onEvent({ type: 'done' })
    })
    const result = await runConfiguredIntentModelEvaluation(profile.id, source, [testCase])
    expect(result.summary).toMatchObject({ candidateParseRate: 1, candidateTop2Recall: 1, exactMatchRate: 0, passed: false })
    expect(result.effectiveSummary).toMatchObject({ candidateParseRate: 1, exactMatchRate: 1, passed: true })
  })

  it('requires clarification when candidate margin is too small', () => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.id === 'single-long-file-analysis')!
    const result = evaluateIntentClassificationOutput(testCase, JSON.stringify({
      candidates: [
        { intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', modelScore: 0.51, reasonCodes: ['story-structure'] },
        { intent: 'character-analysis', agent: 'StoryDeconstruction', skill: 'character-arc-extraction', modelScore: 0.49, reasonCodes: ['character-fate'] },
      ],
      needsClarification: false,
      missingFacts: [],
    }))
    expect(result.candidateDecision).toBe('clarify')
    expect(result.effectiveExactMatch).toBe(false)
    expect(result.resolutionSource).toBe('model')
  })

  it('adapts the legacy single-object model output into one candidate', () => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES[0]
    const result = evaluateIntentClassificationOutput(testCase, JSON.stringify(testCase.expected))
    expect(result.candidateOutput?.candidates).toHaveLength(1)
    expect(result.candidateOutput?.candidates[0]?.reasonCodes).toEqual(['legacy-single'])
    expect(result.candidateDecision).toBe('route')
  })

  it('keeps raw model scoring while resolving a high-confidence lexicon conflict', () => {
    const testCase = INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.id === 'single-long-file-analysis')!
    const result = evaluateIntentClassificationOutput(testCase, JSON.stringify({
      candidates: [{ intent: 'document-analysis', agent: 'StoryDeconstruction', skill: 'long-text-analysis', modelScore: 1, reasonCodes: ['story-structure'] }],
      needsClarification: false,
      missingFacts: [],
    }))
    expect(result.exactMatch).toBe(false)
    expect(result.effectiveExactMatch).toBe(true)
    expect(result.resolutionSource).toBe('lexicon')
    expect(result.effectivePrediction).toMatchObject(testCase.expected)
    const effective = summarizeIntentClassificationEvaluation(profile, [result], [testCase], 'effective')
    expect(effective.passed).toBe(true)
  })

  it('does not silently resolve a close mixed-intent request', () => {
    const testCase = { ...INTENT_CLASSIFICATION_EVALUATION_CASES.find((item) => item.id === 'single-long-file-analysis')!, instruction: '人物命运和情节结构' }
    const raw = { ...testCase.expected, intent: 'document-analysis', skill: 'long-text-analysis' } as const
    const result = evaluateIntentClassificationOutput(testCase, JSON.stringify(raw))
    expect(result.effectiveExactMatch).toBe(false)
    expect(result.resolutionSource).toBe('model')
  })

  it('builds a body-free classification contract', () => {
    const messages = buildIntentClassificationMessages(INTENT_CLASSIFICATION_EVALUATION_CASES[1])
    expect(messages[0]?.content).toContain('documentSelection 不需要输出，由后置层根据 targets 数量计算')
    expect(messages[0]?.content).toContain('故事主线、情节结构')
    expect(messages[0]?.content).toContain('不要把 document 目标写成 current-document')
    expect(messages.at(-1)?.content).toContain('"instruction":"分析这个文档的故事主线"')
    expect(messages.at(-1)?.content).toContain('"id":"短篇/孔乙己.txt"')
    expect(messages.at(-1)?.content).not.toContain('caseId')
    expect(messages.at(-1)?.content).not.toContain('suiteVersion')
    expect(messages.at(-1)?.content).not.toContain('content')
  })
})
