export interface JsonSchemaError {
  path: string
  message: string
}

type JsonSchema = Record<string, unknown> | boolean

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer'
  return typeof value
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = valueType(value)
  if ((expected === 'number' || expected === 'integer') && typeof value === 'number' && !Number.isFinite(value)) return false
  return actual === expected || (expected === 'number' && actual === 'integer')
}

export function validateJsonSchema(schema: JsonSchema, value: unknown, path = '$'): JsonSchemaError[] {
  if (schema === true) return []
  if (schema === false) return [{ path, message: '该值不被 schema 允许' }]
  if (schema['x-streaming'] === true && value === undefined) return []

  const errors: JsonSchemaError[] = []
  const type = schema.type
  if (typeof type === 'string' && !matchesType(value, type)) {
    return [{ path, message: `应为 ${type}，实际为 ${valueType(value)}` }]
  }
  if (Array.isArray(type) && !type.some((candidate) => typeof candidate === 'string' && matchesType(value, candidate))) {
    return [{ path, message: `应为 ${type.join(' | ')}，实际为 ${valueType(value)}` }]
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push({ path, message: '值不在允许范围内' })
  }
  if ('const' in schema && !Object.is(schema.const, value)) {
    errors.push({ path, message: '值与固定合同不一致' })
  }

  if (typeof value === 'string') {
    const length = Array.from(value).length
    if (typeof schema.minLength === 'number' && length < schema.minLength) errors.push({ path, message: `长度不能小于 ${schema.minLength}` })
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) errors.push({ path, message: `长度不能大于 ${schema.maxLength}` })
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value)) errors.push({ path, message: '格式不匹配' })
      } catch {
        errors.push({ path, message: 'schema pattern 无效' })
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push({ path, message: `不能小于 ${schema.minimum}` })
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push({ path, message: `不能大于 ${schema.maximum}` })
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push({ path, message: `至少需要 ${schema.minItems} 项` })
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push({ path, message: `最多允许 ${schema.maxItems} 项` })
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push({ path, message: '数组项不能重复' })
    if (schema.items && (typeof schema.items === 'object' || typeof schema.items === 'boolean')) {
      value.forEach((item, index) => errors.push(...validateJsonSchema(schema.items as JsonSchema, item, `${path}[${index}]`)))
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const properties = schema.properties && typeof schema.properties === 'object'
      ? schema.properties as Record<string, JsonSchema>
      : {}
    const required = Array.isArray(schema.required) ? schema.required.filter((key): key is string => typeof key === 'string') : []
    for (const key of required) {
      if (!(key in record)) errors.push({ path: `${path}.${key}`, message: '缺少必填字段' })
    }
    for (const [key, item] of Object.entries(record)) {
      if (key in properties) errors.push(...validateJsonSchema(properties[key], item, `${path}.${key}`))
      else if (schema.additionalProperties === false) errors.push({ path: `${path}.${key}`, message: '不允许额外字段' })
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validateJsonSchema(schema.additionalProperties as JsonSchema, item, `${path}.${key}`))
      }
    }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = schema[keyword]
    if (!Array.isArray(branches)) continue
    const results = branches.map((branch) => validateJsonSchema(branch as JsonSchema, value, path))
    if (keyword === 'allOf') results.forEach((result) => errors.push(...result))
    if (keyword === 'anyOf' && !results.some((result) => result.length === 0)) errors.push({ path, message: '不满足任一可选合同' })
    if (keyword === 'oneOf' && results.filter((result) => result.length === 0).length !== 1) errors.push({ path, message: '必须且只能满足一个合同' })
  }
  return errors
}

export function assertJsonSchema(schema: JsonSchema, value: unknown, label: string): void {
  const errors = validateJsonSchema(schema, value)
  if (errors.length > 0) {
    const detail = errors.slice(0, 5).map((error) => `${error.path} ${error.message}`).join('；')
    throw new Error(`${label}不符合 schema：${detail}`)
  }
}
