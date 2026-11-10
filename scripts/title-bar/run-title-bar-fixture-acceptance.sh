#!/usr/bin/env bash
# UI-ACC-TITLE-BAR-FIXTURE-001 — W0-SHELL-MENU-F 独立门槛验收（macOS / Linux）
# 计划：docs/acceptance/ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
exec node scripts/title-bar/run-title-bar-fixture-acceptance.mjs "$@"
