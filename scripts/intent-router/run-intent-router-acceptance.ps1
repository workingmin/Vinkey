param(
  [string]$ProfileId,
  [string]$Db,
  [string]$LogFile,
  [int]$TimeoutMs = 120000,
  [switch]$ListProfiles,
  [switch]$Json,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CliArguments = @()
if ($ProfileId) { $CliArguments += @("--profile-id", $ProfileId) }
if ($Db) { $CliArguments += @("--db", $Db) }
if ($LogFile) { $CliArguments += @("--log-file", $LogFile) }
if ($PSBoundParameters.ContainsKey("TimeoutMs")) { $CliArguments += @("--timeout-ms", [string]$TimeoutMs) }
if ($ListProfiles) { $CliArguments += "--list-profiles" }
if ($Json) { $CliArguments += "--json" }
if ($Help) { $CliArguments += "--help" }

Push-Location $RootDirectory
try {
  & node scripts/intent-router/run-intent-router-acceptance.mjs @CliArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
