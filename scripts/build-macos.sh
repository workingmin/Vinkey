#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_APP=false
OPEN_APP=false

for argument in "$@"; do
  case "$argument" in
    --install) INSTALL_APP=true ;;
    --open) OPEN_APP=true ;;
    -h|--help)
      cat <<'USAGE'
用法：npm run package:mac -- [--install] [--open]

  --install  将新生成的 Vinkey.app 替换到 /Applications/Vinkey.app
  --open     构建完成后启动新生成的应用；与 --install 一起使用时启动 /Applications 版本
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
npm run desktop:build:mac

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

if [[ "$OPEN_APP" == true ]]; then
  open -na "$APP_TO_OPEN"
  echo "已启动 ${APP_TO_OPEN}。"
fi

echo "构建产物位于 src-tauri/target/release/bundle/macos 和 dmg。"
