export function normalizeConversationTitle(value: string, fallback = '新会话'): string {
  const normalized = value.trim().replace(/\s+/gu, ' ').slice(0, 28)
  return normalized || fallback
}

export function buildTemporaryTitle(value: string): string {
  return normalizeConversationTitle(value, '新会话')
}

export function deriveSemanticTitle(value: string, response?: string | null): string {
  if (response?.trim()) {
    const first = response
      .split(/\n+/u)
      .map((line) => line.replace(/^#{1,6}\s*|\*\*|>/gu, '').trim())
      .find((line) => line.length >= 4)
    if (first) return normalizeConversationTitle(first, buildTemporaryTitle(value))
  }
  return buildTemporaryTitle(value)
}

export function shouldUpgradeTitle(upgraded: boolean, modelAvailable: boolean, messageCount: number): boolean {
  return !upgraded && modelAvailable && messageCount >= 1
}
