#!/usr/bin/env bash
set -euo pipefail

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

npm ci --include=dev
npm test
npm run desktop:build:mac

echo "构建产物位于 src-tauri/target/release/bundle/macos 和 dmg。"
