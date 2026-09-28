#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_OUTPUT="$ROOT_DIR/artifacts/ui-shell-native-macos"
DEFAULT_APP_PATH="/Applications/Vinkey.app"
OUTPUT_ROOT="$DEFAULT_OUTPUT"
APP_PATH="$DEFAULT_APP_PATH"
PROCESS_NAME=""
PROFILE_DIR=""
PROFILE_DIR_EXPLICIT=0
PROFILE_DIR_CREATED=0
TESTER_ID="local-tester"
CREATE_ARCHIVE=1
NO_LAUNCH=0
DEV_MODE=0
DEV_PID=""
RUN_ID="$(date -u +%Y-%m-%dT%H%M%SZ)"
MIN_MACOS_MAJOR=15
MIN_MACOS_VERSION="15.0"

print_help() {
  cat <<'HELP'
macOS 15+ Tauri 原生壳层验收（W0-SHELL-P）

用法：bash scripts/ui-shell/run-ui-shell-native-macos.sh [选项]

选项：
  --output <目录>          证据归档根目录（默认：artifacts/ui-shell-native-macos）
  --app <Vinkey.app>       指定 macOS .app（默认：/Applications/Vinkey.app）
  --dev                    不使用已安装应用，改为启动 npm run desktop:dev
  --process-name <名称>    Accessibility 进程名（开发模式默认 vinkey，.app 默认取包名）
  --profile-dir <目录>     指定隔离验收 Profile；脚本启动时默认创建临时目录
  --tester-id <标识>       写入结果的非个人测试标识（默认：local-tester）
  --no-launch              不启动应用，使用已运行的 Tauri 进程（必须指定 --profile-dir）
  --no-archive             不生成标准化 tar.gz 分发包
  --help                   显示帮助

前置条件：
  1. 系统版本必须为 macOS 15 或更高版本；截图只使用 ScreenCaptureKit helper，不提供 screencapture 降级路径。
  2. 安装 Xcode Command Line Tools，并确保 `swiftc` 可用。
  3. 在“系统设置 → 隐私与安全性 → 辅助功能”允许 Terminal/终端（或运行本脚本的 IDE）控制电脑。
  4. 在“屏幕与系统音频录制”中允许相同的应用使用 ScreenCaptureKit 窗口截图。
  5. 运行 `npm install --include=dev`，并准备 Rust/Tauri 开发环境。
  6. 默认模式发现已有可见窗口时会阻断；已有零窗口进程会正常退出并重新启动，以绑定新的 app.start 构建记录。
  7. 安装包应由当前干净 Git HEAD 构建；版本或 Git SHA 不一致时 provenance 用例失败。

安装包模式会点击关闭按钮、通过系统 Reopen 恢复窗口，再次关闭作为清理；不要把未保存的重要桌面会话作为测试目标。
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
    --profile-dir)
      [[ $# -ge 2 ]] || { printf '%s\n' '--profile-dir 需要目录参数' >&2; exit 2; }
      PROFILE_DIR="$2"
      PROFILE_DIR_EXPLICIT=1
      shift 2
      ;;
    --tester-id)
      [[ $# -ge 2 ]] || { printf '%s\n' '--tester-id 需要标识参数' >&2; exit 2; }
      TESTER_ID="$2"
      shift 2
      ;;
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    --no-archive)
      CREATE_ARCHIVE=0
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

if [[ ! "$TESTER_ID" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; then
  printf '%s\n' '--tester-id 仅允许 1-64 个字母、数字、点、下划线或连字符；不要使用姓名或邮箱' >&2
  exit 2
fi
if ((NO_LAUNCH == 1 && PROFILE_DIR_EXPLICIT == 0)); then
  printf '%s\n' '--no-launch 必须同时指定 --profile-dir，并确保外部进程使用相同的 VINKEY_ACCEPTANCE_DATA_DIR' >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' '此入口只能在 macOS 上运行；Linux/Windows 请使用对应的浏览器层或桌面验收入口。' >&2
  exit 1
fi

command -v sw_vers >/dev/null || { printf '%s\n' '缺少 sw_vers，无法确认 macOS 版本' >&2; exit 1; }
command -v osascript >/dev/null || { printf '%s\n' '缺少 osascript' >&2; exit 1; }
command -v swiftc >/dev/null || { printf '%s\n' '缺少 swiftc（需要 Xcode 命令行工具；用于构建 ScreenCaptureKit 截图助手）' >&2; exit 1; }
command -v shasum >/dev/null || { printf '%s\n' '缺少 shasum' >&2; exit 1; }

OS_VERSION="$(sw_vers -productVersion 2>/dev/null || true)"
OS_MAJOR="${OS_VERSION%%.*}"
if [[ ! "$OS_MAJOR" =~ ^[0-9]+$ ]]; then
  printf '无法解析 macOS 版本：%s\n' "${OS_VERSION:-unknown}" >&2
  exit 1
fi
if ((OS_MAJOR < MIN_MACOS_MAJOR)); then
  printf '不支持 macOS %s；本验收入口仅支持 macOS %s+ 的 ScreenCaptureKit 截图机制。\n' "$OS_VERSION" "$MIN_MACOS_VERSION" >&2
  exit 1
fi
SWIFT_VERSION="$(swiftc --version 2>/dev/null | head -1 || true)"

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

# macOS 15+ only: compile the ScreenCaptureKit helper and do not fall back to screencapture.
# Cache by source hash, target and architecture so incompatible helpers are never reused.
HELPER_SRC="$OUTPUT_DIR/capture-helper.swift"
HELPER_BUILD_LOG="$OUTPUT_DIR/capture-helper-build.log"
CAPTURE_HELPER_ARCH="$(uname -m)"
CAPTURE_HELPER_TARGET="$CAPTURE_HELPER_ARCH-apple-macosx$MIN_MACOS_VERSION"
cat >"$HELPER_SRC" <<'SCSWIFT'
import AppKit
import CoreGraphics
import Foundation
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write(Data("usage: capture-helper <capture|display-metadata> <output> [bundle-id] [process-name]\n".utf8))
    exit(2)
}

func writeError(_ message: String) {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
}

func screenNumber(_ screen: NSScreen) -> CGDirectDisplayID? {
    (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
}

func activeDisplayMetadata() throws -> [String: Any] {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success else {
        throw NSError(domain: "capture-helper", code: 10, userInfo: [NSLocalizedDescriptionKey: "cannot enumerate active displays"])
    }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetActiveDisplayList(count, &ids, &count) == .success else {
        throw NSError(domain: "capture-helper", code: 11, userInfo: [NSLocalizedDescriptionKey: "cannot read active displays"])
    }
    let screensById = Dictionary(uniqueKeysWithValues: NSScreen.screens.compactMap { screen in
        screenNumber(screen).map { ($0, screen) }
    })
    let displays: [[String: Any]] = ids.prefix(Int(count)).enumerated().map { index, id in
        let screen = screensById[id]
        let logicalFrame = screen?.frame ?? CGDisplayBounds(id)
        let pixelWidth = Double(CGDisplayPixelsWide(id))
        let pixelHeight = Double(CGDisplayPixelsHigh(id))
        let millimeters = CGDisplayScreenSize(id)
        let effectiveScaleX = logicalFrame.width > 0 ? pixelWidth / logicalFrame.width : 0
        let effectiveScaleY = logicalFrame.height > 0 ? pixelHeight / logicalFrame.height : 0
        let physicalDpiX = millimeters.width > 0 ? pixelWidth * 25.4 / millimeters.width : 0
        let physicalDpiY = millimeters.height > 0 ? pixelHeight * 25.4 / millimeters.height : 0
        let mirrorTarget = CGDisplayMirrorsDisplay(id)
        let inMirrorSet = CGDisplayIsInMirrorSet(id)
        let backingScaleFactor: Any
        if let screen {
            backingScaleFactor = Double(screen.backingScaleFactor)
        } else {
            backingScaleFactor = NSNull()
        }
        let physicalDpi: Any
        if physicalDpiX > 0 && physicalDpiY > 0 {
            physicalDpi = ["x": physicalDpiX, "y": physicalDpiY]
        } else {
            physicalDpi = NSNull()
        }
        return [
            "index": index,
            "active": CGDisplayIsActive(id),
            "main": id == CGMainDisplayID(),
            "builtin": CGDisplayIsBuiltin(id),
            "mirrored": inMirrorSet,
            "mirrorRole": mirrorTarget != kCGNullDirectDisplay ? "mirror" : (inMirrorSet ? "source" : "none"),
            "logicalFramePoints": ["x": logicalFrame.origin.x, "y": logicalFrame.origin.y, "width": logicalFrame.width, "height": logicalFrame.height],
            "pixelSize": ["width": pixelWidth, "height": pixelHeight],
            "physicalSizeMillimeters": ["width": millimeters.width, "height": millimeters.height],
            "backingScaleFactor": backingScaleFactor,
            "effectiveScale": ["x": effectiveScaleX, "y": effectiveScaleY],
            "physicalDpi": physicalDpi,
            "physicalDpiAvailable": physicalDpiX > 0 && physicalDpiY > 0,
            "physicalDpiSource": physicalDpiX > 0 && physicalDpiY > 0 ? "CoreGraphics pixels and physical millimeters" : "manual-fallback-required",
        ]
    }
    return [
        "schemaVersion": 1,
        "displayCount": displays.count,
        "allPhysicalDpiAvailable": displays.allSatisfy { $0["physicalDpiAvailable"] as? Bool == true },
        "manualFallbackRequired": displays.contains { $0["physicalDpiAvailable"] as? Bool != true },
        "displays": displays,
    ]
}

func captureWindow(outputPath: String, bundleIdentifier: String, processName: String) async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    let candidates = content.windows.filter { window in
        guard window.isOnScreen, window.frame.width > 0, window.frame.height > 0, let owner = window.owningApplication else { return false }
        let bundleMatches = !bundleIdentifier.isEmpty && owner.bundleIdentifier == bundleIdentifier
        let processMatches = !processName.isEmpty && owner.applicationName.compare(processName, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
        return bundleMatches || processMatches
    }
    guard let window = candidates.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else {
        throw NSError(domain: "capture-helper", code: 20, userInfo: [NSLocalizedDescriptionKey: "no visible application window matched bundle/process"])
    }
    let scale = content.displays
        .filter { $0.frame.intersects(window.frame) && $0.frame.width > 0 }
        .max(by: { $0.frame.intersection(window.frame).width * $0.frame.intersection(window.frame).height < $1.frame.intersection(window.frame).width * $1.frame.intersection(window.frame).height })
        .map { Double($0.width) / $0.frame.width } ?? 1
    let config = SCStreamConfiguration()
    config.width = max(1, Int((window.frame.width * scale).rounded()))
    config.height = max(1, Int((window.frame.height * scale).rounded()))
    config.showsCursor = false
    config.ignoreShadowsSingleWindow = false
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
    let url = URL(fileURLWithPath: outputPath)
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "capture-helper", code: 21, userInfo: [NSLocalizedDescriptionKey: "cannot create image destination"])
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "capture-helper", code: 22, userInfo: [NSLocalizedDescriptionKey: "failed to write PNG"])
    }
}

let mode = args[1]
let outputPath = args[2]
if mode == "display-metadata" {
    do {
        let data = try JSONSerialization.data(withJSONObject: activeDisplayMetadata(), options: [.prettyPrinted, .sortedKeys])
        try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
        exit(0)
    } catch {
        writeError("display metadata error: \(error)")
        exit(1)
    }
}
guard mode == "capture", args.count >= 5 else {
    writeError("capture mode requires output, bundle-id and process-name")
    exit(2)
}
let semaphore = DispatchSemaphore(value: 0)
var exitCode: Int32 = 1
Task {
    do {
        try await captureWindow(outputPath: outputPath, bundleIdentifier: args[3], processName: args[4])
        exitCode = 0
    } catch {
        writeError("capture error: \(error)")
    }
    semaphore.signal()
}
semaphore.wait()
exit(exitCode)
SCSWIFT
HELPER_HASH="$(shasum -a 256 "$HELPER_SRC" | awk '{print $1}' | cut -c1-12)"
mkdir -p "$OUTPUT_ROOT/bin"
CAPTURE_HELPER="$OUTPUT_ROOT/bin/capture-helper-macos15-$CAPTURE_HELPER_ARCH-$HELPER_HASH"
if [[ ! -x "$CAPTURE_HELPER" ]]; then
  if ! swiftc -O -target "$CAPTURE_HELPER_TARGET" "$HELPER_SRC" -o "$CAPTURE_HELPER" 2>"$HELPER_BUILD_LOG"; then
    printf '无法使用 swiftc 构建 ScreenCaptureKit 截图助手；编译日志：%s\n' "$HELPER_BUILD_LOG" >&2
    exit 1
  fi
fi
if [[ ! -x "$CAPTURE_HELPER" ]]; then
  printf '%s\n' 'ScreenCaptureKit 截图助手不可执行' >&2
  exit 1
fi

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
if ((PROFILE_DIR_EXPLICIT == 1)); then
  mkdir -p "$PROFILE_DIR"
  PROFILE_DIR="$(cd "$PROFILE_DIR" && pwd)"
  if ((NO_LAUNCH == 1)); then
    PROFILE_MODE="external-caller-managed"
  else
    PROFILE_MODE="explicit-isolated"
  fi
else
  PROFILE_TEMP_ROOT="${TMPDIR:-/tmp}"
  PROFILE_TEMP_ROOT="${PROFILE_TEMP_ROOT%/}"
  PROFILE_DIR="$(mktemp -d "$PROFILE_TEMP_ROOT/vinkey-ui-shell-profile.XXXXXX")"
  PROFILE_DIR_CREATED=1
  PROFILE_MODE="script-temporary-isolated"
fi
RUNTIME_LOG="$PROFILE_DIR/vinkey-runtime.jsonl"
APP_PATH_LABEL=""
if [[ -n "$APP_PATH" ]]; then APP_PATH_LABEL="$(basename "$APP_PATH")"; fi

cleanup() {
  if [[ -n "$DEV_PID" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  if ((PROFILE_DIR_CREATED == 1)) \
    && [[ -d "$PROFILE_DIR" ]] \
    && [[ "$PROFILE_DIR" == "$PROFILE_TEMP_ROOT"/vinkey-ui-shell-profile.* ]]; then
    rm -rf -- "$PROFILE_DIR"
  fi
}
trap cleanup EXIT INT TERM

process_exists() {
  osascript -e "tell application \"System Events\" to exists application process \"$PROCESS_NAME\"" 2>/dev/null | grep -q '^true$'
}

accessible_window_exists() {
  # AX "visible" 对 Tauri/WebKit 窗口可能返回 missing value（实测本机 Vinkey 即如此），
  # 用 exists front window 判定窗口存在更稳健。先激活进程，避免窗口落在非当前 Space 被漏判。
  osascript -e "tell application \"System Events\" to tell application process \"$PROCESS_NAME\" to set frontmost to true" >/dev/null 2>&1 || true
  osascript -e "tell application \"System Events\" to tell application process \"$PROCESS_NAME\" to exists front window" 2>/dev/null | grep -q '^true$'
}

request_installed_app_quit() {
  if [[ -n "$APP_BUNDLE_ID" ]]; then
    osascript -e "tell application id \"$APP_BUNDLE_ID\" to quit" >/dev/null 2>&1
  else
    osascript -e "tell application \"$PROCESS_NAME\" to quit" >/dev/null 2>&1
  fi
}

STARTUP_BLOCK_REASON=""
if ((NO_LAUNCH == 0)) && process_exists; then
  if accessible_window_exists; then
    STARTUP_BLOCK_REASON="验收启动前已有可访问的 $PROCESS_NAME 窗口；为避免关闭未保存内容，请先正常退出应用，或明确使用 --no-launch"
  else
    if ((DEV_MODE == 1)); then
      STARTUP_BLOCK_REASON="验收启动前已有零窗口的开发进程 $PROCESS_NAME；请先终止该开发进程后重试"
    elif ! request_installed_app_quit; then
      STARTUP_BLOCK_REASON="无法正常退出已有零窗口进程 $PROCESS_NAME"
    else
      for _ in $(seq 1 30); do
        if ! process_exists; then break; fi
        sleep 0.5
      done
      if process_exists; then
        STARTUP_BLOCK_REASON="已有零窗口进程 $PROCESS_NAME 在正常退出请求后仍未结束"
      fi
    fi
  fi
fi

if [[ -z "$STARTUP_BLOCK_REASON" ]] && ((NO_LAUNCH == 0)); then
  if ((DEV_MODE == 0)); then
    /usr/bin/open -n --env "VINKEY_ACCEPTANCE_DATA_DIR=$PROFILE_DIR" "$APP_PATH" >/dev/null || true
  else
    (
      cd "$ROOT_DIR"
      VINKEY_ACCEPTANCE_DATA_DIR="$PROFILE_DIR" VITE_UI_ACCEPTANCE=1 npm run desktop:dev >"$DEV_LOG" 2>&1
    ) &
    DEV_PID=$!
  fi
fi

if [[ -z "$STARTUP_BLOCK_REASON" ]] && ! process_exists; then
  for _ in $(seq 1 180); do
    if process_exists; then break; fi
    sleep 1
  done
fi

WINDOW_READY_WAIT_MS=0
if [[ -z "$STARTUP_BLOCK_REASON" ]] && process_exists && ! accessible_window_exists; then
  for _ in $(seq 1 60); do
    sleep 0.5
    WINDOW_READY_WAIT_MS=$((WINDOW_READY_WAIT_MS + 500))
    if accessible_window_exists; then break; fi
  done
fi

if [[ -n "$STARTUP_BLOCK_REASON" ]]; then
  printf '%s\n' "BLOCKED|SHELL-NATIVE-MAC-PRECONDITION|原生窗口验收启动前置条件|$STARTUP_BLOCK_REASON" >"$EVENTS_FILE"
elif ! process_exists; then
  printf '未找到 Tauri 进程“%s”。请检查 %s\n' "$PROCESS_NAME" "$DEV_LOG" >&2
  printf '%s\n' 'BLOCKED|SHELL-NATIVE-MAC-LAUNCH|启动 Tauri 桌面应用|Accessibility 进程不可见' >"$EVENTS_FILE"
elif ! accessible_window_exists; then
  printf 'Tauri 进程“%s”已出现，但等待 %sms 后仍没有可访问窗口。\n' "$PROCESS_NAME" "$WINDOW_READY_WAIT_MS" >&2
  printf '%s\n' "BLOCKED|SHELL-NATIVE-MAC-WINDOW-READY|等待 Tauri 窗口进入 Accessibility 树|process=$PROCESS_NAME;waitMs=$WINDOW_READY_WAIT_MS" >"$EVENTS_FILE"
else
  cat >"$APPLE_SCRIPT_FILE" <<'APPLESCRIPT'
on run argv
  set reportDir to item 1 of argv
  set appName to item 2 of argv
  set windowReadyWaitMs to item 3 of argv
  set appPath to item 4 of argv
  set captureHelper to item 5 of argv
  set appBundleId to item 6 of argv
  set reportLines to {}

  try
    tell application "System Events"
      tell application process appName
        set frontmost to true
        if not (exists front window) then error "窗口就绪检查通过后，Tauri 主窗口再次变为不可访问"
        set mainWindow to front window
        set initialPosition to position of mainWindow
        set initialSize to size of mainWindow
        set end of reportLines to "PASS|SHELL-NATIVE-MAC-LAUNCH|Tauri 桌面窗口可访问|position=" & my pairText(initialPosition) & ";size=" & my pairText(initialSize) & ";windowReadyWaitMs=" & windowReadyWaitMs

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

        my capture(reportDir, "screenshots/01-mac-traffic-lights.png", captureHelper, appBundleId, appName)
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
          my capture(reportDir, "screenshots/02-mac-window-" & sizeName & ".png", captureHelper, appBundleId, appName)
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

        set closeConfirmed to false
        try
          my capture(reportDir, "screenshots/03-mac-before-close.png", captureHelper, appBundleId, appName)
          set closePress to my pressTrafficLight(appName, "close")
          if closePress is missing value then
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|无法重新查询并按下红色交通灯"
          else
            delay 1
            if my processHasWindow(appName) then
              set end of reportLines to "FAIL|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|关闭后仍有可见窗口;press=" & closePress
            else
              set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|主窗口已隐藏且无可见窗口;press=" & closePress
              set closeConfirmed to true
            end if
          end if
        on error closeError
          set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-CLOSE|点击关闭交通灯|" & my oneLine(closeError)
        end try

        if closeConfirmed and appPath is not "" then
          try
            do shell script "/usr/bin/open " & quoted form of appPath
            set reopened to false
            repeat 60 times
              delay 0.5
              if my processHasWindow(appName) then
                set reopened to true
                exit repeat
              end if
            end repeat
            if reopened then
              my capture(reportDir, "screenshots/04-mac-window-reopened.png", captureHelper, appBundleId, appName)
              set end of reportLines to "PASS|SHELL-NATIVE-MAC-WINDOW-REOPEN|关闭后通过系统 Reopen 恢复主窗口|窗口重新可访问并已截图"
              set cleanupPress to my pressTrafficLight(appName, "close")
              delay 1
              if cleanupPress is missing value or my processHasWindow(appName) then
                set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-CLEANUP|Reopen 验证后清理窗口|无法再次隐藏主窗口"
              end if
            else
              set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-REOPEN|关闭后通过系统 Reopen 恢复主窗口|等待 30000ms 后窗口仍不可访问"
            end if
          on error reopenError
            set end of reportLines to "BLOCKED|SHELL-NATIVE-MAC-WINDOW-REOPEN|关闭后通过系统 Reopen 恢复主窗口|" & my oneLine(reopenError)
          end try
        end if
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
      try
        return (count of windows) > 0
      end try
    end tell
  end tell
  return false
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

on capture(reportDir, relativePath, captureHelper, appBundleId, appName)
  set destination to reportDir & "/" & relativePath
  do shell script (quoted form of captureHelper) & " capture " & quoted form of destination & " " & quoted form of appBundleId & " " & quoted form of appName
end capture
APPLESCRIPT
  set +e
  osascript "$APPLE_SCRIPT_FILE" "$OUTPUT_DIR" "$PROCESS_NAME" "$WINDOW_READY_WAIT_MS" "$APP_PATH" "$CAPTURE_HELPER" "$APP_BUNDLE_ID" >"$EVENTS_FILE" 2>"$AUTOMATION_STDERR"
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
DISPLAY_METADATA="$OUTPUT_DIR/display-metadata.json"
DISPLAY_METADATA_STDERR="$OUTPUT_DIR/display-metadata-stderr.txt"
set +e
"$CAPTURE_HELPER" display-metadata "$DISPLAY_METADATA" 2>"$DISPLAY_METADATA_STDERR"
DISPLAY_METADATA_EXIT=$?
set -e
ARCHIVE_NAME=""
if ((CREATE_ARCHIVE == 1)); then ARCHIVE_NAME="run-$RUN_ID.tar.gz"; fi

NATIVE_REPORT_DIR="$OUTPUT_DIR" \
NATIVE_EVENTS_FILE="$EVENTS_FILE" \
NATIVE_PROCESS_NAME="$PROCESS_NAME" \
NATIVE_DISPLAY_METADATA="$DISPLAY_METADATA" \
NATIVE_DISPLAY_METADATA_EXIT="$DISPLAY_METADATA_EXIT" \
NATIVE_OS_VERSION="$OS_VERSION" \
NATIVE_MACOS_MIN_VERSION="$MIN_MACOS_VERSION" \
NATIVE_SWIFT_VERSION="$SWIFT_VERSION" \
NATIVE_CAPTURE_HELPER_TARGET="$CAPTURE_HELPER_TARGET" \
NATIVE_APP_PATH_LABEL="$APP_PATH_LABEL" \
NATIVE_APP_BUNDLE_ID="$APP_BUNDLE_ID" \
NATIVE_APP_VERSION="$APP_BUNDLE_VERSION" \
NATIVE_APP_BUILD_NUMBER="$APP_BUILD_NUMBER" \
NATIVE_APP_EXECUTABLE="$APP_EXECUTABLE" \
NATIVE_APP_ARCHITECTURES="$APP_ARCHITECTURES" \
NATIVE_RUNTIME_LOG="$RUNTIME_LOG" \
NATIVE_REPOSITORY_VERSION="$REPOSITORY_VERSION" \
NATIVE_REPOSITORY_SHA="$REPOSITORY_SHA" \
NATIVE_REPOSITORY_DIRTY="$REPOSITORY_DIRTY" \
NATIVE_TESTER_ID="$TESTER_ID" \
NATIVE_PROFILE_MODE="$PROFILE_MODE" \
NATIVE_PROFILE_INJECTED="$((NO_LAUNCH == 0 ? 1 : 0))" \
NATIVE_ARCHIVE_NAME="$ARCHIVE_NAME" \
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
let displayMetadata = null
try {
  displayMetadata = JSON.parse(readFileSync(process.env.NATIVE_DISPLAY_METADATA, 'utf8'))
} catch { /* reported as a blocked display evidence case below */ }
const displays = Array.isArray(displayMetadata?.displays) ? displayMetadata.displays : []
const displayStatus = Number(process.env.NATIVE_DISPLAY_METADATA_EXIT) === 0
  && displays.length > 0
  && displayMetadata?.allPhysicalDpiAvailable === true ? 'PASS' : 'BLOCKED'
cases.push({
  caseId: 'SHELL-NATIVE-MAC-DISPLAY-SCALE',
  title: '记录全部活动显示器缩放和物理 DPI',
  status: displayStatus,
  source: 'native-display-probe',
  detail: displayStatus === 'PASS'
    ? `displays=${displays.length};source=CoreGraphics+NSScreen`
    : `displays=${displays.length};manual-fallback-required=true;probeExit=${process.env.NATIVE_DISPLAY_METADATA_EXIT || 'unknown'}`,
})
const profileInjected = process.env.NATIVE_PROFILE_INJECTED === '1'
cases.push({
  caseId: 'SHELL-P-ISOLATED-PROFILE',
  title: '使用隔离验收 Profile',
  status: profileInjected ? 'PASS' : 'BLOCKED',
  source: 'acceptance-runner',
  detail: profileInjected
    ? `mode=${process.env.NATIVE_PROFILE_MODE};environment=VINKEY_ACCEPTANCE_DATA_DIR`
    : 'mode=external-caller-managed;脚本无法证明外部进程已注入指定 Profile',
})
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
  path: process.env.NATIVE_APP_PATH_LABEL || null,
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
  suite: { id: 'ui-shell-native-macos', version: '1.5.0' },
  repository,
  application,
  provenance,
  execution: {
    testerId: process.env.NATIVE_TESTER_ID || 'local-tester',
    testerIdBasis: 'non-personal identifier supplied by --tester-id',
    profile: {
      mode: process.env.NATIVE_PROFILE_MODE,
      environmentVariable: 'VINKEY_ACCEPTANCE_DATA_DIR',
      injectedByRunner: profileInjected,
      path: '<acceptance-profile>',
    },
  },
  environment: {
    os: 'macOS',
    platform: 'darwin',
    osVersion: process.env.NATIVE_OS_VERSION || 'unknown',
    minimumOsVersion: process.env.NATIVE_MACOS_MIN_VERSION || '15.0',
    node: process.version,
    swift: process.env.NATIVE_SWIFT_VERSION || 'UNAVAILABLE',
    arch: process.env.NATIVE_MACHINE_ARCH || null,
    rust: process.env.NATIVE_RUST_VERSION || 'UNAVAILABLE',
    tauriCli: process.env.NATIVE_TAURI_CLI_VERSION || 'UNAVAILABLE',
    tauriFramework: process.env.NATIVE_TAURI_FRAMEWORK_VERSION || 'UNAVAILABLE',
    processName: process.env.NATIVE_PROCESS_NAME,
    displays: displayMetadata,
    dpiNote: displayStatus === 'PASS'
      ? '物理 DPI 由 CoreGraphics 像素和物理毫米尺寸计算；有效缩放由像素尺寸和 NSScreen/CGDisplay 逻辑点尺寸计算。'
      : '至少一个活动显示器缺少可靠物理尺寸；必须按 display-metadata.json 的 manual-fallback-required 补充人工确认。',
    screenshot: {
      mechanism: 'ScreenCaptureKit.SCScreenshotManager',
      contentFilter: 'SCContentFilter.desktopIndependentWindow',
      scope: 'largest-visible-target-application-window',
      helperCompiler: 'swiftc',
      helperTarget: process.env.NATIVE_CAPTURE_HELPER_TARGET || null,
      fallback: null,
    },
  },
  platformEvidence: {
    titlebarMenus: 'CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P',
    macTrafficLights: 'COVERED_BY_ACCESSIBILITY',
    windowControls: 'COVERED_BY_ACCESSIBILITY',
    physicalDpi: displayStatus === 'PASS' ? 'MEASURED_WITH_COREGRAPHICS_PHYSICAL_SIZE' : 'BLOCKED:MANUAL_FALLBACK_REQUIRED',
  },
  cases,
  summary,
  exitCode,
  conclusion,
  artifacts: {
    screenshots,
    sha256: screenshotHashes,
    manifestFile: 'SHA256SUMS',
    outputDirectory: '.',
    events: 'events.txt',
    automationScript: existsSync(join(outputDir, 'native-automation.applescript')) ? 'native-automation.applescript' : null,
    displayInfo: 'display-info.txt',
    displayMetadata: existsSync(join(outputDir, 'display-metadata.json')) ? 'display-metadata.json' : null,
    displayMetadataStderr: existsSync(join(outputDir, 'display-metadata-stderr.txt')) ? 'display-metadata-stderr.txt' : null,
    automationStderr: existsSync(join(outputDir, 'automation-stderr.txt')) ? 'automation-stderr.txt' : null,
    captureHelperSource: 'capture-helper.swift',
    captureHelperBuildLog: existsSync(join(outputDir, 'capture-helper-build.log')) ? 'capture-helper-build.log' : null,
    devLog: existsSync(join(outputDir, 'tauri-dev.log')) ? 'tauri-dev.log' : null,
    webview: companionResult ? {
      directory: 'webview',
      result: 'webview/result.json',
      manifest: 'webview/SHA256SUMS',
      stdout: 'webview-stdout.txt',
      stderr: 'webview-stderr.txt',
      exitCode: Number(process.env.NATIVE_COMPANION_EXIT || 1),
    } : null,
    privacyAudit: { status: 'PENDING', scannedTextFiles: 0 },
    archive: process.env.NATIVE_ARCHIVE_NAME || null,
  },
}
writeFileSync(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
NODE

# Redact distributable text before privacy scanning and checksumming. Binary screenshots
# are window-only, so they cannot include the desktop, menu bar, or unrelated apps.
NATIVE_REPORT_DIR="$OUTPUT_DIR" \
NATIVE_OUTPUT_ROOT="$OUTPUT_ROOT" \
NATIVE_REPOSITORY_ROOT="$ROOT_DIR" \
NATIVE_PROFILE_DIR="$PROFILE_DIR" \
NATIVE_USER_HOME="${HOME:-}" \
node --input-type=module <<'NODE'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const outputDir = process.env.NATIVE_REPORT_DIR
const textExtensions = new Set(['.applescript', '.css', '.html', '.js', '.json', '.jsonl', '.log', '.md', '.mjs', '.swift', '.ts', '.txt'])
const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})
const replacements = [
  [process.env.NATIVE_PROFILE_DIR, '<ACCEPTANCE_PROFILE>'],
  [process.env.NATIVE_REPORT_DIR, '<RUN_OUTPUT>'],
  [process.env.NATIVE_OUTPUT_ROOT, '<OUTPUT_ROOT>'],
  [process.env.NATIVE_REPOSITORY_ROOT, '<REPO_ROOT>'],
  [process.env.NATIVE_USER_HOME, '<USER_HOME>'],
].filter(([value]) => value).sort(([left], [right]) => right.length - left.length)

for (const path of walk(outputDir).filter((value) => textExtensions.has(extname(value).toLowerCase()))) {
  let text = readFileSync(path, 'utf8')
  for (const [value, replacement] of replacements) text = text.split(value).join(replacement)
  text = text
    .replace(/\/Users\/[^\s"'<>|]+/gu, '<USER_HOME>')
    .replace(/\/home\/[^\s"'<>|]+/gu, '<USER_HOME>')
    .replace(/[A-Za-z]:\\+Users\\+[^\s"'<>|]+/gu, '<USER_HOME>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '<redacted-email>')
    .replace(/^(\s*[^:\r\n]*(?:Serial Number|UUID|序列号)[^:\r\n]*:\s*).+$/gimu, '$1<redacted>')
  writeFileSync(path, text)
}
NODE

if [[ -d "$WEBVIEW_DIR" ]]; then
  (
    cd "$WEBVIEW_DIR"
    find . -type f ! -path './SHA256SUMS' -print | LC_ALL=C sort | while IFS= read -r relative_file; do
      shasum -a 256 "$relative_file"
    done
  ) | sed 's#  \./#  #' >"$WEBVIEW_DIR/SHA256SUMS"
fi

NATIVE_REPORT_DIR="$OUTPUT_DIR" node --input-type=module <<'NODE'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const outputDir = process.env.NATIVE_REPORT_DIR
const textExtensions = new Set(['.applescript', '.css', '.html', '.js', '.json', '.jsonl', '.log', '.md', '.mjs', '.swift', '.ts', '.txt'])
const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})
const patterns = [
  ['mac-user-path', /\/Users\//u],
  ['linux-user-path', /\/home\//u],
  ['windows-user-path', /[A-Za-z]:\\+Users\\+/u],
  ['email-address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu],
  ['display-serial-or-uuid', /(?:Serial Number|UUID|序列号)[^:\r\n]*:(?![ \t]*<redacted>[ \t]*(?:\r?$))[^\r\n]+/imu],
]
const findings = []
let scannedTextFiles = 0
for (const path of walk(outputDir).filter((value) => textExtensions.has(extname(value).toLowerCase()))) {
  scannedTextFiles += 1
  const text = readFileSync(path, 'utf8')
  for (const [kind, pattern] of patterns) {
    if (pattern.test(text)) findings.push({ file: relative(outputDir, path), kind })
  }
}
const status = findings.length === 0 ? 'PASS' : 'FAIL'
const audit = { schemaVersion: 1, status, scannedTextFiles, findingCount: findings.length, findings }
writeFileSync(join(outputDir, 'privacy-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)

const resultPath = join(outputDir, 'result.json')
const result = JSON.parse(readFileSync(resultPath, 'utf8'))
result.cases.push({
  caseId: 'SHELL-P-ARTIFACT-PRIVACY',
  title: '可分发归档身份和路径脱敏',
  status,
  source: 'artifact-privacy-audit',
  detail: `scannedTextFiles=${scannedTextFiles};findingCount=${findings.length}`,
})
result.summary = {
  caseCount: result.cases.length,
  passed: result.cases.filter((item) => item.status === 'PASS').length,
  failed: result.cases.filter((item) => item.status === 'FAIL').length,
  blocked: result.cases.filter((item) => item.status === 'BLOCKED').length,
}
result.conclusion = result.summary.failed > 0 ? 'FAIL' : result.summary.blocked > 0 ? 'BLOCKED' : 'PASS'
result.exitCode = result.summary.failed > 0 ? 2 : result.summary.blocked > 0 ? 1 : 0
result.artifacts.privacyAudit = { file: 'privacy-audit.json', status, scannedTextFiles, findingCount: findings.length }
if (status !== 'PASS') result.artifacts.archive = null
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`)
NODE

PRIVACY_STATUS="$(node --input-type=module - "$OUTPUT_DIR/privacy-audit.json" <<'NODE'
import { readFileSync } from 'node:fs'
console.log(JSON.parse(readFileSync(process.argv[2], 'utf8')).status)
NODE
)"
if [[ "$PRIVACY_STATUS" != "PASS" ]]; then ARCHIVE_NAME=""; fi

(
  cd "$OUTPUT_DIR"
  find . -type f ! -path './SHA256SUMS' -print | LC_ALL=C sort | while IFS= read -r relative_file; do
    shasum -a 256 "$relative_file"
  done
) | sed 's#  \./#  #' >"$OUTPUT_DIR/SHA256SUMS"

if [[ -n "$ARCHIVE_NAME" ]]; then
  COPYFILE_DISABLE=1 /usr/bin/tar --no-xattrs --no-mac-metadata \
    --uid 0 --gid 0 --uname root --gname wheel \
    -czf "$OUTPUT_ROOT/$ARCHIVE_NAME" -C "$OUTPUT_ROOT" "run-$RUN_ID"
fi

node --input-type=module - "$OUTPUT_DIR/result.json" "run-$RUN_ID" "$ARCHIVE_NAME" <<'NODE'
import { readFileSync } from 'node:fs'
const result = JSON.parse(readFileSync(process.argv[2], 'utf8'))
console.log(`UI shell native macOS acceptance: ${result.conclusion} (${result.summary.passed}/${result.summary.caseCount} passed, ${result.summary.failed} failed, ${result.summary.blocked} blocked)`)
console.log(`Results: ${process.argv[3]}/result.json`)
console.log(`SHA256SUMS: ${process.argv[3]}/SHA256SUMS`)
if (process.argv[4]) console.log(`Archive: ${process.argv[4]}`)
console.log(`exit=${result.exitCode}`)
process.exitCode = result.exitCode
NODE
