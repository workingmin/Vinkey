import { describe, expect, it } from 'vitest'
import { normalizeServiceError } from './serviceError'

describe('structured service errors', () => {
  it('preserves a structured Worker failure', () => {
    expect(normalizeServiceError({
      code: 'model.transient_exhausted', category: 'model', message: '模型请求超时', retryable: true, stepId: 'map',
    })).toEqual({
      code: 'model.transient_exhausted', category: 'model', message: '模型请求超时', retryable: true, stepId: 'map',
    })
  })

  it('classifies legacy string errors without exposing transport formatting', () => {
    expect(normalizeServiceError('Error: 源文档已变化，无法恢复')).toMatchObject({
      code: 'worker.compatibility_mismatch', category: 'compatibility', retryable: false,
    })
  })
})
