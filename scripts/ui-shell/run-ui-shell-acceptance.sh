#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "$(uname -s)" == "Darwin" && "${1:-}" != "--browser" ]]; then
  exec bash "$ROOT_DIR/scripts/ui-shell/run-ui-shell-native-macos.sh" "$@"
fi

if [[ "${1:-}" == "--browser" ]]; then shift; fi
if [[ ! -f "$ROOT_DIR/node_modules/playwright/package.json" ]]; then
  printf '%s\n' "未找到 Playwright 依赖。请在仓库根目录先执行：npm install --include=dev && npx playwright install chromium" >&2
  exit 1
fi
exec node "$ROOT_DIR/scripts/ui-shell/run-ui-shell-acceptance.mjs" "$@"
