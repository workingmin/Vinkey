import { describe, expect, it } from 'vitest'
import { assertJsonSchema, validateJsonSchema } from './jsonSchema'

const schema = {
  type: 'object',
  required: ['id', 'items'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 12, pattern: '^[a-z0-9-]+$' },
    mode: { type: ['string', 'null'], enum: ['fast', 'deep', null] },
    items: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'integer', minimum: 1, maximum: 9 } },
  },
}

describe('JSON schema runtime validation', () => {
  it('validates nested objects, arrays, ranges and enums', () => {
    expect(validateJsonSchema(schema, { id: 'task-1', mode: 'fast', items: [1, 2] })).toEqual([])
    expect(validateJsonSchema(schema, { id: 'BAD', mode: 'other', items: [0, 0], extra: true }).map((error) => error.path))
      .toEqual(expect.arrayContaining(['$.id', '$.mode', '$.items', '$.items[0]', '$.items[1]', '$.extra']))
  })

  it('supports allOf, anyOf and oneOf', () => {
    expect(validateJsonSchema({ allOf: [{ type: 'string' }, { minLength: 2 }] }, 'ok')).toEqual([])
    expect(validateJsonSchema({ anyOf: [{ type: 'string' }, { type: 'number' }] }, false)).not.toEqual([])
    expect(validateJsonSchema({ oneOf: [{ type: 'integer' }, { type: 'number' }] }, 1)).not.toEqual([])
  })

  it('reports a bounded contract error', () => {
    expect(() => assertJsonSchema(schema, { id: '', items: [] }, 'Tool input')).toThrow('Tool input不符合 schema')
  })

  it('rejects non-JSON numeric values', () => {
    expect(validateJsonSchema({ type: 'number' }, Number.NaN)).not.toEqual([])
    expect(validateJsonSchema({ type: 'integer' }, Number.POSITIVE_INFINITY)).not.toEqual([])
  })
})
