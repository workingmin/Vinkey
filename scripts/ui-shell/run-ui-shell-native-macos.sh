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
macOS Tauri 原生壳层验收（W0-SHELL-P）

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
  4. 默认模式执行前完全退出已有 Vinkey 进程，以便本批次绑定新的 app.start 构建记录。
  5. 安装包应由当前干净 Git HEAD 构建；版本或 Git SHA 不一致时 provenance 用例失败。

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
WEBVIEW_DIR="$OUTPUT_DIR/webview"
WEBVIEW_STDOUT="$OUTPUT_DIR/webview-stdout.txt"
WEBVIEW_STDERR="$OUTPUT_DIR/webview-stderr.txt"
COMPANION_EXIT=1
RUN_STARTED_EPOCH_MS="$(node -e 'console.log(Date.now())')"

plist_value() {
  local key="$1"
  if [[ -n "$APP_PATH" && -f "$APP_PATH/Contents/Info.plist" ]]; then
    /usr/bin/plutil -extract "$key" raw -o - "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
  fi
}

APP_BUNDLE_ID="$(plist_value CFBundleIdentifier)"
APP_BUNDLE_VERSION="$(plist_value CFBundleShortVersionString)"
APP_BUILD_NUMBER="$(plist_value CFBundleVersion)"
APP_EXECUTABLE="$(plist_value CFBundleExecutable)"
APP_ARCHITECTURES=""
if [[ -n "$APP_PATH" && -n "$APP_EXECUTABLE" && -f "$APP_PATH/Contents/MacOS/$APP_EXECUTABLE" ]]; then
  APP_ARCHITECTURES="$(/usr/bin/lipo -archs "$APP_PATH/Contents/MacOS/$APP_EXECUTABLE" 2>/dev/null || true)"
fi
REPOSITORY_VERSION="$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).version)" "$ROOT_DIR/package.json" 2>/dev/null || true)"
REPOSITORY_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
REPOSITORY_DIRTY="false"
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then REPOSITORY_DIRTY="true"; fi
REPOSITORY_COMMITTER="$(git -C "$ROOT_DIR" log -1 --format='%an <%ae>' 2>/dev/null || true)"
MACHINE_ARCH="$(uname -m 2>/dev/null || true)"
RUST_VERSION="$(rustc --version 2>/dev/null || true)"
TAURI_CLI_VERSION=""
if [[ -x "$ROOT_DIR/node_modules/.bin/tauri" ]]; then
  TAURI_CLI_VERSION="$($ROOT_DIR/node_modules/.bin/tauri --version 2>/dev/null || true)"
fi
TAURI_FRAMEWORK_VERSION=""
if command -v cargo >/dev/null 2>&1; then
  TAURI_FRAMEWORK_VERSION="$(cargo tree --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml" -p tauri --depth 0 2>/dev/null | sed -n 's/^tauri v//p' | head -1 || true)"
fi
if [[ -n "$APP_BUNDLE_ID" ]]; then
  RUNTIME_LOG="$HOME/Library/Application Support/$APP_BUNDLE_ID/vinkey-runtime.jsonl"
else
  RUNTIME_LOG="$HOME/Library/Application Support/com.vinkey.desktop/vinkey-runtime.jsonl"
fi

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

        set expectedMenuNames to {"Vinkey", "项目", "会话", "编辑", "查看", "窗口", "帮助"}
        set menuNames to {}
        set menuContractMatches to false
        repeat 10 times
          set menuNames to name of every menu bar item of menu bar 1
          set allExpectedMenusPresent to true
          repeat with expectedName in expectedMenuNames
            if menuNames does not contain (expectedName as text) then set allExpectedMenusPresent to false
          end repeat
          if allExpectedMenusPresent is true then
            if menuNames does not contain "文件" then
              set menuContractMatches to true
              exit repeat
            end if
          end if
          delay 0.3
        end repeat
        if menuContractMatches then
          set end of reportLines to "PASS|SHELL-NATIVE-MAC-MENU-CONTRACT-GUARD|截图前核对目标菜单合同|menus=" & my pairText(menuNames) & ";scope=guard-only"
        else
          set end of reportLines to "FAIL|SHELL-NATIVE-MAC-MENU-CONTRACT-GUARD|截图前核对目标菜单合同|menus=" & my pairText(menuNames) & ";expected=Vinkey,项目,会话,编辑,查看,窗口,帮助;scope=guard-only"
        end if

        set trafficLightPositions to my inspectTrafficLights(appName)
        set closePosition to item 1 of trafficLightPositions
        set minimizePosition to item 2 of trafficLightPositions
        set zoomPosition to item 3 of trafficLightPositions
        if closePosition is missing value or minimizePosition is missing value or zoomPosition is missing value then error "无法通过 Accessibility 找到完整的红黄绿交通灯按钮"

        my capture(reportDir, "screenshots/01-mac-traffic-lights.png")
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-TRAFFIC-LIGHTS|发现并截图红黄绿交通灯|close=" & my pairText(closePosition) & ";minimize=" & my pairText(minimizePosition) & ";zoom=" & my pairText(zoomPosition)

        set desiredSizes to {{1440, 900}, {1280, 800}, {1024, 680}}
        repeat with desiredSize in desiredSizes
          set requestedSize to contents of desiredSize
          if not (exists front window) then error "调整窗口尺寸前找不到主窗口"
          set mainWindow to front window
          set size of mainWindow to requestedSize
          delay 0.5
          set actualSize to size of mainWindow
          set sizeName to (item 1 of requestedSize as text) & "x" & (item 2 of requestedSize as text)
          my capture(reportDir, "screenshots/02-mac-window-" & sizeName & ".png")
          if actualSize = requestedSize then
            set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-SIZE-" & sizeName & "|设置并读取实际窗口尺寸|actual=" & my pairText(actualSize)
          else
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-SIZE-" & sizeName & "|目标窗口尺寸受显示器约束|actual=" & my pairText(actualSize)
          end if
        end repeat

        try
          set zoomPress to my pressTrafficLight(appName, "zoom")
          if zoomPress is missing value then
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口|无法重新查询并按下绿色交通灯"
          else
            delay 0.9
            set zoomedSize to my frontWindowSize(appName)
            set restoreMethod to my pressTrafficLight(appName, "zoom")
            if restoreMethod is missing value then
              set restoreMenuNames to {"缩放窗口"}
              if zoomPress contains "full screen" or zoomPress contains "全屏" or zoomPress contains "AXFullScreenButton" then set restoreMenuNames to {"退出全屏", "进入全屏", "缩放窗口"}
              set restoreMenuItem to my pressWindowMenuItem(appName, restoreMenuNames)
              if restoreMenuItem is not missing value then set restoreMethod to "menu-recovery:" & restoreMenuItem
            end if
            if restoreMethod is missing value then
              set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口|绿色交通灯在状态切换后不可访问，且系统窗口菜单恢复失败;press=" & zoomPress
            else
              delay 0.9
              set restoredSize to my frontWindowSize(appName)
              if zoomedSize is missing value or restoredSize is missing value then
                set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口|状态切换后窗口尺寸不可读取;press=" & zoomPress & ";restore=" & restoreMethod
              else if zoomedSize is not restoredSize then
                set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口|zoomed=" & my pairText(zoomedSize) & ";restored=" & my pairText(restoredSize) & ";press=" & zoomPress & ";restore=" & restoreMethod
              else
                set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口|窗口尺寸未发生变化;press=" & zoomPress & ";restore=" & restoreMethod
              end if
            end if
          end if
        on error zoomError
          set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-ZOOM|最大化/还原窗口|" & my oneLine(zoomError)
        end try

        try
          set minimizePress to my pressTrafficLight(appName, "minimize")
          if minimizePress is missing value then
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-MINIMIZE|最小化并恢复窗口|无法重新查询并按下黄色交通灯"
          else
            delay 0.8
            if my restoreMinimizedWindow(appName) then
              set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-MINIMIZE|最小化并恢复窗口|已观察 AXMinimized 并恢复;press=" & minimizePress
            else
              set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-MINIMIZE|最小化并恢复窗口|未观察到最小化状态或恢复后找不到窗口;press=" & minimizePress
            end if
          end if
        on error minimizeError
          set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-MINIMIZE|最小化并恢复窗口|" & my oneLine(minimizeError)
        end try

        set desktopBounds to missing value
        try
          tell application "Finder" to set desktopBounds to bounds of window of desktop
        end try
        if desktopBounds is not missing value then
          set end of reportLines to "PASS|SHELL-NATIVE-MAC-DISPLAY-BOUNDS|记录桌面点坐标范围|bounds=" & my boundsText(desktopBounds)
        else
          set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-DISPLAY-BOUNDS|记录桌面点坐标范围|Finder 桌面边界不可访问"
        end if

        try
          my capture(reportDir, "screenshots/03-mac-before-close.png")
          set closePress to my pressTrafficLight(appName, "close")
          if closePress is missing value then
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|无法重新查询并按下红色交通灯"
          else
            delay 1
            if my processHasWindow(appName) then
              set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|窗口仍然存在;press=" & closePress
            else
              set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|主窗口已关闭;press=" & closePress
            end if
          end if
        on error closeError
          set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|" & my oneLine(closeError)
        end try
      end tell
    end tell
  on error errorMessage
    set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-AUTOMATION|Accessibility/System Events 执行中断|" & my oneLine(errorMessage)
  end try

  set AppleScript's text item delimiters to linefeed
  return reportLines as text
end run

on windowButtonMatches(buttonKind, candidateDescription, candidateSubrole)
  if buttonKind is "close" then
    if candidateSubrole is "AXCloseButton" then return true
    if candidateDescription contains "close" or candidateDescription contains "关闭" then return true
  else if buttonKind is "minimize" then
    if candidateSubrole is "AXMinimizeButton" then return true
    if candidateDescription contains "miniatur" or candidateDescription contains "minimize" or candidateDescription contains "最小化" then return true
  else if buttonKind is "zoom" then
    if candidateSubrole is "AXZoomButton" or candidateSubrole is "AXFullScreenButton" then return true
    if candidateDescription contains "zoom" or candidateDescription contains "缩放" or candidateDescription contains "full screen" or candidateDescription contains "全屏" then return true
  end if
  return false
end windowButtonMatches

on inspectTrafficLights(appName)
  set closePosition to missing value
  set minimizePosition to missing value
  set zoomPosition to missing value
  tell application "System Events"
    tell application process appName
      if not (exists front window) then return {closePosition, minimizePosition, zoomPosition}
      set currentButtons to every button of front window
      repeat with candidateReference in currentButtons
        try
          set candidateButton to contents of candidateReference
          set candidateDescription to ""
          set candidateSubrole to ""
          try
            set candidateDescription to (description of candidateButton) as text
          end try
          try
            set candidateSubrole to (value of attribute "AXSubrole" of candidateButton) as text
          end try
          if my windowButtonMatches("close", candidateDescription, candidateSubrole) then set closePosition to position of candidateButton
          if my windowButtonMatches("minimize", candidateDescription, candidateSubrole) then set minimizePosition to position of candidateButton
          if my windowButtonMatches("zoom", candidateDescription, candidateSubrole) then set zoomPosition to position of candidateButton
        end try
      end repeat
    end tell
  end tell
  return {closePosition, minimizePosition, zoomPosition}
end inspectTrafficLights

on pressTrafficLight(appName, buttonKind)
  set pressedDetail to missing value
  tell application "System Events"
    tell application process appName
      set frontmost to true
      if not (exists front window) then return missing value
      set currentButtons to every button of front window
      repeat with candidateReference in currentButtons
        try
          set candidateButton to contents of candidateReference
          set candidateDescription to ""
          set candidateSubrole to ""
          try
            set candidateDescription to (description of candidateButton) as text
          end try
          try
            set candidateSubrole to (value of attribute "AXSubrole" of candidateButton) as text
          end try
          if my windowButtonMatches(buttonKind, candidateDescription, candidateSubrole) then
            perform action "AXPress" of candidateButton
            set pressedDetail to candidateSubrole & ":" & candidateDescription
            exit repeat
          end if
        end try
      end repeat
    end tell
  end tell
  return pressedDetail
end pressTrafficLight

on pressWindowMenuItem(appName, itemNames)
  tell application "System Events"
    tell application process appName
      set frontmost to true
      if not (exists menu bar item "窗口" of menu bar 1) then return missing value
      set windowMenu to menu bar item "窗口" of menu bar 1
      repeat with itemNameReference in itemNames
        set itemName to contents of itemNameReference
        try
          if exists menu item itemName of menu 1 of windowMenu then
            click menu item itemName of menu 1 of windowMenu
            return itemName
          end if
        end try
      end repeat
    end tell
  end tell
  return missing value
end pressWindowMenuItem

on frontWindowSize(appName)
  tell application "System Events"
    tell application process appName
      if exists front window then return size of front window
    end tell
  end tell
  return missing value
end frontWindowSize

on restoreMinimizedWindow(appName)
  set minimizedObserved to false
  tell application "System Events"
    tell application process appName
      repeat 10 times
        set currentWindows to every window
        repeat with windowReference in currentWindows
          try
            set candidateWindow to contents of windowReference
            if (value of attribute "AXMinimized" of candidateWindow) is true then
              set minimizedObserved to true
              set value of attribute "AXMinimized" of candidateWindow to false
            end if
          end try
        end repeat
        if minimizedObserved then exit repeat
        delay 0.1
      end repeat
      set frontmost to true
      delay 0.3
      if minimizedObserved and (exists front window) then return true
    end tell
  end tell
  return false
end restoreMinimizedWindow

on processHasWindow(appName)
  tell application "System Events"
    tell application process appName
      return exists front window
    end tell
  end tell
end processHasWindow

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

# The native batch also carries the same-version WebView interaction evidence.
# Keep it in a child directory so its own result/manifest remain independently inspectable.
mkdir -p "$WEBVIEW_DIR"
set +e
node "$ROOT_DIR/scripts/ui-shell/run-ui-shell-acceptance.mjs" \
  --platform darwin \
  --skip-native-evidence \
  --output "$WEBVIEW_DIR" \
  --output-exact \
  >"$WEBVIEW_STDOUT" 2>"$WEBVIEW_STDERR"
COMPANION_EXIT=$?
set -e
if ((COMPANION_EXIT != 0)); then
  printf 'WebView companion exited with code %s\n' "$COMPANION_EXIT" >>"$WEBVIEW_STDERR"
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
NATIVE_APP_PATH="$APP_PATH" \
NATIVE_APP_BUNDLE_ID="$APP_BUNDLE_ID" \
NATIVE_APP_VERSION="$APP_BUNDLE_VERSION" \
NATIVE_APP_BUILD_NUMBER="$APP_BUILD_NUMBER" \
NATIVE_APP_EXECUTABLE="$APP_EXECUTABLE" \
NATIVE_APP_ARCHITECTURES="$APP_ARCHITECTURES" \
NATIVE_RUNTIME_LOG="$RUNTIME_LOG" \
NATIVE_REPOSITORY_VERSION="$REPOSITORY_VERSION" \
NATIVE_REPOSITORY_SHA="$REPOSITORY_SHA" \
NATIVE_REPOSITORY_DIRTY="$REPOSITORY_DIRTY" \
NATIVE_REPOSITORY_COMMITTER="$REPOSITORY_COMMITTER" \
NATIVE_MACHINE_ARCH="$MACHINE_ARCH" \
NATIVE_RUST_VERSION="$RUST_VERSION" \
NATIVE_TAURI_CLI_VERSION="$TAURI_CLI_VERSION" \
NATIVE_TAURI_FRAMEWORK_VERSION="$TAURI_FRAMEWORK_VERSION" \
NATIVE_COMPANION_EXIT="$COMPANION_EXIT" \
NATIVE_WEBVIEW_RESULT="$WEBVIEW_DIR/result.json" \
NATIVE_RUN_STARTED_EPOCH_MS="$RUN_STARTED_EPOCH_MS" \
NATIVE_NO_LAUNCH="$NO_LAUNCH" \
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = process.env.NATIVE_REPORT_DIR
const eventsPath = process.env.NATIVE_EVENTS_FILE
const rawEvents = readFileSync(eventsPath, 'utf8').split(/\r?\n/u).filter(Boolean)
const cases = rawEvents.map((line) => {
  const [status, caseId, title, ...detailParts] = line.split('|')
  return { caseId, title, status, source: 'native-accessibility', detail: detailParts.join('|') || null }
}).filter((item) => item.caseId && ['PASS', 'FAIL', 'BLOCKED'].includes(item.status))
if (cases.length === 0) cases.push({ caseId: 'SHELL-NATIVE-MAC-AUTOMATION', title: 'macOS 原生壳层自动化', status: 'BLOCKED', detail: '未产生可解析的 System Events 结果' })

const companionResultPath = process.env.NATIVE_WEBVIEW_RESULT
let companionResult = null
if (companionResultPath && existsSync(companionResultPath)) {
  try {
    companionResult = JSON.parse(readFileSync(companionResultPath, 'utf8'))
    for (const item of companionResult.cases ?? []) cases.push({ ...item, source: 'playwright-webview' })
  } catch (error) {
    cases.push({ caseId: 'SHELL-WEBVIEW-COMPANION', title: 'Playwright WebView 交互伴随套件', status: 'BLOCKED', source: 'playwright-webview', detail: `无法读取伴随结果：${String(error)}` })
  }
} else {
  cases.push({ caseId: 'SHELL-WEBVIEW-COMPANION', title: 'Playwright WebView 交互伴随套件', status: 'BLOCKED', source: 'playwright-webview', detail: `未生成 webview/result.json（exit=${process.env.NATIVE_COMPANION_EXIT || 'unknown'}）` })
}

const screenshots = readdirSync(join(outputDir, 'screenshots')).filter((name) => name.endsWith('.png')).sort()
const screenshotHashes = Object.fromEntries(screenshots.map((name) => [name, createHash('sha256').update(readFileSync(join(outputDir, 'screenshots', name))).digest('hex')]))
const readRuntimeStart = () => {
  const runtimePath = process.env.NATIVE_RUNTIME_LOG
  if (!runtimePath || !existsSync(runtimePath)) return null
  const minimumTimestamp = Number(process.env.NATIVE_RUN_STARTED_EPOCH_MS || 0) - 5_000
  const requireCurrentRun = process.env.NATIVE_NO_LAUNCH !== '1'
  const lines = readFileSync(runtimePath, 'utf8').split(/\r?\n/u).reverse()
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.event === 'app.start' && (!requireCurrentRun || Number(entry.timestamp) >= minimumTimestamp)) return entry
    } catch { /* ignore an incomplete trailing log line */ }
  }
  return null
}
const runtimeStart = readRuntimeStart()
const runtimeFields = runtimeStart?.fields ?? {}
const applicationGitSha = typeof runtimeFields.commitSha === 'string' ? runtimeFields.commitSha : null
const applicationBuildTime = runtimeFields.buildTime ?? null
const applicationDirty = typeof runtimeFields.workingTreeDirty === 'boolean' ? runtimeFields.workingTreeDirty : null
const application = {
  path: process.env.NATIVE_APP_PATH || null,
  bundleIdentifier: process.env.NATIVE_APP_BUNDLE_ID || null,
  version: process.env.NATIVE_APP_VERSION || null,
  buildNumber: process.env.NATIVE_APP_BUILD_NUMBER || null,
  executable: process.env.NATIVE_APP_EXECUTABLE || null,
  architectures: process.env.NATIVE_APP_ARCHITECTURES?.split(/\s+/u).filter(Boolean) ?? [],
  gitSha: applicationGitSha,
  gitShaEvidence: applicationGitSha ? 'app.start runtime log (VINKEY_COMMIT_SHA)' : 'UNAVAILABLE: installed app runtime log did not expose VINKEY_COMMIT_SHA',
  buildTimeEpochMs: applicationBuildTime,
  workingTreeDirtyAtBuild: applicationDirty,
  runtimeLog: existsSync(process.env.NATIVE_RUNTIME_LOG || '') ? 'runtime log observed locally; path omitted from report' : null,
}
const repository = {
  version: process.env.NATIVE_REPOSITORY_VERSION || null,
  gitSha: process.env.NATIVE_REPOSITORY_SHA || null,
  dirty: process.env.NATIVE_REPOSITORY_DIRTY === 'true',
  lastCommitter: process.env.NATIVE_REPOSITORY_COMMITTER || null,
}
const applicationShaAvailable = typeof application.gitSha === 'string' && /^[0-9a-f]{7,40}$/iu.test(application.gitSha)
const repositoryShaAvailable = typeof repository.gitSha === 'string' && /^[0-9a-f]{7,40}$/iu.test(repository.gitSha)
const versionsMatch = application.version && repository.version && application.version === repository.version
const commitsMatch = applicationShaAvailable && repositoryShaAvailable && (
  application.gitSha === repository.gitSha
  || application.gitSha.startsWith(repository.gitSha)
  || repository.gitSha.startsWith(application.gitSha)
)
let provenanceStatus = 'PASS'
let provenanceDetail = `version=${application.version};gitSha=${application.gitSha}`
if (!application.version || !applicationShaAvailable || !repositoryShaAvailable) {
  provenanceStatus = 'BLOCKED'
  provenanceDetail = '安装应用未暴露版本或 VINKEY_COMMIT_SHA，无法证明 WebView companion 与安装包同版本'
} else if (!versionsMatch || !commitsMatch) {
  provenanceStatus = 'FAIL'
  provenanceDetail = `安装应用与仓库不一致：appVersion=${application.version};repositoryVersion=${repository.version};appSha=${application.gitSha};repositorySha=${repository.gitSha}`
} else if (repository.dirty) {
  provenanceStatus = 'BLOCKED'
  provenanceDetail = '仓库工作区存在未提交修改，Git SHA 不能完整代表 Playwright companion 源码'
}
cases.push({
  caseId: 'SHELL-P-BUILD-PROVENANCE',
  title: '安装应用与 WebView companion 构建来源一致',
  status: provenanceStatus,
  source: 'build-provenance',
  detail: provenanceDetail,
})
const provenance = {
  status: provenanceStatus,
  versionMatch: Boolean(versionsMatch),
  gitShaMatch: Boolean(commitsMatch),
  repositoryClean: !repository.dirty,
  detail: provenanceDetail,
}
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
  suite: { id: 'ui-shell-native-macos', version: '1.2.1' },
  repository,
  application,
  provenance,
  execution: {
    executor: repository.lastCommitter,
    executorBasis: 'Git HEAD committer (temporary acceptance convention)',
  },
  environment: {
    os: 'macOS',
    platform: 'darwin',
    osVersion: process.env.NATIVE_OS_VERSION || 'unknown',
    node: process.version,
    arch: process.env.NATIVE_MACHINE_ARCH || null,
    rust: process.env.NATIVE_RUST_VERSION || 'UNAVAILABLE',
    tauriCli: process.env.NATIVE_TAURI_CLI_VERSION || 'UNAVAILABLE',
    tauriFramework: process.env.NATIVE_TAURI_FRAMEWORK_VERSION || 'UNAVAILABLE',
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
    titlebarMenus: 'CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P',
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
    webview: companionResult ? {
      directory: 'webview',
      result: 'webview/result.json',
      manifest: 'webview/SHA256SUMS',
      stdout: 'webview-stdout.txt',
      stderr: 'webview-stderr.txt',
      exitCode: Number(process.env.NATIVE_COMPANION_EXIT || 1),
    } : null,
  },
}
writeFileSync(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
NODE

(
  cd "$OUTPUT_DIR"
  find . -type f ! -path './SHA256SUMS' -print | LC_ALL=C sort | while IFS= read -r relative_file; do
    shasum -a 256 "$relative_file"
  done
) | sed 's#  \./#  #' >"$OUTPUT_DIR/SHA256SUMS"

node --input-type=module - "$OUTPUT_DIR/result.json" <<'NODE'
import { readFileSync } from 'node:fs'
const result = JSON.parse(readFileSync(process.argv[2], 'utf8'))
console.log(`UI shell native macOS acceptance: ${result.conclusion} (${result.summary.passed}/${result.summary.caseCount} passed, ${result.summary.failed} failed, ${result.summary.blocked} blocked)`)
console.log(`Results: ${process.argv[2]}`)
console.log(`SHA256SUMS: ${process.argv[2].replace(/result\.json$/u, 'SHA256SUMS')}`)
console.log(`exit=${result.exitCode}`)
process.exitCode = result.exitCode
NODE
