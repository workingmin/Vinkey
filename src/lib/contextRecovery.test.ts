import { describe, expect, it } from 'vitest'
import { isContextRecoveryResponse } from './contextRecovery'

describe('context recovery detection', () => {
  it('recognizes literary-character context refusals', () => {
    expect(isContextRecoveryResponse('对不起，我无法提供关于特定文学作品或其角色的私人信息。')).toBe(true)
  })

  it('recognizes requests for missing source context', () => {
    expect(isContextRecoveryResponse('我缺少原文上下文，无法判断这两个人物的关系。')).toBe(true)
  })

  it('does not retry generic uncertainty', () => {
    expect(isContextRecoveryResponse('我不确定这个说法是否准确。')).toBe(false)
    expect(isContextRecoveryResponse('我无法执行删除操作。')).toBe(false)
    expect(isContextRecoveryResponse('对不起，我无法提供你的个人信息。')).toBe(false)
  })
})
