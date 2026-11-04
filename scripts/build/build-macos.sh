#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_APP=true
OPEN_APP=false

for argument in "$@"; do
  case "$argument" in
    --install) INSTALL_APP=true ;;
    --no-install) INSTALL_APP=false ;;
    --open) OPEN_APP=true ;;
    -h|--help)
      cat <<'USAGE'
用法：npm run package:mac -- [--install|--no-install] [--open]

  --install     将新生成的 Vinkey.app 更新到 /Applications/Vinkey.app（默认）
  --no-install  只生成构建产物，不修改 /Applications
  --open        构建完成后启动应用；默认启动 /Applications 版本
USAGE
      exit 0
      ;;
    *)
      echo "错误：未知参数 ${argument}。使用 --help 查看用法。" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "错误：macOS .app/.dmg 必须在 macOS 构建机上生成。" >&2
  exit 1
fi

for command_name in npm cargo rustc; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "错误：缺少必需命令 ${command_name}。" >&2
    exit 1
  fi
done

cd "$ROOT_DIR"
npm ci --include=dev
npm test
# Build only the .app with Tauri. Its DMG bundler shells out to create-dmg,
# which fails in two ways on current macOS: (1) it drives Finder through
# AppleScript and dies with -10004 when the terminal lacks Automation
# permission, and (2) even with --skip-jenkins its find_mount_dir helper gets
# "grep: bad regex '/dev/diskN': brackets ([ ]) not balanced" and aborts the
# final image conversion, leaving a mounted rw.*.dmg behind. We therefore skip
# Tauri's DMG step and wrap the .app with `hdiutil create` below, which needs
# neither Finder nor AppleScript.
CI=true npx tauri build --bundles app

APP_SOURCE="$ROOT_DIR/src-tauri/target/release/bundle/macos/Vinkey.app"
APP_INSTALL_PATH="/Applications/Vinkey.app"

if [[ ! -d "$APP_SOURCE" ]]; then
  echo "错误：未找到构建产物 ${APP_SOURCE}。" >&2
  exit 1
fi

APP_TO_OPEN="$APP_SOURCE"
if [[ "$INSTALL_APP" == true ]]; then
  if [[ ! -d "/Applications" || ! -w "/Applications" ]]; then
    echo "错误：当前用户没有写入 /Applications 的权限，无法安装 Vinkey.app。" >&2
    exit 1
  fi
  # ditto replaces the bundle contents while preserving macOS resource forks and metadata.
  ditto "$APP_SOURCE" "$APP_INSTALL_PATH"
  APP_TO_OPEN="$APP_INSTALL_PATH"
  echo "已更新 ${APP_INSTALL_PATH}。"
fi

# Wrap the built .app into a DMG using hdiutil only (no Finder/AppleScript).
APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_SOURCE/Contents/Info.plist" 2>/dev/null || echo 0.0.0)"
APP_NAME="$(basename "$APP_SOURCE" .app)"
case "$(uname -m)" in
  arm64) DMG_ARCH=aarch64 ;;
  x86_64) DMG_ARCH=x64 ;;
  *) DMG_ARCH="$(uname -m)" ;;
esac
DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
DMG_PATH="$DMG_DIR/${APP_NAME}_${APP_VERSION}_${DMG_ARCH}.dmg"
DMG_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/vinkey-dmg.XXXXXX")"
cleanup_dmg_stage() { rm -rf "$DMG_STAGE"; }
trap cleanup_dmg_stage EXIT
ditto "$APP_SOURCE" "$DMG_STAGE/${APP_NAME}.app"
ln -s /Applications "$DMG_STAGE/Applications"
mkdir -p "$DMG_DIR"
rm -f "$DMG_PATH"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGE" -ov -format UDZO "$DMG_PATH" >/dev/null
rm -rf "$DMG_STAGE"
trap - EXIT
echo "已生成 DMG：$DMG_PATH"

if [[ "$OPEN_APP" == true ]]; then
  open -na "$APP_TO_OPEN"
  echo "已启动 ${APP_TO_OPEN}。"
fi

echo "构建产物位于 src-tauri/target/release/bundle/macos 和 dmg。"
