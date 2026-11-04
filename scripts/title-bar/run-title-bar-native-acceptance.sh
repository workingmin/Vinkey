#!/usr/bin/env bash
# UI-ACC-TITLE-BAR-001 — W0-SHELL-MENU-P/F macOS 原生端到端验收
# 计划：docs/acceptance/ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
exec node scripts/title-bar/run-title-bar-native-acceptance.mjs "$@"
