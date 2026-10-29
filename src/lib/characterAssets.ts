import type { CharacterInput, CharacterRecord } from '../types'

export interface AliasConflict {
  candidateId: string
  alias: string
  canonicalName: string
  reason: string
}

export function normalizeAlias(value: string): string {
  return value
    .trim()
    .replace(/^[《〈「『“"]+|[》〉」』”"]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function dedupeAliases(aliases: string[]): string[] {
  const seen = new Set<string>()
  return aliases
    .map(normalizeAlias)
    .filter((value) => value.length > 0)
    .filter((value) => {
      const key = Array.from(value).join('')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 50)
}

export function normalizeCharacterInput(input: CharacterInput): CharacterInput {
  return {
    ...input,
    canonicalName: normalizeAlias(input.canonicalName),
    aliases: dedupeAliases(input.aliases ?? []),
  }
}

export function resolveAliasConflicts(
  candidates: CharacterInput[],
  confirmed: Array<Pick<CharacterRecord, 'id' | 'canonicalName' | 'aliases'>>,
): AliasConflict[] {
  const conflicts: AliasConflict[] = []
  const claimed = new Map<string, string>()
  for (const item of confirmed) {
    claimed.set(`canonical:${item.canonicalName}`, item.id)
    for (const alias of item.aliases) claimed.set(`alias:${alias}`, item.id)
  }
  for (const candidate of candidates) {
    const normalized = normalizeCharacterInput(candidate)
    const canonicalOwner = claimed.get(`canonical:${normalized.canonicalName}`)
    if (canonicalOwner && canonicalOwner !== candidate.id) {
      conflicts.push({
        candidateId: candidate.id,
        alias: normalized.canonicalName,
        canonicalName: normalized.canonicalName,
        reason: `正式名已被角色 ${canonicalOwner} 占用`,
      })
    }
    for (const alias of normalized.aliases ?? []) {
      const owner = claimed.get(`alias:${alias}`)
      const canonicalOwnerByCanonical = claimed.get(`canonical:${alias}`)
      if (owner && owner !== candidate.id) {
        conflicts.push({
          candidateId: candidate.id,
          alias,
          canonicalName: normalized.canonicalName,
          reason: `别名已被角色 ${owner} 占用`,
        })
      } else if (canonicalOwnerByCanonical && canonicalOwnerByCanonical !== candidate.id) {
        conflicts.push({
          candidateId: candidate.id,
          alias,
          canonicalName: normalized.canonicalName,
          reason: `别名与角色 ${canonicalOwnerByCanonical} 的正式名冲突`,
        })
      }
    }
  }
  return conflicts
}

export function buildMentionEvidenceKey(mention: { sourceId: string; startChar: number; endChar: number }): string {
  return `${mention.sourceId}:${mention.startChar}:${mention.endChar}`
}
