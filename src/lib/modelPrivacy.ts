export function isLoopbackModelEndpoint(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    return hostname === 'localhost'
      || hostname === '::1'
      || hostname === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/u.test(hostname)
  } catch {
    return false
  }
}
