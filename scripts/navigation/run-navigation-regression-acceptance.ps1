$ErrorActionPreference = "Stop"

$ROOT_DIR = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $ROOT_DIR
try {
    & node scripts/navigation/run-navigation-regression-acceptance.mjs @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
