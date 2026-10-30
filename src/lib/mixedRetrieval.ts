export interface MixedRetrievalItem {
  id: string
  title: string
  path?: string
  aliases?: string[]
  headings?: string[]
  excerpt?: string
}

function tokenize(value: string): string[] {
  const normalized = value.toLocaleLowerCase().replace(/\s+/gu, ' ')
  return normalized
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((term) => {
      const characters = Array.from(term)
      if (characters.length < 3) return [term]
      return [term, ...characters.slice(0, -1).map((_, index) => characters.slice(index, index + 2).join(''))]
    })
}

function searchableText(item: MixedRetrievalItem): string {
  return [item.title, item.path ?? '', ...(item.aliases ?? []), ...(item.headings ?? []), item.excerpt ?? '']
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase()
}

export function scoreMixedRetrieval(query: string, item: MixedRetrievalItem): number {
  const text = searchableText(item)
  const aliasText = [...(item.aliases ?? []), item.title].join('\n').toLocaleLowerCase()
  const headingText = (item.headings ?? []).join('\n').toLocaleLowerCase()
  return tokenize(query).reduce((score, term) => {
    let value = 0
    if (aliasText.includes(term)) value += 3
    else if (headingText.includes(term)) value += 2
    else if (text.includes(term)) value += 1
    return score + value
  }, 0)
}

export function retrieveMixed(items: MixedRetrievalItem[], query: string, limit = 8): MixedRetrievalItem[] {
  return items
    .map((item) => ({ item, score: scoreMixedRetrieval(query, item) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
    .slice(0, limit)
    .map(({ item }) => item)
}
