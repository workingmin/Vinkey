param(
  [string]$ProcessName = 'vinkey',
  [Parameter(Mandatory = $true)][string]$Output,
  [string]$DisplayMetadata,
  [int]$TimeoutMs = 30000
)

$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '../ui-shell/win32-native-helper.ps1'
if (-not (Test-Path $helper)) { throw "Win32 helper not found: $helper" }
. $helper

if ($DisplayMetadata) { Get-DisplayMetadata $DisplayMetadata | Out-Null }

$hwnd = Wait-WindowReady $ProcessName $TimeoutMs
if ($hwnd -eq [IntPtr]::Zero) {
    throw "No visible $ProcessName window within ${TimeoutMs}ms"
}

$procId = [uint32]0
[void][VinkeyWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
$title = [VinkeyWin32]::Title($hwnd)
$state = [VinkeyWin32]::StateString($hwnd)

Save-WindowCapture $hwnd $Output
if (-not (Test-Path $Output)) { throw "Screenshot was not created: $Output" }
$bytes = (Get-Item $Output).Length
if ($bytes -lt 20000) { throw "Screenshot is too small ($bytes bytes): $Output" }

$info = [ordered]@{
    captured      = $true
    hwnd          = $hwnd.ToString()
    pid           = $procId
    title         = $title
    windowState   = $state
    screenshot    = $Output
    screenshotBytes = $bytes
    mechanism     = 'Win32 BitBlt from screen DC (window bounds)'
}
$info | ConvertTo-Json -Compress
