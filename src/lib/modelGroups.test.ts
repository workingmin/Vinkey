import { describe, expect, it } from 'vitest'
import { createGroupProfileInput, isOllamaModelInstalled, isSameOllamaModel, MINIMUM_OLLAMA_MODEL_GROUP, shouldStopOllamaBeforeSwitch } from './modelGroups'
import type { ModelProfile } from '../types'

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'one', name: 'Model', kind: 'ollama', baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b', contextWindow: 16_384, hasApiKey: false, updatedAt: 1,
    ...overrides,
  }
}

describe('minimum Ollama model group', () => {
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
