import { describe, expect, it } from 'vitest'
import { buildMentionEvidenceKey, dedupeAliases, normalizeAlias, normalizeCharacterInput, resolveAliasConflicts } from './characterAssets'

describe('character asset normalization and conflict detection', () => {
  it('normalizes decorative quotes and whitespace', () => {
    expect(normalizeAlias('《 林晚 》')).toBe('林晚')
    expect(normalizeAlias('  赵 太爷 ')).toBe('赵 太爷')
  })

  it('deduplicates aliases without copy normalization', () => {
    expect(dedupeAliases(['阿晚', '阿晚', '晚儿', ''])).toEqual(['阿晚', '晚儿'])
  })

  it('prepares a clean character candidate', () => {
    expect(normalizeCharacterInput({ id: 'c', workId: 'work', canonicalName: ' 林晚 ', aliases: ['林姑娘', '林姑娘'] })).toMatchObject({
      canonicalName: '林晚',
      aliases: ['林姑娘'],
    })
  })

  it('flags canonical and alias conflicts against confirmed characters', () => {
    const conflicts = resolveAliasConflicts(
      [{ id: 'new-1', workId: 'work', canonicalName: '晚儿', aliases: ['林晚'] }],
      [{ id: 'old-1', canonicalName: '林晚', aliases: ['阿晚'] }],
    )
    expect(conflicts.map((item) => item.reason)).toEqual(['别名与角色 old-1 的正式名冲突'])
  })

  it('builds stable mention evidence keys', () => {
    expect(buildMentionEvidenceKey({ sourceId: '第一章.md', startChar: 10, endChar: 14 })).toBe('第一章.md:10:14')
  })
})
