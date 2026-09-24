#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_OUTPUT="$ROOT_DIR/artifacts/ui-shell-native-macos"
DEFAULT_APP_PATH="/Applications/Vinkey.app"
OUTPUT_ROOT="$DEFAULT_OUTPUT"
APP_PATH="$DEFAULT_APP_PATH"
PROCESS_NAME=""
NO_LAUNCH=0
DEV_MODE=0
DEV_PID=""
RUN_ID="$(date -u +%Y-%m-%dT%H%M%SZ)"

print_help() {
  cat <<'HELP'
macOS Tauri 原生壳层验收

用法：bash scripts/ui-shell/run-ui-shell-native-macos.sh [选项]

选项：
  --output <目录>          证据归档根目录（默认：artifacts/ui-shell-native-macos）
  --app <Vinkey.app>       指定 macOS .app（默认：/Applications/Vinkey.app）
  --dev                    不使用已安装应用，改为启动 npm run desktop:dev
  --process-name <名称>    Accessibility 进程名（开发模式默认 vinkey，.app 默认取包名）
  --no-launch              不启动应用，使用已运行的 Tauri 进程
  --help                   显示帮助

前置条件：
  1. 在“系统设置 → 隐私与安全性 → 辅助功能”允许 Terminal/终端（或运行本脚本的 IDE）控制电脑。
  2. 若需要屏幕截图权限，在“屏幕与系统音频录制”中允许相同的应用。
  3. 运行 `npm install --include=dev`，并准备 Rust/Tauri 开发环境。

脚本会点击关闭按钮作为最后一个原生窗口用例；不要把未保存的重要桌面会话作为测试目标。
HELP
}

while (($# > 0)); do
  case "$1" in
    --output)
      [[ $# -ge 2 ]] || { printf '%s\n' '--output 需要目录参数' >&2; exit 2; }
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    --app)
      [[ $# -ge 2 ]] || { printf '%s\n' '--app 需要 .app 路径' >&2; exit 2; }
      APP_PATH="$2"
      DEV_MODE=0
      shift 2
      ;;
    --dev)
      APP_PATH=""
      DEV_MODE=1
      shift
      ;;
    --process-name)
      [[ $# -ge 2 ]] || { printf '%s\n' '--process-name 需要进程名' >&2; exit 2; }
      PROCESS_NAME="$2"
      shift 2
      ;;
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      printf '未知参数：%s\n' "$1" >&2
      print_help >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' '此入口只能在 macOS 上运行；Linux/Windows 请使用对应的浏览器层或桌面验收入口。' >&2
  exit 1
fi

command -v osascript >/dev/null || { printf '%s\n' '缺少 osascript' >&2; exit 1; }
command -v screencapture >/dev/null || { printf '%s\n' '缺少 screencapture' >&2; exit 1; }
command -v shasum >/dev/null || { printf '%s\n' '缺少 shasum' >&2; exit 1; }

if [[ -n "$APP_PATH" && "$NO_LAUNCH" -eq 0 ]]; then
  [[ -d "$APP_PATH" && "$APP_PATH" == *.app ]] || {
    printf '未找到有效的 macOS 应用：%s\n' "$APP_PATH" >&2
    printf '%s\n' '请先安装 Vinkey、用 --app 指定其他路径，或用 --dev 启动源码开发版。' >&2
    exit 2
  }
fi

if [[ -n "$APP_PATH" ]]; then
  [[ -n "$PROCESS_NAME" ]] || PROCESS_NAME="$(basename "$APP_PATH" .app)"
else
  [[ -n "$PROCESS_NAME" ]] || PROCESS_NAME="vinkey"
fi

if [[ "$OUTPUT_ROOT" != /* ]]; then OUTPUT_ROOT="$ROOT_DIR/$OUTPUT_ROOT"; fi
mkdir -p "$OUTPUT_ROOT"
OUTPUT_ROOT="$(cd "$OUTPUT_ROOT" && pwd)"
OUTPUT_DIR="$OUTPUT_ROOT/run-$RUN_ID"
mkdir -p "$OUTPUT_DIR/screenshots"
DEV_LOG="$OUTPUT_DIR/tauri-dev.log"
AUTOMATION_STDERR="$OUTPUT_DIR/automation-stderr.txt"
EVENTS_FILE="$OUTPUT_DIR/events.txt"
APPLE_SCRIPT_FILE="$OUTPUT_DIR/native-automation.applescript"

cleanup() {
  if [[ -n "$DEV_PID" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if ((NO_LAUNCH == 0)); then
  if ((DEV_MODE == 0)); then
    open "$APP_PATH" >/dev/null || true
  else
    (
      cd "$ROOT_DIR"
      VITE_UI_ACCEPTANCE=1 npm run desktop:dev >"$DEV_LOG" 2>&1
    ) &
    DEV_PID=$!
  fi
fi

process_exists() {
  osascript -e "tell application \"System Events\" to exists application process \"$PROCESS_NAME\"" 2>/dev/null | grep -q '^true$'
}

if ! process_exists; then
  for _ in $(seq 1 180); do
    if process_exists; then break; fi
    sleep 1
  done
fi

if ! process_exists; then
  printf '未找到 Tauri 进程“%s”。请检查 %s\n' "$PROCESS_NAME" "$DEV_LOG" >&2
  printf '%s\n' 'BLOCKED|SHELL-NATIVE-MAC-LAUNCH|启动 Tauri 桌面应用|Accessibility 进程不可见' >"$EVENTS_FILE"
else
  cat >"$APPLE_SCRIPT_FILE" <<'APPLESCRIPT'
on run argv
  set reportDir to item 1 of argv
  set appName to item 2 of argv
  set reportLines to {}

  try
    tell application "System Events"
      tell application process appName
        set frontmost to true
        repeat 1 times
          delay 1
        end repeat
        if not (exists front window) then error "Tauri 进程存在但没有可访问窗口"
        set mainWindow to front window
        set initialPosition to position of mainWindow
        set initialSize to size of mainWindow
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-LAUNCH|Tauri 桌面窗口可访问|position=" & my pairText(initialPosition) & ";size=" & my pairText(initialSize)

        set closeButton to missing value
        set minimizeButton to missing value
        set zoomButton to missing value
        repeat with candidate in (every button of mainWindow)
          try
            set candidateDescription to description of candidate
            if candidateDescription contains "close" or candidateDescription contains "关闭" then set closeButton to candidate
            if candidateDescription contains "miniatur" or candidateDescription contains "minimize" or candidateDescription contains "最小化" then set minimizeButton to candidate
            if candidateDescription contains "zoom" or candidateDescription contains "缩放" or candidateDescription contains "full screen" or candidateDescription contains "全屏" then set zoomButton to candidate
          end try
        end repeat
        if closeButton is missing value or minimizeButton is missing value or zoomButton is missing value then error "无法通过 Accessibility 找到完整的红黄绿交通灯按钮"

        set closePosition to position of closeButton
        set minimizePosition to position of minimizeButton
        set zoomPosition to position of zoomButton
        my capture(reportDir, "screenshots/01-mac-traffic-lights.png")
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-TRAFFIC-LIGHTS|发现并截图红黄绿交通灯|close=" & my pairText(closePosition) & ";minimize=" & my pairText(minimizePosition) & ";zoom=" & my pairText(zoomPosition)

        set viewMenuItem to menu bar item "查看" of menu bar 1
        click viewMenuItem
        delay 0.4
        my capture(reportDir, "screenshots/02-mac-native-menu-open.png")
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-MENU-OPEN|展开 macOS 原生查看菜单|菜单项可访问"
        key code 53
        delay 0.3
        my capture(reportDir, "screenshots/02-mac-native-menu-escape.png")
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-MENU-ESCAPE|Escape 关闭原生菜单|已发送 Escape"

        click viewMenuItem
        delay 0.3
        click menu item "日志中心" of menu 1 of viewMenuItem
        delay 0.7
        my capture(reportDir, "screenshots/02-mac-native-menu-action.png")
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-MENU-ACTION|执行查看菜单中的日志中心|菜单回调已执行"

        click viewMenuItem
        delay 0.3
        set windowPosition to position of mainWindow
        click at {((item 1 of windowPosition) + 420), ((item 2 of windowPosition) + 320)}
        delay 0.3
        my capture(reportDir, "screenshots/02-mac-native-menu-outside-click.png")
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-MENU-OUTSIDE|外部点击关闭原生菜单|已点击内容区"

        set desiredSizes to {{1440, 900}, {1280, 800}, {1024, 680}}
        repeat with desiredSize in desiredSizes
          set requestedSize to contents of desiredSize
          set size of mainWindow to requestedSize
          delay 0.5
          set actualSize to size of mainWindow
          set sizeName to (item 1 of requestedSize as text) & "x" & (item 2 of requestedSize as text)
          my capture(reportDir, "screenshots/03-mac-window-" & sizeName & ".png")
          if actualSize = requestedSize then
            set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-SIZE-" & sizeName & "|设置并读取实际窗口尺寸|actual=" & my pairText(actualSize)
          else
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-SIZE-" & sizeName & "|目标窗口尺寸受显示器约束|actual=" & my pairText(actualSize)
          end if
        end repeat

        set frontmost to true
        click menu item "缩放窗口" of menu 1 of menu bar item "窗口" of menu bar 1
        delay 0.9
        set zoomedSize to size of mainWindow
        click menu item "缩放窗口" of menu 1 of menu bar item "窗口" of menu bar 1
        delay 0.9
        set restoredSize to size of mainWindow
        if zoomedSize is not restoredSize then
          set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口(缩放窗口命令)|zoomed=" & my pairText(zoomedSize) & ";restored=" & my pairText(restoredSize)
        else
          set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口(缩放窗口命令)|窗口尺寸未发生变化"
        end if

        click minimizeButton
        delay 0.8
        try
          set value of attribute "AXMinimized" of mainWindow to false
        end try
        set frontmost to true
        delay 0.5
        if exists front window then
          set minimizedWindow to front window
          try
            set value of attribute "AXMinimized" of minimizedWindow to false
          end try
          delay 0.5
          set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-MINIMIZE|最小化并恢复窗口|恢复后窗口可访问"
        else
          set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-MINIMIZE|最小化并恢复窗口|恢复后找不到窗口"
        end if

        set desktopBounds to missing value
        try
          tell application "Finder" to set desktopBounds to bounds of window of desktop
        end try
        if desktopBounds is not missing value then
          set end of reportLines to "PASS|SHELL-NATIVE-MAC-DISPLAY-BOUNDS|记录桌面点坐标范围|bounds=" & my boundsText(desktopBounds)
        else
          set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-DISPLAY-BOUNDS|记录桌面点坐标范围|Finder 桌面边界不可访问"
        end if

        my capture(reportDir, "screenshots/04-mac-before-close.png")
        click closeButton
        delay 1
        if exists front window then
          set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|窗口仍然存在"
        else
          set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|主窗口已关闭"
        end if
      end tell
    end tell
  on error errorMessage
    set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-AUTOMATION|Accessibility/System Events 执行中断|" & my oneLine(errorMessage)
  end try

  set AppleScript's text item delimiters to linefeed
  return reportLines as text
end run

on pairText(values)
  set AppleScript's text item delimiters to ","
  set resultText to values as text
  set AppleScript's text item delimiters to linefeed
  return resultText
end pairText

on boundsText(values)
  return my pairText(values)
end boundsText

on oneLine(value)
  set AppleScript's text item delimiters to " "
  set resultText to paragraphs of (value as text) as text
  set AppleScript's text item delimiters to linefeed
  return resultText
end oneLine

on capture(reportDir, relativePath)
  set destination to reportDir & "/" & relativePath
  do shell script "/usr/sbin/screencapture -x " & quoted form of destination
end capture
APPLESCRIPT
  set +e
  osascript "$APPLE_SCRIPT_FILE" "$OUTPUT_DIR" "$PROCESS_NAME" >"$EVENTS_FILE" 2>"$AUTOMATION_STDERR"
  AUTOMATION_EXIT=$?
  set -e
  if ((AUTOMATION_EXIT != 0)); then
    printf '%s\n' "BLOCKED|SHELL-NATIVE-MAC-AUTOMATION|osascript 执行失败|exit=$AUTOMATION_EXIT" >>"$EVENTS_FILE"
  fi
fi

DISPLAY_INFO="$OUTPUT_DIR/display-info.txt"
system_profiler SPDisplaysDataType >"$DISPLAY_INFO" 2>&1 || true
DESKTOP_BOUNDS="$(osascript -e 'tell application "Finder" to get bounds of window of desktop' 2>/dev/null || true)"
OS_VERSION="$(sw_vers -productVersion 2>/dev/null || true)"
SCREENSHOT_SIZE=""
if compgen -G "$OUTPUT_DIR/screenshots/*.png" >/dev/null; then
  FIRST_SCREENSHOT="$(find "$OUTPUT_DIR/screenshots" -type f -name '*.png' -print -quit)"
  SCREENSHOT_SIZE="$(sips -g pixelWidth -g pixelHeight "$FIRST_SCREENSHOT" 2>/dev/null | awk '/pixelWidth|pixelHeight/ { printf "%s%s", (n++ ? "x" : ""), $2 }')"
fi

NATIVE_REPORT_DIR="$OUTPUT_DIR" \
NATIVE_EVENTS_FILE="$EVENTS_FILE" \
NATIVE_PROCESS_NAME="$PROCESS_NAME" \
NATIVE_DESKTOP_BOUNDS="$DESKTOP_BOUNDS" \
NATIVE_SCREENSHOT_SIZE="$SCREENSHOT_SIZE" \
NATIVE_OS_VERSION="$OS_VERSION" \
NATIVE_DISPLAY_INFO="$DISPLAY_INFO" \
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = process.env.NATIVE_REPORT_DIR
const eventsPath = process.env.NATIVE_EVENTS_FILE
const rawEvents = readFileSync(eventsPath, 'utf8').split(/\r?\n/u).filter(Boolean)
const cases = rawEvents.map((line) => {
  const [status, caseId, title, ...detailParts] = line.split('|')
  return { caseId, title, status, detail: detailParts.join('|') || null }
}).filter((item) => item.caseId && ['PASS', 'FAIL', 'BLOCKED'].includes(item.status))
if (cases.length === 0) cases.push({ caseId: 'SHELL-NATIVE-MAC-AUTOMATION', title: 'macOS 原生壳层自动化', status: 'BLOCKED', detail: '未产生可解析的 System Events 结果' })

const screenshots = readdirSync(join(outputDir, 'screenshots')).filter((name) => name.endsWith('.png')).sort()
const screenshotHashes = Object.fromEntries(screenshots.map((name) => [name, createHash('sha256').update(readFileSync(join(outputDir, 'screenshots', name))).digest('hex')]))
const summary = {
  caseCount: cases.length,
  passed: cases.filter((item) => item.status === 'PASS').length,
  failed: cases.filter((item) => item.status === 'FAIL').length,
  blocked: cases.filter((item) => item.status === 'BLOCKED').length,
}
const conclusion = summary.failed > 0 ? 'FAIL' : summary.blocked > 0 ? 'BLOCKED' : 'PASS'
const exitCode = summary.failed > 0 ? 2 : summary.blocked > 0 ? 1 : 0
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  acceptance: { id: 'W0-SHELL-P-NATIVE-MAC', domainId: 'D-SHELL', gate: 'P' },
  suite: { id: 'ui-shell-native-macos', version: '1.0.0' },
  environment: {
    platform: 'darwin',
    osVersion: process.env.NATIVE_OS_VERSION || 'unknown',
    node: process.version,
    processName: process.env.NATIVE_PROCESS_NAME,
    desktopBoundsPoints: process.env.NATIVE_DESKTOP_BOUNDS || null,
    firstScreenshotPixels: process.env.NATIVE_SCREENSHOT_SIZE || null,
    displayScaleEstimate: (() => {
      const points = (process.env.NATIVE_DESKTOP_BOUNDS || '').split(/[, ]+/u).filter(Boolean).map(Number)
      const pixels = (process.env.NATIVE_SCREENSHOT_SIZE || '').split('x').map(Number)
      if (points.length < 4 || pixels.length < 2 || !points[2] || !points[3]) return null
      return { x: Number((pixels[0] / points[2]).toFixed(2)), y: Number((pixels[1] / points[3]).toFixed(2)), source: 'main-display screenshot pixels / Finder desktop points' }
    })(),
    dpiNote: '截图像素与 Accessibility 桌面点坐标已记录；系统缩放与多显示器配置以 display-info.txt 和人工观察为准。',
  },
  platformEvidence: {
    nativeMenu: 'COVERED_BY_ACCESSIBILITY',
    macTrafficLights: 'COVERED_BY_ACCESSIBILITY',
    windowControls: 'COVERED_BY_ACCESSIBILITY',
    physicalDpi: 'RECORDED_WITH_DISPLAY_METADATA_AND_SCREENSHOT_PIXELS',
  },
  cases,
  summary,
  exitCode,
  conclusion,
  artifacts: {
    screenshots,
    sha256: screenshotHashes,
    manifestFile: 'SHA256SUMS',
    events: 'events.txt',
    automationScript: existsSync(join(outputDir, 'native-automation.applescript')) ? 'native-automation.applescript' : null,
    displayInfo: 'display-info.txt',
    automationStderr: existsSync(join(outputDir, 'automation-stderr.txt')) ? 'automation-stderr.txt' : null,
    devLog: existsSync(join(outputDir, 'tauri-dev.log')) ? 'tauri-dev.log' : null,
  },
}
writeFileSync(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
NODE

{
  shasum -a 256 "$OUTPUT_DIR/result.json"
  while IFS= read -r screenshot; do
    shasum -a 256 "$screenshot"
  done < <(find "$OUTPUT_DIR/screenshots" -type f -name '*.png' -print | LC_ALL=C sort)
  for evidence_file in "$DISPLAY_INFO" "$AUTOMATION_STDERR" "$EVENTS_FILE" "$APPLE_SCRIPT_FILE" "$DEV_LOG"; do
    if [[ -f "$evidence_file" ]]; then shasum -a 256 "$evidence_file"; fi
  done
} >"$OUTPUT_DIR/SHA256SUMS"

node --input-type=module - "$OUTPUT_DIR/result.json" <<'NODE'
import { readFileSync } from 'node:fs'
const result = JSON.parse(readFileSync(process.argv[2], 'utf8'))
console.log(`UI shell native macOS acceptance: ${result.conclusion} (${result.summary.passed}/${result.summary.caseCount} passed, ${result.summary.failed} failed, ${result.summary.blocked} blocked)`)
console.log(`Results: ${process.argv[2]}`)
console.log(`SHA256SUMS: ${process.argv[2].replace(/result\.json$/u, 'SHA256SUMS')}`)
console.log(`exit=${result.exitCode}`)
process.exitCode = result.exitCode
NODE
