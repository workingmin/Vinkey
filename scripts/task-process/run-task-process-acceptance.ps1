param(
  [string]$Workspace,
  [string]$JobId,
  [string]$Manual,
  [string]$DumpManual,
  [string]$Output,
  [string]$ProfileId,
  [string]$Db,
  [string]$LogFile,
  [string]$TesterId,
  [int]$TimeoutMs = 120000,
  [switch]$ListProfiles,
  [switch]$Json,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CliArguments = @()
if ($Workspace) { $CliArguments += @("--workspace", $Workspace) }
if ($JobId) { $CliArguments += @("--job-id", $JobId) }
if ($Manual) { $CliArguments += @("--manual", $Manual) }
if ($DumpManual) { $CliArguments += @("--dump-manual", $DumpManual) }
if ($Output) { $CliArguments += @("--output", $Output) }
if ($ProfileId) { $CliArguments += @("--profile-id", $ProfileId) }
if ($Db) { $CliArguments += @("--db", $Db) }
if ($LogFile) { $CliArguments += @("--log-file", $LogFile) }
if ($TesterId) { $CliArguments += @("--tester-id", $TesterId) }
if ($PSBoundParameters.ContainsKey("TimeoutMs")) { $CliArguments += @("--timeout-ms", [string]$TimeoutMs) }
if ($ListProfiles) { $CliArguments += "--list-profiles" }
if ($Json) { $CliArguments += "--json" }
if ($Help) { $CliArguments += "--help" }

Push-Location $RootDirectory
try {
  & node scripts/task-process/run-task-process-acceptance.mjs @CliArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
