param(
  [string]$Workspace,
  [string]$Output,
  [string]$LogFile,
  [string]$TesterId,
  [switch]$KeepFixture,
  [switch]$Json,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CliArguments = @()
if ($Workspace) { $CliArguments += @("--workspace", $Workspace) }
if ($Output) { $CliArguments += @("--output", $Output) }
if ($LogFile) { $CliArguments += @("--log-file", $LogFile) }
if ($TesterId) { $CliArguments += @("--tester-id", $TesterId) }
if ($KeepFixture) { $CliArguments += "--keep-fixture" }
if ($Json) { $CliArguments += "--json" }
if ($Help) { $CliArguments += "--help" }

Push-Location $RootDirectory
try {
  & node scripts/navigation/run-navigation-acceptance.mjs @CliArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
