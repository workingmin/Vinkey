import type { ServiceError, ServiceErrorCategory } from '../types'

const categories = new Set<ServiceErrorCategory>([
  'model', 'compatibility', 'authorization', 'validation', 'capacity', 'io', 'internal',
])

function inferredError(message: string): ServiceError {
  if (/超时|连接中断|HTTP (?:408|429|500|502|503|504)/u.test(message)) {
    return { code: 'model.transient_exhausted', category: 'model', message, retryable: true }
  }
  if (/模型.*(?:输出|格式|返回可用内容)/u.test(message)) {
    return { code: 'model.output_invalid', category: 'model', message, retryable: true }
  }
  if (/兼容|版本已过期|配置已变化|源文档已变化|指纹/u.test(message)) {
    return { code: 'worker.compatibility_mismatch', category: 'compatibility', message, retryable: false }
  }
  if (/Dispatch|授权|权限|策略|工作区/u.test(message)) {
    return { code: 'policy.denied', category: 'authorization', message, retryable: false }
  }
  if (/无效|缺少|不匹配|不支持/u.test(message)) {
    return { code: 'worker.input_invalid', category: 'validation', message, retryable: false }
  }
  if (/超过|上限/u.test(message)) {
    return { code: 'worker.capacity_exceeded', category: 'capacity', message, retryable: false }
  }
  if (/无法(?:读取|写入|创建|删除|提交)/u.test(message)) {
    return { code: 'io.operation_failed', category: 'io', message, retryable: true }
  }
  return { code: 'service.failed', category: 'internal', message, retryable: false }
}

function parseCandidate(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const message = value.replace(/^Error:\s*/u, '').trim()
  if (message.startsWith('{') && message.endsWith('}')) {
    try { return JSON.parse(message) as unknown } catch { return message }
  }
  return message
}

export function normalizeServiceError(value: unknown): ServiceError {
  const candidate = parseCandidate(value)
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const error = candidate as Partial<ServiceError>
    if (typeof error.code === 'string' && typeof error.message === 'string'
      && typeof error.retryable === 'boolean' && typeof error.category === 'string'
      && categories.has(error.category as ServiceErrorCategory)) {
      return {
        code: error.code,
        category: error.category as ServiceErrorCategory,
        message: error.message,
        retryable: error.retryable,
        stepId: typeof error.stepId === 'string' ? error.stepId : null,
      }
    }
  }
  return inferredError(typeof candidate === 'string' ? candidate : String(value))
}

export function formatServiceError(value: unknown): string {
  return normalizeServiceError(value).message
}
