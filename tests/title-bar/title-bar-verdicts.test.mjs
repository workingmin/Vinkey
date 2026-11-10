import { describe, expect, it } from 'vitest'
import {
  evaluateFullscreen,
  evaluateReopen,
  evaluateDirectoryCancel,
  FULLSCREEN_TOLERANCE_PX,
} from '../../scripts/title-bar/title-bar-verdicts.mjs'

// Contract tests for the TB-MENU-008 / TB-MENU-002 objective verdict logic.
// These are pure functions: no macOS/AX/CoreGraphics nor a running app required,
// so they pin the agreement between menu-ax-helper.swift output and the native runner.

describe('evaluateFullscreen (TB-MENU-008 多信号全屏交叉判定)', () => {
  it('is fullscreen when all three signals agree', () => {
    const v = evaluateFullscreen({ axFullScreen: true, axSizeMatchesDisplay: true, cgBoundsMatchesDisplay: true })
    expect(v.verdict).toBe('fullscreen')
    expect(v.score).toBe(3)
  })

  it('is fullscreen when AX true and at least one size signal agrees', () => {
    const v = evaluateFullscreen({ axFullScreen: true, axSizeMatchesDisplay: true, cgBoundsMatchesDisplay: false })
    expect(v.verdict).toBe('fullscreen')
    expect(v.score).toBe(2)
  })

  it('is not-fullscreen when AX true but size signals disagree', () => {
    const v = evaluateFullscreen({ axFullScreen: true, axSizeMatchesDisplay: false, cgBoundsMatchesDisplay: false })
    expect(v.verdict).toBe('not-fullscreen')
    expect(v.reason).toBe('ax-fullscreen-true-but-size-disagree')
  })

  it('is not-fullscreen when AX false even if size matches', () => {
    const v = evaluateFullscreen({ axFullScreen: false, axSizeMatchesDisplay: true, cgBoundsMatchesDisplay: true })
    expect(v.verdict).toBe('not-fullscreen')
  })

  it('is inconclusive when signals missing', () => {
    expect(evaluateFullscreen(null).verdict).toBe('inconclusive')
    expect(evaluateFullscreen({}).verdict).toBe('inconclusive')
    expect(evaluateFullscreen().verdict).toBe('inconclusive')
  })
})

describe('evaluateReopen (TB-MENU-008 关闭后 Reopen 恢复)', () => {
  it('reopened when hidden then restored and app still running', () => {
    const v = evaluateReopen({ windowCountBeforeClose: 0, windowCountAfterReopen: 1, appStillRunning: true })
    expect(v.verdict).toBe('reopened')
    expect(v.hiddenBeforeClose).toBe(true)
    expect(v.recovered).toBe(true)
  })

  it('not-reopened when window was not hidden after close', () => {
    const v = evaluateReopen({ windowCountBeforeClose: 1, windowCountAfterReopen: 1, appStillRunning: true })
    expect(v.verdict).toBe('not-reopened')
    expect(v.reason).toBe('window-not-hidden-after-close')
  })

  it('not-reopened when window was not restored', () => {
    const v = evaluateReopen({ windowCountBeforeClose: 0, windowCountAfterReopen: 0, appStillRunning: true })
    expect(v.verdict).toBe('not-reopened')
    expect(v.reason).toBe('window-not-restored')
  })

  it('not-reopened when the app is no longer running', () => {
    const v = evaluateReopen({ windowCountBeforeClose: 0, windowCountAfterReopen: 0, appStillRunning: false })
    expect(v.verdict).toBe('not-reopened')
    expect(v.reason).toBe('app-not-running')
  })
})

describe('evaluateDirectoryCancel (TB-MENU-002 目录选择对话框取消保态)', () => {
  it('preserved when panel opened, canceled and state unchanged', () => {
    const v = evaluateDirectoryCancel({ panelOpened: true, canceled: true, projectCountBefore: 2, projectCountAfter: 2, windowCountAfter: 1, errorDialogPresent: false })
    expect(v.verdict).toBe('preserved')
  })

  it('not-preserved when the underlying state changed', () => {
    const v = evaluateDirectoryCancel({ panelOpened: true, canceled: true, projectCountBefore: 2, projectCountAfter: 3, windowCountAfter: 1, errorDialogPresent: false })
    expect(v.verdict).toBe('not-preserved')
    expect(v.reason).toBe('state-not-preserved')
  })

  it('not-preserved when the cancel did not succeed', () => {
    const v = evaluateDirectoryCancel({ panelOpened: true, canceled: false, projectCountBefore: 2, projectCountAfter: 2, windowCountAfter: 2, errorDialogPresent: false })
    expect(v.verdict).toBe('not-preserved')
    expect(v.reason).toBe('cancel-failed')
  })

  it('not-observed when the panel never opened', () => {
    const v = evaluateDirectoryCancel({ panelOpened: false, canceled: false, projectCountBefore: 2, projectCountAfter: 2, windowCountAfter: 1, errorDialogPresent: false })
    expect(v.verdict).toBe('not-observed')
    expect(v.reason).toBe('panel-not-opened')
  })
})

it('exposes the fullscreen tolerance constant', () => {
  expect(FULLSCREEN_TOLERANCE_PX).toBe(4)
})
