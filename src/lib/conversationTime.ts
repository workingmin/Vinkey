export function formatConversationAge(updatedAt: number, currentTime = Date.now()): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || !Number.isFinite(currentTime)) return ''

  const minutes = Math.floor(Math.max(0, currentTime - updatedAt) / 60_000)
  if (minutes < 1) return '<1分钟'
  if (minutes < 60) return `${minutes}分钟`

  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}小时` : `${Math.floor(hours / 24)}天`
}
