import { syncNativeWindowControls } from './desktop'

export function observeNativeWindowControls(sidebar: HTMLElement, onError: (cause: unknown) => void): () => void {
  let disposed = false
  let syncing = false
  let pendingWidth: number | null = null
  let lastWidth: number | null = null

  const flush = async () => {
    if (syncing) return
    syncing = true
    while (!disposed && pendingWidth !== null) {
      const width = pendingWidth
      pendingWidth = null
      try {
        await syncNativeWindowControls(width)
      } catch (cause) {
        if (!disposed) onError(cause)
      }
    }
    syncing = false
  }

  const measure = () => {
    if (disposed) return
    const width = sidebar.getBoundingClientRect().width
    if (!Number.isFinite(width) || width < 40 || width === lastWidth) return
    lastWidth = width
    pendingWidth = width
    // Serialize IPC and retain the latest animation frame when native layout is still pending.
    void flush()
  }
  const observer = new ResizeObserver(measure)
  observer.observe(sidebar)
  measure()
  return () => {
    disposed = true
    pendingWidth = null
    observer.disconnect()
  }
}
