$ErrorActionPreference = "Stop"

$ROOT_DIR = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $ROOT_DIR
try {
    & node scripts/chat/run-chat-acceptance.mjs @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
