# uia-helper.ps1
#
# Windows UI Automation helper for the long-task native acceptance runner.
# It is the Windows counterpart of scripts/title-bar/menu-ax-helper.swift:
#   texts    <out.json> [limit]            flat UIAutomation text/button strings
#   ax-tree  <out.json>                    flat UIAutomation tree (role/title/expanded)
#   press-ax <out.json> <role|*> <title>    find by role+exact name and Invoke()
#   activate <out.json>                    foreground the target window
#
# Requires WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--force-renderer-accessibility
# on the target app so the WebView2 accessibility tree is exposed to UIA.
# ASCII-only source (safe under Windows PowerShell 5.1 + GBK consoles); all
# human-facing strings arrive from the target app at runtime and are written
# as UTF-8 (no BOM) JSON.
param(
    [Parameter(Mandatory=$true)][string]$Command,
    [string]$OutJson = "",
    [string]$Arg1 = "",
    [string]$Arg2 = ""
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-TargetWindows {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $list = New-Object System.Collections.ArrayList
    $procs = @(Get-Process -Name vinkey -ErrorAction SilentlyContinue)
    foreach ($p in $procs) {
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$p.Id)
        $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
        if ($null -ne $win) { [void]$list.Add($win) }
    }
    return $list
}

function Get-AllElements {
    param($Windows)
    $nodes = New-Object System.Collections.ArrayList
    foreach ($win in $Windows) {
        $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($el in $all) {
            [void]$nodes.Add($el)
        }
    }
    return $nodes
}

function Node-Type([System.Windows.Automation.AutomationElement]$el) {
    return $el.Current.ControlType.ProgrammaticName
}

function Node-Expanded([System.Windows.Automation.AutomationElement]$el) {
    try {
        $pattern = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) {
            return [string]$pattern.Current.ExpandCollapseState
        }
    } catch { }
    return $null
}

function Write-Json([string]$path, $object) {
    $json = $object | ConvertTo-Json -Depth 12
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($path, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
}

$windows = Get-TargetWindows
$outPath = if ($OutJson) { $OutJson } else { Join-Path (Get-Location) ("uia-" + $Command + ".json") }
$payload = [ordered]@{ ok = $false; platform = 'win32'; command = $Command; processCount = @(Get-Process -Name vinkey -ErrorAction SilentlyContinue).Count }

switch ($Command) {
    'texts' {
        $limit = 500
        if ($Arg1 -match '^\d+$') { $limit = [int]$Arg1 }
        $els = Get-AllElements $windows
        $texts = New-Object System.Collections.ArrayList
        foreach ($el in $els) {
            $name = [string]$el.Current.Name
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            [void]$texts.Add($name)
            if ($texts.Count -ge $limit) { break }
        }
        $payload.ok = $true
        $payload.texts = @($texts)
        $payload.textCount = $texts.Count
    }
    'ax-tree' {
        $els = Get-AllElements $windows
        $nodes = New-Object System.Collections.ArrayList
        foreach ($el in $els) {
            $name = [string]$el.Current.Name
            $aid = [string]$el.Current.AutomationId
            if ([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($aid)) { continue }
            [void]$nodes.Add([ordered]@{
                role = (Node-Type $el)
                title = $name
                automationId = $aid
                offscreen = [bool]$el.Current.IsOffscreen
                enabled = [bool]$el.Current.IsEnabled
                expanded = (Node-Expanded $el)
            })
        }
        $payload.ok = $true
        $payload.axTree = @($nodes)
        $payload.nodeCount = $nodes.Count
    }
    'press-ax' {
        $wantedRole = $Arg1
        $wantedTitle = $Arg2
        if ([string]::IsNullOrEmpty($wantedTitle)) {
            $payload.error = 'usage: press-ax <out> <role|*> <exact-title>'
        } else {
            $els = Get-AllElements $windows
            $target = $null
            foreach ($el in $els) {
                $role = Node-Type $el
                $name = ([string]$el.Current.Name).Trim()
                $desc = ([string]$el.Current.HelpText).Trim()
                $roleOk = ($wantedRole -eq '*') -or ($role -like ('*' + $wantedRole + '*'))
                if ($roleOk -and ($name -ceq $wantedTitle -or $desc -ceq $wantedTitle)) {
                    $target = $el; break
                }
            }
            if ($null -ne $target) {
                $ok = $false
                try {
                    $invoke = $null
                    if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) {
                        $invoke.Invoke(); $ok = $true
                    } else {
                        $legacy = $null
                        if ($target.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$legacy)) {
                            $legacy.DoDefaultAction(); $ok = $true
                        }
                    }
                } catch { $ok = $false }
                Start-Sleep -Milliseconds 600
                $payload.ok = $ok
                $payload.pressAx = [ordered]@{
                    ok = $ok
                    role = $wantedRole
                    title = $wantedTitle
                    matchedRole = (Node-Type $target)
                    matchedName = [string]$target.Current.Name
                }
            } else {
                $payload.error = 'no-uia-match'
                $payload.role = $wantedRole
                $payload.title = $wantedTitle
            }
        }
    }
    'activate' {
        $ok = $false
        foreach ($win in $windows) {
            try {
                $handle = [IntPtr]$win.Current.NativeWindowHandle
                if ($handle -ne [IntPtr]::Zero) {
                    Add-Type -Namespace VinkeyNative -Name Foreground -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int cmd);
'@
                    [void][VinkeyNative.Foreground]::ShowWindow($handle, 9)
                    [void][VinkeyNative.Foreground]::SetForegroundWindow($handle)
                    $ok = $true
                }
            } catch { }
        }
        $payload.ok = $ok
        $payload.activated = $ok
    }
    default {
        $payload.error = 'unknown-command'
    }
}

Write-Json $outPath $payload
Write-Output ("CMD=" + $Command + " OK=" + $payload.ok + " WINDOWS=" + $windows.Count + " OUT=" + $outPath)
