#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_OUTPUT="$ROOT_DIR/artifacts/title-bar-native-macos"
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
RUN_ID="$(date -u +%Y-%m-%dT%H%M%SZ)"
MIN_MACOS_MAJOR=15
MIN_MACOS_VERSION="15.0"

print_help() {
  cat <<'HELP'
macOS 15+ 标题栏与功能菜单原生 AX 验收（W0-SHELL-MENU-P / UI-ACC-TITLE-BAR-001）

用法：bash scripts/title-bar/run-title-bar-native-macos.sh [选项]

选项：
  --output <目录>          证据归档根目录（默认：artifacts/title-bar-native-macos）
  --app <Vinkey.app>       指定 macOS .app（默认：/Applications/Vinkey.app）
  --process-name <名称>    Accessibility 进程名（默认取包名）
  --profile-dir <目录>     指定隔离验收 Profile；默认由脚本创建临时目录
  --tester-id <标识>       写入结果的非个人测试标识（默认：local-tester）
  --no-launch              不启动应用，使用已运行进程（必须指定 --profile-dir）
  --no-archive             不生成标准化 tar.gz
  --help                   显示帮助

前置条件：
  1. macOS 15+；已安装 Xcode Command Line Tools 且 `swiftc` 可用。
  2. 在“系统设置 → 隐私与安全性 → 辅助功能”允许运行本脚本的 Terminal/IDE。
  3. 截图使用 CoreGraphics 窗口捕获，仅需辅助功能权限，不依赖屏幕录制授权。
  4. 目标 .app 应由当前干净 Git HEAD 构建。

脚本读取完整原生菜单树，按压查看/主题/帮助菜单项，并通过窗口菜单验证最小化/缩放/关闭/Reopen
状态变化；把结果写入 result.json 与菜单树 JSON。WebView 页面/焦点仍属于 companion 或人工证据。
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
      shift 2
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
  printf '%s\n' '此入口只能在 macOS 上运行；Linux/Windows 请使用 title-bar 机器层验收入口。' >&2
  exit 1
fi

command -v sw_vers >/dev/null || { printf '%s\n' '缺少 sw_vers' >&2; exit 1; }
command -v swiftc >/dev/null || { printf '%s\n' '缺少 swiftc（需要 Xcode 命令行工具）' >&2; exit 1; }
command -v shasum >/dev/null || { printf '%s\n' '缺少 shasum' >&2; exit 1; }
command -v node >/dev/null || { printf '%s\n' '缺少 node' >&2; exit 1; }

OS_VERSION="$(sw_vers -productVersion 2>/dev/null || true)"
OS_MAJOR="${OS_VERSION%%.*}"
if [[ ! "$OS_MAJOR" =~ ^[0-9]+$ ]]; then
  printf '无法解析 macOS 版本：%s\n' "${OS_VERSION:-unknown}" >&2
  exit 1
fi
if ((OS_MAJOR < MIN_MACOS_MAJOR)); then
  printf '不支持 macOS %s；本入口仅支持 macOS %s+\n' "$OS_VERSION" "$MIN_MACOS_VERSION" >&2
  exit 1
fi

[[ -d "$APP_PATH" && "$APP_PATH" == *.app ]] || {
  printf '未找到有效的 macOS 应用：%s\n' "$APP_PATH" >&2
  printf '%s\n' '请先安装 Vinkey，或用 --app 指定其他路径。' >&2
  exit 2
}
[[ -n "$PROCESS_NAME" ]] || PROCESS_NAME="$(basename "$APP_PATH" .app)"

if [[ "$OUTPUT_ROOT" != /* ]]; then OUTPUT_ROOT="$ROOT_DIR/$OUTPUT_ROOT"; fi
mkdir -p "$OUTPUT_ROOT"
OUTPUT_ROOT="$(cd "$OUTPUT_ROOT" && pwd)"
OUTPUT_DIR="$OUTPUT_ROOT/run-$RUN_ID"
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/screenshots"
EVENTS_FILE="$OUTPUT_DIR/events.txt"
AUTOMATION_STDERR="$OUTPUT_DIR/automation-stderr.txt"

plist_value() {
  local key="$1"
  if [[ -f "$APP_PATH/Contents/Info.plist" ]]; then
    /usr/bin/plutil -extract "$key" raw -o - "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
  fi
}
APP_BUNDLE_ID="$(plist_value CFBundleIdentifier)"
APP_BUNDLE_VERSION="$(plist_value CFBundleShortVersionString)"
APP_BUILD_NUMBER="$(plist_value CFBundleVersion)"
APP_EXECUTABLE="$(plist_value CFBundleExecutable)"

HELPER_SRC="$ROOT_DIR/scripts/title-bar/title-bar-ax-helper.swift"
HELPER_HASH="$(shasum -a 256 "$HELPER_SRC" | awk '{print $1}' | cut -c1-12)"
HELPER_ARCH="$(uname -m)"
HELPER_TARGET="$HELPER_ARCH-apple-macosx14.0"
HELPER_BUILD_LOG="$OUTPUT_DIR/helper-build.log"
mkdir -p "$OUTPUT_ROOT/bin"
AX_HELPER="$OUTPUT_ROOT/bin/title-bar-ax-helper-macos15-$HELPER_ARCH-$HELPER_HASH"
if [[ ! -x "$AX_HELPER" ]]; then
  if ! swiftc -O -target "$HELPER_TARGET" "$HELPER_SRC" -o "$AX_HELPER" 2>"$HELPER_BUILD_LOG"; then
    printf '无法使用 swiftc 构建原生菜单 AX 助手；编译日志：%s\n' "$HELPER_BUILD_LOG" >&2
    exit 1
  fi
fi

if ((PROFILE_DIR_EXPLICIT == 1)); then
  mkdir -p "$PROFILE_DIR"
  PROFILE_DIR="$(cd "$PROFILE_DIR" && pwd)"
else
  PROFILE_TEMP_ROOT="${TMPDIR:-/tmp}"
  PROFILE_TEMP_ROOT="${PROFILE_TEMP_ROOT%/}"
  PROFILE_DIR="$(mktemp -d "$PROFILE_TEMP_ROOT/vinkey-title-bar-profile.XXXXXX")"
  PROFILE_DIR_CREATED=1
fi

process_exists() {
  "$AX_HELPER" process-exists "$PROCESS_NAME" >/dev/null 2>&1
}
accessible_window_exists() {
  "$AX_HELPER" window-ready "$PROCESS_NAME" >/dev/null 2>&1
}
request_installed_app_quit() {
  "$AX_HELPER" quit "$PROCESS_NAME" >/dev/null 2>&1
}

cleanup() {
  if [[ -n "${APP_DIRECT_PID:-}" ]] && kill -0 "$APP_DIRECT_PID" 2>/dev/null; then
    kill "$APP_DIRECT_PID" 2>/dev/null || true
  fi
  if ((PROFILE_DIR_CREATED == 1)) \
    && [[ -d "$PROFILE_DIR" ]] \
    && [[ "$PROFILE_DIR" == "$PROFILE_TEMP_ROOT"/vinkey-title-bar-profile.* ]]; then
    rm -rf -- "$PROFILE_DIR"
  fi
}
trap cleanup EXIT INT TERM

STARTUP_BLOCK_REASON=""
if ((NO_LAUNCH == 0)) && process_exists; then
  if accessible_window_exists; then
    STARTUP_BLOCK_REASON="验收启动前已有可访问的 $PROCESS_NAME 窗口；请先正常退出应用，或使用 --no-launch"
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

if [[ -z "$STARTUP_BLOCK_REASON" ]] && ((NO_LAUNCH == 0)); then
  APP_BIN="$APP_PATH/Contents/MacOS/$APP_EXECUTABLE"
  if [[ -x "$APP_BIN" ]]; then
    VINKEY_ACCEPTANCE_DATA_DIR="$PROFILE_DIR" "$APP_BIN" >/dev/null 2>&1 &
    APP_DIRECT_PID=$!
    disown "$APP_DIRECT_PID" 2>/dev/null || true
  else
    /usr/bin/open -n --env "VINKEY_ACCEPTANCE_DATA_DIR=$PROFILE_DIR" "$APP_PATH" >/dev/null || true
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
  printf '%s\n' "BLOCKED|TB-MENU-AX-PRECONDITION|原生菜单验收启动前置条件|$STARTUP_BLOCK_REASON" >"$EVENTS_FILE"
elif ! process_exists; then
  printf '%s\n' 'BLOCKED|TB-MENU-AX-LAUNCH|启动 Tauri 应用|Accessibility 进程不可见' >"$EVENTS_FILE"
elif ! accessible_window_exists; then
  printf '%s\n' "BLOCKED|TB-MENU-AX-WINDOW-READY|等待 Tauri 窗口进入 Accessibility 树|process=$PROCESS_NAME;waitMs=$WINDOW_READY_WAIT_MS" >"$EVENTS_FILE"
else
  set +e
  "$AX_HELPER" run "$OUTPUT_DIR" "$PROCESS_NAME" "$APP_PATH" "$WINDOW_READY_WAIT_MS" "$APP_BUNDLE_ID" >"$EVENTS_FILE" 2>"$AUTOMATION_STDERR"
  AUTOMATION_EXIT=$?
  set -e
  if ((AUTOMATION_EXIT != 0)); then
    printf '%s\n' "BLOCKED|TB-MENU-AX-AUTOMATION|原生菜单 AX 助手执行失败|exit=$AUTOMATION_EXIT" >>"$EVENTS_FILE"
  fi
fi

REPOSITORY_VERSION="$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).version)" "$ROOT_DIR/package.json" 2>/dev/null || true)"
REPOSITORY_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
REPOSITORY_DIRTY="false"
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then
  REPOSITORY_DIRTY="true"
fi
SCREENSHOT_STDOUT="$OUTPUT_DIR/display-info.txt"
system_profiler SPDisplaysDataType >"$SCREENSHOT_STDOUT" 2>&1 || true

BUILD_RESULT="$OUTPUT_DIR/result.json"
EVENTS_FILE="$EVENTS_FILE" \
OUTPUT_DIR="$OUTPUT_DIR" \
REPOSITORY_VERSION="$REPOSITORY_VERSION" \
REPOSITORY_SHA="$REPOSITORY_SHA" \
REPOSITORY_DIRTY="$REPOSITORY_DIRTY" \
APP_BUNDLE_VERSION="$APP_BUNDLE_VERSION" \
APP_BUILD_NUMBER="$APP_BUILD_NUMBER" \
APP_BUNDLE_ID="$APP_BUNDLE_ID" \
TESTER_ID="$TESTER_ID" \
OS_VERSION="$OS_VERSION" \
MACHINE_ARCH="$(uname -m)" \
NODE_VERSION="$(node --version)" \
WINDOW_READY_WAIT_MS="$WINDOW_READY_WAIT_MS" \
node - "$BUILD_RESULT" <<'NODE'
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const env = process.env
const outputDir = env.OUTPUT_DIR
const eventsFile = env.EVENTS_FILE
const lines = fs.readFileSync(eventsFile, 'utf8').split(/\r?\n/u).filter(Boolean)
const cases = []
for (const line of lines) {
  const [status, caseId, title, ...rest] = line.split('|')
  if (!status || !caseId) continue
  cases.push({
    caseId,
    title: title || caseId,
    category: 'machine',
    status: ['PASS', 'FAIL', 'BLOCKED'].includes(status) ? status : 'BLOCKED',
    detail: rest.join('|') || null,
    evidence: null,
    notes: 'native-ax-macos',
    durationMs: 0,
    blockedReason: status === 'BLOCKED' ? (rest.join('|') || 'native-ax pre-condition') : null,
  })
}
const passed = cases.filter((item) => item.status === 'PASS').length
const failed = cases.filter((item) => item.status === 'FAIL').length
const blocked = cases.filter((item) => item.status === 'BLOCKED').length
const conclusion = failed > 0 ? 'FAIL' : blocked > 0 ? 'BLOCKED' : 'PASS'
const exitCode = conclusion === 'FAIL' ? 2 : 0
const menuTreePath = path.join(outputDir, 'menu-tree.json')
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  acceptance: { id: 'W0-SHELL-MENU-P', domainId: 'D-SHELL', gate: 'P' },
  suite: { id: 'UI-ACC-TITLE-BAR-001', version: 'title-bar-native-macos-1' },
  repository: { version: env.REPOSITORY_VERSION, gitSha: env.REPOSITORY_SHA || null, dirty: env.REPOSITORY_DIRTY === 'true' },
  application: {
    version: env.APP_BUNDLE_VERSION || null,
    buildNumber: env.APP_BUILD_NUMBER || null,
    gitSha: null,
    architectures: [env.MACHINE_ARCH],
    source: 'installed-app-native-ax',
    note: 'W0-SHELL-MENU-P macOS 原生菜单 AX 证据；webView 页面/焦点需 companion 或人工复核。',
  },
  provenance: {
    status: (env.APP_BUNDLE_VERSION && env.APP_BUNDLE_VERSION === env.REPOSITORY_VERSION) ? 'PASS' : 'BLOCKED',
    versionMatch: Boolean(env.APP_BUNDLE_VERSION && env.APP_BUNDLE_VERSION === env.REPOSITORY_VERSION),
    gitShaMatch: false,
    repositoryClean: env.REPOSITORY_DIRTY !== 'true',
  },
  execution: { testerId: env.TESTER_ID, testerIdBasis: 'explicit non-personal identifier' },
  environment: {
    os: 'macOS',
    osVersion: env.OS_VERSION,
    arch: env.MACHINE_ARCH,
    node: env.NODE_VERSION,
    rust: 'N/A',
    tauriCli: 'N/A',
    tauriFramework: 'N/A',
  },
  nativeBand: {
    menuTreeFile: 'menu-tree.json',
    webViewCompanion: 'not-included',
    nativePending: cases.filter((item) => item.status === 'BLOCKED').map((item) => item.caseId),
  },
  cases,
  summary: { caseCount: cases.length, passed, failed, blocked },
  exitCode,
  logFile: path.join(outputDir, 'automation-stderr.txt'),
  artifacts: { manifestFile: 'SHA256SUMS', screenshots: fs.readdirSync(path.join(outputDir, 'screenshots')).filter((f) => f.endsWith('.png')) , sha256: {} },
  conclusion,
}
fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2))
const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const entries = ['result.json', 'events.txt', 'automation-stderr.txt']
if (fs.existsSync(menuTreePath)) entries.push('menu-tree.json')
const manifestLines = entries.map((file) => `${hashOf(path.join(outputDir, file))}  ${file}`).join('\n') + '\n'
fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), manifestLines)
result.artifacts.sha256 = Object.fromEntries(entries.map((file) => [file, hashOf(path.join(outputDir, file))]))
fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2))
console.log(`${'UI-ACC-TITLE-BAR-001'} acceptance: ${conclusion} (${passed}/${cases.length} passed, ${failed} failed, ${blocked} blocked)`)
console.log(`Results: ${path.join(outputDir, 'result.json')}`)
console.log(`SHA256SUMS: ${path.join(outputDir, 'SHA256SUMS')}`)
console.log(`exit=${exitCode}`)
process.exitCode = exitCode
NODE
BUILD_EXIT=$?

if ((CREATE_ARCHIVE == 1)); then
  ARCHIVE_NAME="run-$RUN_ID.tar.gz"
  (
    cd "$OUTPUT_DIR"
    tar --sort=name --owner=0 --group=0 --numeric-owner -czf "../$ARCHIVE_NAME" .
  ) 2>"$OUTPUT_DIR/archive-stderr.txt" || true
fi
if ((BUILD_EXIT == 2)); then exit 2; fi
if ((BUILD_EXIT == 1)); then exit 1; fi
exit 0
