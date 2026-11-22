# verify-titlebar-buttons.ps1
#
# Objective machine evidence for the self-drawn Windows title-bar buttons.
# Clicks the real minimize / maximize / close buttons rendered by the webview
# and reads back Win32 window state (IsIconic / IsZoomed / visibility).
#
# This is intentionally ASCII-only for Windows PowerShell 5.1 + GBK consoles.
# Usage: verify-titlebar-buttons.ps1 -AppExe <path> -OutputDir <dir>

param(
    [Parameter(Mandatory = $true)][string]$AppExe,
    [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'

$helper = Join-Path $PSScriptRoot '..\ui-shell\win32-native-helper.ps1'
. $helper

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VinkeyMouse {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
    public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(150);
        mouse_event(LEFTDOWN, 0, 0, 0, IntPtr.Zero);
        System.Threading.Thread.Sleep(90);
        mouse_event(LEFTUP, 0, 0, 0, IntPtr.Zero);
    }
}
'@

function New-Dir([string]$path) { if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null } }
New-Dir $OutputDir
New-Dir (Join-Path $OutputDir 'screenshots')

$cases = New-Object System.Collections.ArrayList
function Record([string]$status, [string]$caseId, [string]$detail) {
    $null = $cases.Add([ordered]@{ status = $status; caseId = $caseId; detail = $detail })
    Write-Output ($status + '|' + $caseId + '|' + $detail)
}

# Start from a clean process so the window is genuinely freshly launched.
Get-Process -Name 'vinkey' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600
$null = Start-Process -FilePath $AppExe

$hwnd = Wait-WindowReady 'vinkey' 30000
if ($hwnd -eq [IntPtr]::Zero) {
    Record 'BLOCKED' 'BTN-WINDOW-READY' 'no vinkey window within 30000ms'
    $result = [ordered]@{ schemaVersion = 1; cases = @($cases) }
    [System.IO.File]::WriteAllText((Join-Path $OutputDir 'result.json'), ($result | ConvertTo-Json -Depth 8) + "`n", (New-Object System.Text.UTF8Encoding($false)))
    exit 1
}

$procId = [uint32]0
[void][VinkeyWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
Record 'PASS' 'BTN-WINDOW-READY' ('pid=' + $procId + ';hwnd=' + $hwnd + ';title=' + [VinkeyWin32]::Title($hwnd))

# Place the window at a known rectangle so button coordinates are deterministic.
[void][VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_RESTORE)
[void][VinkeyWin32]::MoveWindow($hwnd, 80, 60, 1200, 820, $true)
Start-Sleep -Milliseconds 600
[void][VinkeyWin32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 300

$scale = [double][VinkeyWin32]::GetDpiForWindow($hwnd) / 96.0

# Title bar is 36 CSS px; each window control is 44 CSS px wide, right-aligned.
# IMPORTANT: recompute before every click - the window rect changes on maximize.
function Get-ButtonPoints([IntPtr]$h) {
    $rc = New-Object VinkeyWin32+RECT
    [void][VinkeyWin32]::GetWindowRect($h, [ref]$rc)
    return [ordered]@{
        rect   = [VinkeyWin32]::RectString($h)
        y      = [int]($rc.Top + [Math]::Round(18 * $scale))
        close  = [int]($rc.Right - [Math]::Round(22 * $scale))
        max    = [int]($rc.Right - [Math]::Round(66 * $scale))
        min    = [int]($rc.Right - [Math]::Round(110 * $scale))
    }
}

$geom = Get-ButtonPoints $hwnd
Record 'PASS' 'BTN-GEOMETRY' ('scale=' + $scale + ';rect=' + $geom.rect + ';min=' + $geom.min + ',' + $geom.y + ';max=' + $geom.max + ',' + $geom.y + ';close=' + $geom.close + ',' + $geom.y)

# 1) Maximize button.
[void][VinkeyWin32]::SetForegroundWindow($hwnd)
$geom = Get-ButtonPoints $hwnd
[VinkeyMouse]::Click($geom.max, $geom.y)
Start-Sleep -Milliseconds 900
$maxed = [VinkeyWin32]::IsZoomed($hwnd)
$shotMax = Join-Path $OutputDir 'screenshots/01-after-maximize-click.png'
Save-WindowCapture $hwnd $shotMax
Record $(if ($maxed) { 'PASS' } else { 'FAIL' }) 'BTN-MAXIMIZE' ('IsZoomed=' + $maxed + ';state=' + [VinkeyWin32]::StateString($hwnd))

# 2) Restore via the same (maximize/restore toggle) button - recompute rect.
[void][VinkeyWin32]::SetForegroundWindow($hwnd)
$geom = Get-ButtonPoints $hwnd
[VinkeyMouse]::Click($geom.max, $geom.y)
Start-Sleep -Milliseconds 900
$restored = -not [VinkeyWin32]::IsZoomed($hwnd)
Record $(if ($restored) { 'PASS' } else { 'FAIL' }) 'BTN-RESTORE' ('IsZoomed=' + (-not $restored) + ';state=' + [VinkeyWin32]::StateString($hwnd))

# 3) Minimize button.
[void][VinkeyWin32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 200
$geom = Get-ButtonPoints $hwnd
[VinkeyMouse]::Click($geom.min, $geom.y)
Start-Sleep -Milliseconds 900
$minimized = [VinkeyWin32]::IsIconic($hwnd)
Record $(if ($minimized) { 'PASS' } else { 'FAIL' }) 'BTN-MINIMIZE' ('IsIconic=' + $minimized + ';state=' + [VinkeyWin32]::StateString($hwnd))

# Bring back for the close test.
[void][VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_RESTORE)
[void][VinkeyWin32]::MoveWindow($hwnd, 80, 60, 1200, 820, $true)
Start-Sleep -Milliseconds 500
[void][VinkeyWin32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 300

# 4) Close button: Tauri intercepts CloseRequested and hides the window.
$geom = Get-ButtonPoints $hwnd
[VinkeyMouse]::Click($geom.close, $geom.y)
Start-Sleep -Milliseconds 1500
$closed = (-not [VinkeyWin32]::IsWindowVisible($hwnd)) -or (-not [VinkeyWin32]::IsWindow($hwnd))
Record $(if ($closed) { 'PASS' } else { 'FAIL' }) 'BTN-CLOSE' ('visibleAfter=' + [VinkeyWin32]::IsWindowVisible($hwnd) + ';isWindow=' + [VinkeyWin32]::IsWindow($hwnd) + ';clicked=' + $geom.close + ',' + $geom.y)

# Cleanup any remaining process.
Get-Process -Name 'vinkey' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$pass = @($cases | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($cases | Where-Object { $_.status -eq 'FAIL' }).Count
$blocked = @($cases | Where-Object { $_.status -eq 'BLOCKED' }).Count
$result = [ordered]@{
    schemaVersion = 1
    appExe = $AppExe
    appMtime = (Get-Item $AppExe).LastWriteTime.ToString('o')
    scale = $scale
    summary = [ordered]@{ pass = $pass; fail = $fail; blocked = $blocked }
    cases = @($cases)
}
[System.IO.File]::WriteAllText((Join-Path $OutputDir 'result.json'), ($result | ConvertTo-Json -Depth 8) + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("SUMMARY|pass=" + $pass + ";fail=" + $fail + ";blocked=" + $blocked)
if ($fail -gt 0 -or $blocked -gt 0) { exit 1 }
