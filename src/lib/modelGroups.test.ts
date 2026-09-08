import { describe, expect, it } from 'vitest'
import { createGroupProfileInput, isOllamaModelInstalled, isSameOllamaModel, MINIMUM_OLLAMA_MODEL_GROUP, modelRoleForTask, readModelAssignments, recommendModel, reconcileModelAssignments, shouldStopOllamaBeforeSwitch } from './modelGroups'
import type { ModelProfile } from '../types'

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'one', name: 'Model', kind: 'ollama', baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b', contextWindow: 16_384, hasApiKey: false, updatedAt: 1,
    ...overrides,
  }
}

describe('minimum Ollama model group', () => {
  it('migrates existing roles without replacing explicit choices', () => {
    const values = [profile(), profile({ id: 'fast', model: 'openbmb/minicpm4.1:latest' })]
    expect(reconcileModelAssignments({}, values, 'one')).toEqual({ general: 'one', efficient: 'fast' })
    expect(reconcileModelAssignments({ general: 'fast', efficient: null }, values, 'one')).toEqual({ general: 'fast', efficient: null })
    expect(reconcileModelAssignments({ general: 'deleted' }, values, 'one').general).toBeNull()
  })

  it('ignores malformed persisted assignments', () => {
    expect(readModelAssignments('broken')).toEqual({})
    expect(readModelAssignments('null')).toEqual({})
    expect(readModelAssignments('{"general":42,"efficient":"fast","extra":"bad"}')).toEqual({ efficient: 'fast' })
  })

  it('routes analysis to efficient and writing or review to general', () => {
    expect(modelRoleForTask({ intent: 'document-analysis' })).toBe('efficient')
    expect(modelRoleForTask({ intent: 'workspace-analysis' })).toBe('efficient')
    expect(modelRoleForTask({ intent: 'character-analysis' })).toBe('efficient')
    expect(modelRoleForTask({ intent: 'document-revision' })).toBe('general')
    expect(modelRoleForTask({ intent: 'continuity-review' })).toBe('general')
    expect(modelRoleForTask({ intent: 'general-chat' })).toBe('general')
  })

  it('only recommends discovered chat models and allows one model for both roles', () => {
    const models = ['text-embedding-3-small', 'gpt-4.1', 'gpt-4.1-mini']
    expect(recommendModel(models, 'efficient')).toBe('gpt-4.1-mini')
    expect(recommendModel(models, 'general')).toBe('gpt-4.1')
    expect(recommendModel(['custom'], 'efficient')).toBe('custom')
    expect(recommendModel(['custom'], 'general')).toBe('custom')
    expect(recommendModel(['text-embedding-3-small'], 'efficient')).toBeNull()
    expect(recommendModel([], 'general')).toBeNull()
  })
  it('contains only minimum-tier models with stable profile ids', () => {
    expect(MINIMUM_OLLAMA_MODEL_GROUP.members.map((member) => member.model)).toEqual([
      'openbmb/minicpm4.1:latest', 'qwen3:8b',
    ])
    expect(createGroupProfileInput(MINIMUM_OLLAMA_MODEL_GROUP.members[1])).toMatchObject({
      id: 'group-minimum-zh-writing-qwen3-8b', contextWindow: 16_384, model: 'qwen3:8b',
    })
  })

  it('matches Ollama latest aliases without hiding different tags', () => {
    expect(isSameOllamaModel('model', 'model:latest')).toBe(true)
    expect(isOllamaModelInstalled(['QWEN3:8B'], 'qwen3:8b')).toBe(true)
    expect(isSameOllamaModel('qwen3:8b', 'qwen3:14b')).toBe(false)
  })

  it('stops only a different model on a local Ollama endpoint', () => {
    expect(shouldStopOllamaBeforeSwitch(profile(), profile({ id: 'two', model: 'glm4:9b' }))).toBe(true)
    expect(shouldStopOllamaBeforeSwitch(profile(), profile({ model: 'glm4:9b' }))).toBe(true)
    expect(shouldStopOllamaBeforeSwitch(profile(), profile({ id: 'two', model: 'qwen3:8b' }))).toBe(false)
    expect(shouldStopOllamaBeforeSwitch(profile({ baseUrl: 'http://192.168.1.5:11434' }), profile({ id: 'two', model: 'glm4:9b' }))).toBe(false)
    expect(shouldStopOllamaBeforeSwitch(profile({ kind: 'openai-compatible' }), profile({ id: 'two', model: 'glm4:9b' }))).toBe(false)
    expect(shouldStopOllamaBeforeSwitch(profile(), profile({ id: 'two', model: 'glm4:9b' }), false)).toBe(false)
  })
})
