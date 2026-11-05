param(
  [string]$Output,
  [string]$LogFile,
  [string]$TesterId,
  [switch]$Json,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CliArguments = @()
if ($Output) { $CliArguments += @("--output", $Output) }
if ($LogFile) { $CliArguments += @("--log-file", $LogFile) }
if ($TesterId) { $CliArguments += @("--tester-id", $TesterId) }
if ($Json) { $CliArguments += "--json" }
if ($Help) { $CliArguments += "--help" }

Push-Location $RootDirectory
try {
  & node scripts/title-bar/run-title-bar-menu-p-acceptance.mjs @CliArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
