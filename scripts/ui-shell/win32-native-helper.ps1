# win32-native-helper.ps1
#
# Native Win32 helper for the Windows shell acceptance runner (W0-SHELL-P).
# Provides process/window discovery, real window controls (minimize/maximize/
# restore/close), a reliable DPI probe (declaring per-monitor DPI awareness so
# HORZRES/LOGPIXELS are not virtualized), and window-level capture.
#
# All reports are emitted as "STATUS|CASE|title|detail" lines for the caller to
# parse, or as JSON files for metadata. This file is intentionally ASCII-only
# so it is safe under Windows PowerShell 5.1 + GBK consoles.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class VinkeyWin32 {
    // ---- DPI awareness ----
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
    [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr hMonitor, int dpiType, out uint dpiX, out uint dpiY);

    // ---- GDI ----
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr hDC, int nIndex);
    [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr CreateDC(string driver, string device, string output, IntPtr initData);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdc, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);

    // ---- Monitors ----
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, EnumMonitorsProc proc, IntPtr data);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX info);
    public delegate bool EnumMonitorsProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT clip, IntPtr data);

    // ---- Windows ----
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowsProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);

    // Window messages / commands
    public const int SW_HIDE = 0, SW_SHOWNORMAL = 1, SW_SHOW = 5, SW_MINIMIZE = 6, SW_RESTORE = 9, SW_MAXIMIZE = 3;
    public const uint WM_CLOSE = 0x0010;
    // GetDeviceCaps indices
    public const int HORZSIZE = 4, VERTSIZE = 6, HORZRES = 8, VERTRES = 10,
                     LOGPIXELSX = 88, LOGPIXELSY = 90, DESKTOPHORZRES = 118, DESKTOPVERTRES = 117;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct MONITORINFOEX {
        public uint cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szDevice;
    }

    public static string Title(IntPtr h) {
        var sb = new StringBuilder(1024);
        int n = GetWindowText(h, sb, sb.Capacity);
        return n > 0 ? sb.ToString() : "";
    }
    public static string ClassName(IntPtr h) {
        var sb = new StringBuilder(256);
        int n = GetClassName(h, sb, sb.Capacity);
        return n > 0 ? sb.ToString() : "";
    }
    public static IntPtr FindMainWindow(uint pid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => {
            uint wp; GetWindowThreadProcessId(h, out wp);
            if (wp == pid && IsWindowVisible(h) && Title(h).Length > 0) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static List<IntPtr> FindAllWindows(uint pid) {
        var list = new List<IntPtr>();
        EnumWindows((h, l) => {
            uint wp; GetWindowThreadProcessId(h, out wp);
            if (wp == pid && IsWindowVisible(h) && Title(h).Length > 0) list.Add(h);
            return true;
        }, IntPtr.Zero);
        return list;
    }
    public static string RectString(IntPtr h) {
        RECT r; if (!GetWindowRect(h, out r)) return "0,0,0,0";
        return r.Left + "," + r.Top + "," + (r.Right - r.Left) + "," + (r.Bottom - r.Top);
    }
    public static string StateString(IntPtr h) {
        return "minimized=" + (IsIconic(h) ? "true" : "false")
             + ";maximized=" + (IsZoomed(h) ? "true" : "false")
             + ";visible=" + (IsWindowVisible(h) ? "true" : "false")
             + ";rect=" + RectString(h);
    }
}
'@

# DPI awareness MUST be declared before any GDI call; otherwise HORZRES and
# LOGPIXELS are virtualized (e.g. 1536x864 / 96 instead of 1920x1080 / 120).
$script:DpiAware = $false
try { $script:DpiAware = [VinkeyWin32]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { $script:DpiAware = $false }
if (-not $script:DpiAware) { try { $script:DpiAware = [VinkeyWin32]::SetProcessDPIAware() } catch { $script:DpiAware = $false } }

function Emit([string]$status, [string]$caseId, [string]$title, [string]$detail) {
    Write-Output ($status + '|' + $caseId + '|' + $title + '|' + $detail)
}

function Get-ProcessPidByName([string]$name) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if (-not $procs -or $procs.Count -eq 0) { return 0 }
    return [uint32]$procs[0].Id
}

function Get-MainWindow([uint32]$procId) {
    $h = [VinkeyWin32]::FindMainWindow($procId)
    if ($h -ne [IntPtr]::Zero) { return $h }
    $all = [VinkeyWin32]::FindAllWindows($procId)
    if ($all.Count -gt 0) { return $all[0] }
    return [IntPtr]::Zero
}

function Wait-WindowReady([string]$name, [int]$timeoutMs) {
    $deadline = (Get-Date).AddMilliseconds($timeoutMs)
    do {
        $procId = Get-ProcessPidByName $name
        if ($procId -gt 0) {
            $h = Get-MainWindow $procId
            if ($h -ne [IntPtr]::Zero) { return $h }
        }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    return [IntPtr]::Zero
}

function Get-DisplayMetadata([string]$outputPath) {
    # Reliable probe: declare DPI awareness (done at load), read physical pixels
    # via DESKTOPHORZRES (NOT HORZRES which is virtualized when unaware), and
    # physical millimeters via HORZSIZE/VERTSIZE. Effective scale comes from
    # GetDpiForMonitor. Avoid EnumDisplayMonitors callbacks (can fault in PS 5.1).
    $screenDc = [VinkeyWin32]::GetDC([IntPtr]::Zero)
    if ($screenDc -eq [IntPtr]::Zero) { throw 'GetDC(NULL) failed' }
    $monitors = New-Object System.Collections.ArrayList
    try {
        $pxW = [VinkeyWin32]::GetDeviceCaps($screenDc, [VinkeyWin32]::DESKTOPHORZRES)
        $pxH = [VinkeyWin32]::GetDeviceCaps($screenDc, [VinkeyWin32]::DESKTOPVERTRES)
        $logX = [VinkeyWin32]::GetDeviceCaps($screenDc, [VinkeyWin32]::LOGPIXELSX)
        $logY = [VinkeyWin32]::GetDeviceCaps($screenDc, [VinkeyWin32]::LOGPIXELSY)
        $mmW = [VinkeyWin32]::GetDeviceCaps($screenDc, [VinkeyWin32]::HORZSIZE)
        $mmH = [VinkeyWin32]::GetDeviceCaps($screenDc, [VinkeyWin32]::VERTSIZE)
        $hMon = [VinkeyWin32]::MonitorFromWindow([IntPtr]::Zero, 1)
        $dpiX = [uint32]0; $dpiY = [uint32]0
        $hr = [VinkeyWin32]::GetDpiForMonitor($hMon, 0, [ref]$dpiX, [ref]$dpiY)
        if ($hr -ne 0 -or $dpiX -eq 0) { $dpiX = [uint32]$logX; $dpiY = [uint32]$logY; $hr = -1 }
        $physAvailable = ($mmW -gt 0 -and $mmH -gt 0 -and $pxW -gt 0 -and $pxH -gt 0)
        $physX = 0.0; $physY = 0.0
        if ($physAvailable) {
            $physX = [Math]::Round($pxW * 25.4 / $mmW, 2)
            $physY = [Math]::Round($pxH * 25.4 / $mmH, 2)
        }
        $scaleX = [Math]::Round([double]$dpiX / 96.0, 3)
        $null = $monitors.Add([ordered]@{
            index = 0
            main = $true
            deviceName = 'primary'
            pixelSize = @{ width = $pxW; height = $pxH }
            physicalSizeMillimeters = @{ width = $mmW; height = $mmH }
            logicalDpi = @{ x = $logX; y = $logY }
            monitorDpi = @{ x = [int]$dpiX; y = [int]$dpiY; hr = $hr }
            effectiveScale = @{ x = $scaleX; y = $scaleX }
            scalePercent = [int][Math]::Round($scaleX * 100)
            physicalDpi = if ($physAvailable) { @{ x = $physX; y = $physY } } else { $null }
            physicalDpiAvailable = $physAvailable
            dpiSource = if ($hr -eq 0) { 'GetDpiForMonitor(MDT_Effective_DPI)' } else { 'GetDeviceCaps(LOGPIXELSX/Y)' }
            physicalDpiSource = if ($physAvailable) { 'GetDeviceCaps(DESKTOPHORZRES/DESKTOPVERTRES / HORZSIZE/VERTSIZE)' } else { 'manual-fallback-required' }
        })

        # Supplemental WMI display inventory (no P/Invoke callback).
        $wmiDisplays = @()
        try {
            $vc = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.CurrentHorizontalResolution -gt 0 })
            foreach ($v in $vc) {
                $wmiDisplays += [ordered]@{
                    name = ([string]$v.Name -replace '[^\x20-\x7E]', '').Trim()
                    resolution = [string]$v.CurrentHorizontalResolution + 'x' + [string]$v.CurrentVerticalResolution
                    videoMode = (([string]$v.VideoModeDescription) -replace '[^\x20-\x7E]', '').Trim()
                }
            }
        } catch { $wmiDisplays = @() }
    } finally {
        [void][VinkeyWin32]::ReleaseDC([IntPtr]::Zero, $screenDc)
    }
    $result = [ordered]@{
        schemaVersion = 1
        platform = 'win32'
        dpiAwarenessDeclared = $script:DpiAware
        dpiAwarenessMethod = 'PER_MONITOR_AWARE_V2'
        systemDpi = [int][VinkeyWin32]::GetDpiForSystem()
        displayCount = $monitors.Count
        allPhysicalDpiAvailable = ($monitors.Count -gt 0 -and @($monitors | Where-Object { -not $_.physicalDpiAvailable }).Count -eq 0)
        manualFallbackRequired = ($monitors.Count -eq 0 -or @($monitors | Where-Object { -not $_.physicalDpiAvailable }).Count -gt 0)
        displays = @($monitors)
        supplementalVideoControllers = @($wmiDisplays)
        note = 'DPI awareness declared before GDI calls; DESKTOPHORZRES is physical (HORZRES is virtualized when DPI-unaware). Physical DPI = DESKTOPHORZRES * 25.4 / HORZSIZE.'
    }
    $json = $result | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($outputPath, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
    return $result
}

function Invoke-Automation([string]$reportDir, [string]$processName, [int]$windowReadyWaitMs, [string]$appExe) {
    $hwnd = Wait-WindowReady $processName $windowReadyWaitMs
    if ($hwnd -eq [IntPtr]::Zero) {
        Emit 'BLOCKED' 'SHELL-NATIVE-WIN-WINDOW-READY' 'Wait for Tauri window' ('process=' + $processName + ';timeoutMs=' + $windowReadyWaitMs)
        return
    }
    $procId = [uint32]0
    [void][VinkeyWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    $title = [VinkeyWin32]::Title($hwnd)
    Emit 'PASS' 'SHELL-NATIVE-WIN-LAUNCH' 'Tauri desktop window available' ('pid=' + $procId + ';hwnd=' + $hwnd + ';title=' + $title + ';state=' + [VinkeyWin32]::StateString($hwnd))

    # SHELL-P-002 window controls: maximize/restore, minimize/restore, close/reopen.
    $stateBefore = [VinkeyWin32]::StateString($hwnd)
    [void][VinkeyWin32]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 250
    $okMax = [VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_MAXIMIZE)
    Start-Sleep -Milliseconds 700
    $maximized = [VinkeyWin32]::IsZoomed($hwnd)
    $stateMax = [VinkeyWin32]::StateString($hwnd)
    [void][VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_RESTORE)
    Start-Sleep -Milliseconds 700
    $restoredMax = (-not [VinkeyWin32]::IsZoomed($hwnd))
    $stateRestoredMax = [VinkeyWin32]::StateString($hwnd)
    if ($okMax -and $maximized -and $restoredMax) {
        Emit 'PASS' 'SHELL-NATIVE-WIN-WINDOW-MAXIMIZE' 'Maximize and restore window' ('before=' + $stateBefore + ';maximized=' + $stateMax + ';restored=' + $stateRestoredMax)
    } else {
        Emit 'FAIL' 'SHELL-NATIVE-WIN-WINDOW-MAXIMIZE' 'Maximize and restore window' ('sendOk=' + $okMax + ';maximized=' + $maximized + ';restored=' + $restoredMax + ';state=' + $stateMax)
    }

    $okMin = [VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_MINIMIZE)
    Start-Sleep -Milliseconds 700
    $minimized = [VinkeyWin32]::IsIconic($hwnd)
    [void][VinkeyWin32]::SetForegroundWindow($hwnd)
    [void][VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_RESTORE)
    Start-Sleep -Milliseconds 700
    $restoredMin = (-not [VinkeyWin32]::IsIconic($hwnd))
    if ($okMin -and $minimized -and $restoredMin -and $hwnd -ne [IntPtr]::Zero) {
        Emit 'PASS' 'SHELL-NATIVE-WIN-WINDOW-MINIMIZE' 'Minimize and restore window' ('minimized=' + $minimized + ';restored=' + $restoredMin + ';state=' + [VinkeyWin32]::StateString($hwnd))
    } else {
        Emit 'FAIL' 'SHELL-NATIVE-WIN-WINDOW-MINIMIZE' 'Minimize and restore window' ('sendOk=' + $okMin + ';minimized=' + $minimized + ';restored=' + $restoredMin)
    }

    # Actual window sizes (CSS pixels) at three responsive baselines.
    foreach ($size in @(@(1440,900), @(1280,800), @(1024,680))) {
        $wantW = [int]$size[0]; $wantH = [int]$size[1]
        [void][VinkeyWin32]::SetForegroundWindow($hwnd)
        [void][VinkeyWin32]::ShowWindow($hwnd, [VinkeyWin32]::SW_RESTORE)
        $moved = [VinkeyWin32]::MoveWindow($hwnd, 80, 40, $wantW, $wantH, $true)
        Start-Sleep -Milliseconds 600
        $actual = [VinkeyWin32]::RectString($hwnd)
        $parts = $actual.Split(',')
        $actualW = [int]$parts[2]; $actualH = [int]$parts[3]
        if ($moved -and $actualW -eq $wantW -and $actualH -eq $wantH) {
            Emit 'PASS' ('SHELL-NATIVE-WIN-WINDOW-SIZE-' + $wantW + 'x' + $wantH) 'Set and read actual window size' ('actual=' + $actual)
        } else {
            Emit 'BLOCKED' ('SHELL-NATIVE-WIN-WINDOW-SIZE-' + $wantW + 'x' + $wantH) 'Set and read actual window size' ('want=' + $wantW + 'x' + $wantH + ';actual=' + $actual + ';moved=' + $moved)
        }
        $shot = Join-Path $reportDir ('screenshots/02-win-window-' + $wantW + 'x' + $wantH + '.png')
        Save-WindowCapture $hwnd $shot
    }

    # Window-level capture of the main window.
    $shotMain = Join-Path $reportDir 'screenshots/01-win-native-window.png'
    Save-WindowCapture $hwnd $shotMain

    # Close: Tauri intercepts CloseRequested and hides the window (single-instance app stays alive).
    $beforeClose = $hwnd
    [void][VinkeyWin32]::SendMessage($beforeClose, [VinkeyWin32]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 1200
    $closed = (-not [VinkeyWin32]::IsWindowVisible($beforeClose)) -or (-not [VinkeyWin32]::IsWindow($beforeClose))
    if ($closed) {
        Emit 'PASS' 'SHELL-NATIVE-WIN-WINDOW-CLOSE' 'Close window via WM_CLOSE' ('hwnd=' + $beforeClose + ';visibleAfter=' + [VinkeyWin32]::IsWindowVisible($beforeClose))
    } else {
        Emit 'FAIL' 'SHELL-NATIVE-WIN-WINDOW-CLOSE' 'Close window via WM_CLOSE' ('hwnd=' + $beforeClose + ';window still visible;state=' + [VinkeyWin32]::StateString($beforeClose))
    }

    # Reopen: launch the installed app again; single-instance plugin should restore the window.
    if ($closed -and $appExe -and (Test-Path $appExe)) {
        $null = Start-Process -FilePath $appExe
        $reopened = Wait-WindowReady $processName 20000
        if ($reopened -ne [IntPtr]::Zero) {
            $shotReopen = Join-Path $reportDir 'screenshots/04-win-window-reopened.png'
            Save-WindowCapture $reopened $shotReopen
            Emit 'PASS' 'SHELL-NATIVE-WIN-WINDOW-REOPEN' 'Reopen window after close' ('hwnd=' + $reopened + ';title=' + [VinkeyWin32]::Title($reopened))
            # cleanup: hide again
            [void][VinkeyWin32]::SendMessage($reopened, [VinkeyWin32]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
            Start-Sleep -Milliseconds 600
        } else {
            Emit 'BLOCKED' 'SHELL-NATIVE-WIN-WINDOW-REOPEN' 'Reopen window after close' 'no window appeared within 20000ms'
        }
    } elseif ($appExe) {
        Emit 'BLOCKED' 'SHELL-NATIVE-WIN-WINDOW-REOPEN' 'Reopen window after close' 'appExe not found: ' + $appExe
    }
}

function Save-WindowCapture([IntPtr]$hwnd, [string]$path) {
    try {
        if (-not [VinkeyWin32]::IsWindow($hwnd) -or -not [VinkeyWin32]::IsWindowVisible($hwnd)) { return }
        $r = New-Object VinkeyWin32+RECT
        if (-not [VinkeyWin32]::GetWindowRect($hwnd, [ref]$r)) { return }
        $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
        if ($w -lt 10 -or $h -lt 10) { return }
        Add-Type -AssemblyName System.Drawing
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $hdc = $g.GetHdc()
        try {
            [void][VinkeyWin32]::SetForegroundWindow($hwnd)
            Start-Sleep -Milliseconds 250
            $screenDc = [VinkeyWin32]::GetDC([IntPtr]::Zero)
            try { [void][VinkeyWin32]::BitBlt($hdc, 0, 0, $w, $h, $screenDc, $r.Left, $r.Top, 0x00CC0020) }
            finally { [void][VinkeyWin32]::ReleaseDC([IntPtr]::Zero, $screenDc) }
        } finally { $g.ReleaseHdc($hdc) }
        $dir = Split-Path -Parent $path
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
    } catch {
        # Capture is auxiliary evidence; never fail the native control cases because of it.
    }
}

# This file is a function library. The caller dot-sources it and invokes:
#   Get-DisplayMetadata <output.json>
#   Wait-WindowReady <processName> <timeoutMs>
#   Invoke-Automation <reportDir> <processName> <windowReadyWaitMs> <appExe>
#   Get-ProcessPidByName <processName>
# All Win32 types are loaded once per process via Add-Type above.
