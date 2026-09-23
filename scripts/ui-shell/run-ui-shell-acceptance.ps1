param(
  [string]$Output,
  [string]$BaseUrl,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $RootDirectory "node_modules/playwright/package.json"))) {
  Write-Error "未找到 Playwright 依赖。请在仓库根目录先执行：npm install --include=dev; npx playwright install chromium"
  exit 1
}
$CliArguments = @()
if ($Output) { $CliArguments += @("--output", $Output) }
if ($BaseUrl) { $CliArguments += @("--base-url", $BaseUrl) }
if ($Help) { $CliArguments += "--help" }

Push-Location $RootDirectory
try {
  & node scripts/ui-shell/run-ui-shell-acceptance.mjs @CliArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
