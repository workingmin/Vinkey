param(
  [string]$App,
  [string]$Output,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$RootDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CliArguments = @()
if ($App) { $CliArguments += @('--app', $App) }
if ($Output) { $CliArguments += @('--output', $Output) }
if ($Help) { $CliArguments += '--help' }

Push-Location $RootDirectory
try {
  & node scripts/navigation/run-navigation-native-windows.mjs @CliArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
