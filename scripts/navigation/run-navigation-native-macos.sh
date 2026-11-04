#!/usr/bin/env bash
# UI-ACC-NAV-NATIVE-001 — D-NAV 原生窗口验收（macOS）
# 真实启动 /Applications/Vinkey.app + 隔离 Profile + CoreGraphics 窗口截图。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
exec node scripts/navigation/run-navigation-native-macos.mjs "$@"
