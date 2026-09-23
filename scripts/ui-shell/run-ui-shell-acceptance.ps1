param(
  [string]$Output,
  [string]$BaseUrl,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
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
