#!/usr/bin/env bash
# NT-MAC-001~005 桌面原生复验（macOS）包装入口。
# 显示器休眠会导致窗口 [0,0] / 空白截图 / AX 树无 WebArea，故用 caffeinate 保持唤醒；
# 并强制要求无残留 Vinkey 进程（runner 内也会再校验一次）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if pgrep -fl 'Vinkey.app/Contents/MacOS' >/dev/null 2>&1; then
  echo "已有 Vinkey 进程运行，请退出后重试。" >&2
  exit 1
fi

exec caffeinate -u -d -i node scripts/task-process/run-task-process-native-macos.mjs "$@"
