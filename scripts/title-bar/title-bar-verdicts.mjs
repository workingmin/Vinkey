// Pure verdict functions for TB-MENU-008 / TB-MENU-002 objective automation.
//
// This module is the contract between `menu-ax-helper.swift` output and
// `run-title-bar-native-acceptance.mjs`. Keeping the verdict logic here (free of
// macOS/AX/CoreGraphics imports) makes it unit-testable without a running app and
// without Accessibility permission — see tests/title-bar/title-bar-verdicts.test.mjs.
//
// The three functions mirror the plan:
//   - evaluateFullscreen  -> TB-MENU-008 多信号全屏交叉判定
//   - evaluateReopen      -> TB-MENU-008 关闭后 Reopen 恢复
//   - evaluateDirectoryCancel -> TB-MENU-002 目录选择对话框取消/失败保留原状态

export const FULLSCREEN_TOLERANCE_PX = 4

/**
 * Multi-signal fullscreen cross-check.
 * @param {object} signals - { axFullScreen:boolean, axSizeMatchesDisplay:boolean, cgBoundsMatchesDisplay:boolean }
 * @returns {{verdict:'fullscreen'|'not-fullscreen'|'inconclusive', score:number, axFullScreen:boolean, axSizeMatches:boolean, cgBoundsMatches:boolean, reason:string}}
 */
export function evaluateFullscreen(signals) {
  if (!signals || typeof signals !== 'object') {
    return { verdict: 'inconclusive', score: 0, axFullScreen: false, axSizeMatches: false, cgBoundsMatches: false, reason: 'missing-signals' }
  }
  const axFullScreen = signals.axFullScreen === true
  const axSizeMatches = signals.axSizeMatchesDisplay === true
  const cgBoundsMatches = signals.cgBoundsMatchesDisplay === true
  const score = [axFullScreen, axSizeMatches, cgBoundsMatches].filter(Boolean).length
  // Require AXFullScreen true AND at least one size signal agreeing.
  const fullscreen = axFullScreen && (axSizeMatches || cgBoundsMatches)
  if (score === 0) {
    return { verdict: 'inconclusive', score, axFullScreen, axSizeMatches, cgBoundsMatches, reason: 'no-signal-true' }
  }
  return {
    verdict: fullscreen ? 'fullscreen' : 'not-fullscreen',
    score,
    axFullScreen,
    axSizeMatches,
    cgBoundsMatches,
    reason: fullscreen ? 'ax-fullscreen-and-size-agree' : 'ax-fullscreen-true-but-size-disagree',
  }
}

/**
 * Reopen (close-then-restore) verdict.
 * @param {object} info - { windowCountBeforeClose:number, windowCountAfterReopen:number, appStillRunning:boolean }
 * @returns {{verdict:'reopened'|'not-reopened', hiddenBeforeClose:boolean, recovered:boolean, appStillRunning:boolean, reason:string}}
 */
export function evaluateReopen(info) {
  const before = info?.windowCountBeforeClose ?? 0
  const after = info?.windowCountAfterReopen ?? 0
  const running = info?.appStillRunning !== false
  const hiddenBeforeClose = before === 0
  const recovered = after > 0
  const verdict = hiddenBeforeClose && recovered && running ? 'reopened' : 'not-reopened'
  const reason = !hiddenBeforeClose ? 'window-not-hidden-after-close'
    : !running ? 'app-not-running'
      : !recovered ? 'window-not-restored'
        : 'ok'
  return { verdict, hiddenBeforeClose, recovered, appStillRunning: running, reason }
}

/**
 * Directory (open/save panel) cancel preservation verdict.
 * @param {object} info - { panelOpened:boolean, canceled:boolean, projectCountBefore:number, projectCountAfter:number, windowCountAfter:number, errorDialogPresent:boolean }
 * @returns {{verdict:'preserved'|'not-preserved'|'not-observed', panelOpened:boolean, canceled:boolean, preserved:boolean, reason:string}}
 */
export function evaluateDirectoryCancel(info) {
  const opened = info?.panelOpened === true
  const canceledOk = info?.canceled === true
  const preserved = canceledOk
    && (info?.projectCountBefore ?? -1) === (info?.projectCountAfter ?? -2)
    && (info?.windowCountAfter ?? 0) >= 1
    && info?.errorDialogPresent !== true
  const verdict = !opened ? 'not-observed'
    : opened && !preserved ? 'not-preserved'
      : 'preserved'
  const reason = !opened ? 'panel-not-opened'
    : !canceledOk ? 'cancel-failed'
      : !preserved ? 'state-not-preserved'
        : 'ok'
  return { verdict, panelOpened: opened, canceled: canceledOk, preserved, reason }
}
