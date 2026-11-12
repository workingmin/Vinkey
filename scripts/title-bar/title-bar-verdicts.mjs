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
//   - evaluateSearchPanelEscape -> TB-MENU-003-GLOBAL-SEARCH 面板打开/关闭双向读回

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
 *
 * 判据（TB-MENU-002，收紧而非放宽）：面板必须由 AXSheet + CG 面板窗口双信号证实打开；
 * 由 AX 按下 Cancel 按钮取消（Escape 仅为后备），取消后两个信号须同时消失；
 * 菜单树/窗口数状态读回须无变化；无错误弹窗。
 * 计数只有在两侧都提供实数时才比较，缺失时不冒充 0=0。
 * @param {object} info - { panelOpened, canceled, panelClosed, cgPanelDisappeared,
 *   axSheetDismissed, stateUnchanged, projectCountBefore?, projectCountAfter?,
 *   windowCountAfter, errorDialogPresent }
 * @returns {{verdict:'preserved'|'not-preserved'|'not-observed', panelOpened:boolean,
 *   canceled:boolean, panelClosed:boolean, stateUnchanged:boolean, preserved:boolean, reason:string}}
 */
export function evaluateDirectoryCancel(info) {
  const opened = info?.panelOpened === true
  const canceledOk = info?.canceled === true
  const closed = info?.panelClosed === true
  const cgGone = info?.cgPanelDisappeared === true
  const sheetGone = info?.axSheetDismissed === true
  const stateUnchanged = info?.stateUnchanged === true
  const windowOk = (info?.windowCountAfter ?? 0) >= 1
  const noError = info?.errorDialogPresent !== true
  const before = info?.projectCountBefore
  const after = info?.projectCountAfter
  const countsProvided = typeof before === 'number' && typeof after === 'number'
  const countsMatch = countsProvided ? before === after : null
  const stateOk = stateUnchanged && windowOk && noError && countsMatch !== false
  const preserved = opened && canceledOk && closed && cgGone && sheetGone && stateOk
  const verdict = !opened ? 'not-observed'
    : preserved ? 'preserved'
      : 'not-preserved'
  const reason = !opened ? 'panel-not-opened'
    : !canceledOk ? 'cancel-failed'
      : !closed ? 'panel-not-closed'
        : !cgGone ? 'cg-panel-window-remains'
          : !sheetGone ? 'ax-sheet-remains'
            : !stateOk ? 'state-not-preserved'
              : 'ok'
  return {
    verdict,
    panelOpened: opened,
    canceled: canceledOk,
    panelClosed: closed,
    cgPanelDisappeared: cgGone,
    axSheetDismissed: sheetGone,
    stateUnchanged,
    countsMatch,
    preserved,
    reason,
  }
}

/**
 * CF-023 统一搜索面板 Escape 返回判据（TB-MENU-003-GLOBAL-SEARCH）。
 *
 * 收紧而非放宽：原生菜单项存在、面板被观察到打开、Escape 后面板被观察到关闭，
 * 三个独立信号必须同时成立。只检查「关闭」会把「面板根本没打开」误记为成功。
 * @param {{menuPresent?:boolean, panelOpened?:boolean, panelClosed?:boolean}} info
 */
export function evaluateSearchPanelEscape(info = {}) {
  const menuPresent = info.menuPresent === true
  const panelOpened = info.panelOpened === true
  const panelClosed = info.panelClosed === true
  const passed = menuPresent && panelOpened && panelClosed
  const reason = !menuPresent ? 'menu-item-missing'
    : !panelOpened ? 'panel-not-observed-open'
      : !panelClosed ? 'panel-not-closed'
        : 'ok'
  return { passed, menuPresent, panelOpened, panelClosed, reason }
}

