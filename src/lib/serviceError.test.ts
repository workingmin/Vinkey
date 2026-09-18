import { describe, expect, it } from 'vitest'
import { formatServiceError, normalizeServiceError } from './serviceError'

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

  it('does not collapse structured transport errors into object stringification', () => {
    expect(formatServiceError({
      code: 'model.output_invalid',
      category: 'model',
      message: '模型输出包含未通过校验的来源引用',
      retryable: true,
      stepId: 'map',
    })).toBe('模型输出包含未通过校验的来源引用')
    expect(formatServiceError({ detail: '后台流程失败' })).toContain('后台流程失败')
  })
})
