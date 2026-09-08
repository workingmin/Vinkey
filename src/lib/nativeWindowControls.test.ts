// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncNativeWindowControls } from './desktop'
import { observeNativeWindowControls } from './nativeWindowControls'

vi.mock('./desktop', () => ({ syncNativeWindowControls: vi.fn() }))

describe('native window controls sidebar synchronization', () => {
  let resize: () => void
  let width: number
  let sidebar: HTMLElement
  const disconnect = vi.fn()
  const sync = vi.mocked(syncNativeWindowControls)

  beforeEach(() => {
    vi.clearAllMocks()
    sync.mockResolvedValue(undefined)
    width = 288
    sidebar = document.createElement('aside')
    vi.spyOn(sidebar, 'getBoundingClientRect').mockImplementation(() => ({ width } as DOMRect))
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('synchronizes a restored collapsed sidebar immediately', async () => {
    width = 52
    const stop = observeNativeWindowControls(sidebar, vi.fn())
    await Promise.resolve()
    expect(sync).toHaveBeenCalledExactlyOnceWith(52)
    stop()
  })

  it('keeps only the latest width while a native update is pending', async () => {
    let complete!: () => void
    sync.mockReturnValueOnce(new Promise<void>((resolve) => { complete = resolve }))
    const stop = observeNativeWindowControls(sidebar, vi.fn())
    width = 120
    resize()
    width = 52
    resize()
    expect(sync).toHaveBeenCalledTimes(1)
    complete()
    await Promise.resolve()
    expect(sync.mock.calls.map(([value]) => value)).toEqual([288, 52])
    await Promise.resolve()
    width = 288
    resize()
    expect(sync).toHaveBeenLastCalledWith(288)
    stop()
  })

  it('ignores unchanged widths and temporarily hidden sidebars', async () => {
    const stop = observeNativeWindowControls(sidebar, vi.fn())
    await Promise.resolve()
    resize()
    width = 0
    resize()
    expect(sync).toHaveBeenCalledTimes(1)
    stop()
  })

  it('disconnects and drops pending updates on cleanup', async () => {
    let complete!: () => void
    sync.mockReturnValueOnce(new Promise<void>((resolve) => { complete = resolve }))
    const onError = vi.fn()
    const stop = observeNativeWindowControls(sidebar, onError)
    width = 52
    resize()
    stop()
    complete()
    await Promise.resolve()
    resize()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports native failures and can synchronize subsequent changes', async () => {
    const error = new Error('Window unavailable')
    sync.mockRejectedValueOnce(error)
    const onError = vi.fn()
    const stop = observeNativeWindowControls(sidebar, onError)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith(error)
    width = 52
    resize()
    await Promise.resolve()
    expect(sync).toHaveBeenLastCalledWith(52)
    stop()
  })
})
