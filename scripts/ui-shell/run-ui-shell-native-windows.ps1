# run-ui-shell-native-windows.ps1
#
# Windows native shell acceptance runner (W0-SHELL-P), counterpart of the macOS
# run-ui-shell-native-macos.sh. Drives the real Tauri window via Win32, captures
# reliable display/DPI metadata, emits a contract-compliant result.json with
# provenance + privacy audit, and archives a SHA256SUMS manifest.
#
# Windows PowerShell 5.1 compatible: this file is UTF-8 with BOM (Chinese text).

$ErrorActionPreference = 'Stop'

function Print-Help {
    @'
Windows 原生壳层验收（W0-SHELL-P / W0-SHELL-P-NATIVE-WINDOWS）

用法：powershell -ExecutionPolicy Bypass -File scripts/ui-shell/run-ui-shell-native-windows.ps1 [选项]

选项：
  -Output <目录>          证据归档根目录（默认：artifacts/ui-shell-native-windows）
  -App <vinkey.exe>       指定已安装的 Vinkey 可执行文件（默认：%LOCALAPPDATA%\Vinkey\vinkey.exe）
  -ProcessName <名称>     目标进程名（默认：vinkey）
  -ProfileDir <目录>      指定隔离验收 Profile；默认创建临时目录
  -TesterId <标识>        写入结果的非个人测试标识（默认：local-tester）
  -WindowReadyTimeoutMs <毫秒>  等待原生窗口就绪的超时（默认：30000）
  -NoLaunch               不启动应用，使用已运行的 Tauri 进程（必须同时指定 -ProfileDir）
  -NoArchive              不生成标准化 tar.gz 分发包
  -Help                   显示帮助

前置条件：
  1. Windows 10 19041+ x64，已安装 Vinkey 与 WebView2 Runtime。
  2. 应用支持 VINKEY_ACCEPTANCE_DATA_DIR，写入隔离 Profile 的 vinkey-runtime.jsonl。
  3. 安装包应由当前干净 Git HEAD 构建；版本/Git SHA 不一致时 provenance 用例失败。
  4. 原生窗口控制通过 Win32 API（ShowWindow/SendMessage）执行；桌面会话必须允许窗口显示。
'@
}

# ---- parameter parsing (manual, so -Help works without binding other params) ----
$script:Opt = @{
    Output = ''
    App = ''
    ProcessName = 'vinkey'
    ProfileDir = ''
    TesterId = 'local-tester'
    WindowReadyTimeoutMs = 30000
    NoLaunch = $false
    NoArchive = $false
}
$script:Args2 = @($args | ForEach-Object { ([string]$_).Trim() })
for ($i = 0; $i -lt $script:Args2.Count; $i++) {
    $a = $script:Args2[$i]
    switch -Regex ($a) {
        '^-(Output|App|ProcessName|ProfileDir|TesterId|WindowReadyTimeoutMs)$' {
            if ($i + 1 -ge $script:Args2.Count) { [Console]::Error.WriteLine("$a 需要参数"); exit 2 }
            $i++
            $key = $a.Substring(1)
            $script:Opt[$key] = $script:Args2[$i]
        }
        '^-NoLaunch$' { $script:Opt.NoLaunch = $true }
        '^-NoArchive$' { $script:Opt.NoArchive = $true }
        '^(-Help|-h|--help)$' { Print-Help; exit 0 }
        default { [Console]::Error.WriteLine("未知参数：$a"); exit 2 }
    }
}

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DEFAULT_OUTPUT = Join-Path $ROOT_DIR 'artifacts/ui-shell-native-windows'
$OUTPUT_ROOT = if ($script:Opt.Output) { $script:Opt.Output } else { $DEFAULT_OUTPUT }
if (-not [System.IO.Path]::IsPathRooted($OUTPUT_ROOT)) { $OUTPUT_ROOT = Join-Path $ROOT_DIR $OUTPUT_ROOT }
$APP_EXE = $script:Opt.App
if (-not $APP_EXE) { $APP_EXE = Join-Path $env:LOCALAPPDATA 'Vinkey\vinkey.exe' }
$PROCESS_NAME = $script:Opt.ProcessName
$TESTER_ID = $script:Opt.TesterId
$WINDOW_TIMEOUT = [int]$script:Opt.WindowReadyTimeoutMs

if ($TESTER_ID -notmatch '^[A-Za-z0-9._-]{1,64}$') { [Console]::Error.WriteLine('-TesterId 仅允许 1-64 个字母、数字、点、下划线或连字符'); exit 2 }
if ($script:Opt.NoLaunch -and -not $script:Opt.ProfileDir) { [Console]::Error.WriteLine('-NoLaunch 必须同时指定 -ProfileDir'); exit 2 }
# Parameter validation above must precede platform checks so CLI contract tests
# can verify argument errors without a desktop session.
if ($env:OS -and $env:OS -notmatch 'Windows') { Write-Error '此入口只能在 Windows 上运行'; exit 1 }
if (-not (Test-Path $APP_EXE) -and -not $script:Opt.NoLaunch) {
    Write-Error "未找到 Vinkey 可执行文件：$APP_EXE，请用 -App 指定"; exit 2
}

# ---- dot-source Win32 helper library ----
. (Join-Path $PSScriptRoot 'win32-native-helper.ps1')

# ---- environment / provenance ----
$RUN_ID = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHHmmssZ')
if (-not (Test-Path $OUTPUT_ROOT)) { New-Item -ItemType Directory -Path $OUTPUT_ROOT -Force | Out-Null }
$OUTPUT_ROOT = (Resolve-Path $OUTPUT_ROOT).Path
$OUTPUT_DIR = Join-Path $OUTPUT_ROOT ("run-$RUN_ID")
New-Item -ItemType Directory -Path (Join-Path $OUTPUT_DIR 'screenshots') -Force | Out-Null

$OS_INFO = Get-CimInstance Win32_OperatingSystem
$OS_CAPTION = [string]$OS_INFO.Caption
$OS_BUILD = [string]$OS_INFO.BuildNumber
$OS_ARCH = [string]$env:PROCESSOR_ARCHITECTURE
try { $REPOSITORY_SHA = (git -C $ROOT_DIR rev-parse HEAD 2>$null | Out-String).Trim() } catch { $REPOSITORY_SHA = '' }
try { $REPOSITORY_VERSION = (node -e "process.stdout.write(require(process.argv[1]).version)" (Join-Path $ROOT_DIR 'package.json') 2>$null | Out-String).Trim() } catch { $REPOSITORY_VERSION = '' }
# Only product sources affect the installer; acceptance tooling/docs do not.
$PRODUCT_DIRTY = (git -C $ROOT_DIR status --porcelain -- src src-tauri package.json Cargo.toml Cargo.lock 2>$null | Out-String).Trim()
$REPOSITORY_DIRTY = if ($PRODUCT_DIRTY) { 'true' } else { 'false' }
$NODE_VERSION = (node --version 2>$null | Out-String).Trim()
$RUSTC_BIN = 'rustc'
$rustcCandidate = Join-Path $env:USERPROFILE '.cargo/bin/rustc.exe'
if (Test-Path $rustcCandidate) { $RUSTC_BIN = $rustcCandidate }
$RUST_VERSION = (& $RUSTC_BIN --version 2>$null | Out-String).Trim()
try { $TAURI_CLI = (node (Join-Path $ROOT_DIR 'node_modules/.bin/tauri') --version 2>$null | Out-String).Trim() } catch { $TAURI_CLI = '' }
if (-not $TAURI_CLI) { $TAURI_CLI = 'UNAVAILABLE' }
if (-not $RUST_VERSION) { $RUST_VERSION = 'UNAVAILABLE' }

# ---- isolated profile ----
$PROFILE_CREATED = $false
$PROFILE_DIR = $script:Opt.ProfileDir
if (-not $PROFILE_DIR) {
    $PROFILE_DIR = Join-Path ([System.IO.Path]::GetTempPath()) ("vinkey-native-profile-$RUN_ID")
    New-Item -ItemType Directory -Path $PROFILE_DIR -Force | Out-Null
    $PROFILE_CREATED = $true
    $PROFILE_MODE = 'script-temporary-isolated'
} elseif ($script:Opt.NoLaunch) {
    $PROFILE_MODE = 'external-caller-managed'
} else {
    $PROFILE_MODE = 'explicit-isolated'
}
New-Item -ItemType Directory -Path $PROFILE_DIR -Force | Out-Null
$PROFILE_DIR = (Resolve-Path $PROFILE_DIR).Path
$RUNTIME_LOG = Join-Path $PROFILE_DIR 'vinkey-runtime.jsonl'
$RUN_STARTED_MS = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# ---- launch app with isolated profile ----
$APP_PID = 0
if (-not $script:Opt.NoLaunch) {
    $existing = Get-ProcessPidByName $PROCESS_NAME
    if ($existing -gt 0) {
        $existingHwnd = Wait-WindowReady $PROCESS_NAME 1500
        if ($existingHwnd -ne [IntPtr]::Zero) {
            Write-Error "启动前已有可见的 $PROCESS_NAME 窗口；为避免关闭未保存内容，请先正常退出应用。"; exit 2
        }
    }
    $env:VINKEY_ACCEPTANCE_DATA_DIR = $PROFILE_DIR
    $proc = Start-Process -FilePath $APP_EXE -PassThru
    $APP_PID = $proc.Id
}

# ---- run native automation ----
$EVENTS_FILE = Join-Path $OUTPUT_DIR 'events.txt'
$AUTOMATION_STDERR = Join-Path $OUTPUT_DIR 'automation-stderr.txt'
$eventsRaw = & {
    try { Invoke-Automation $OUTPUT_DIR $PROCESS_NAME $WINDOW_TIMEOUT $APP_EXE }
    catch { Write-Output ("BLOCKED|SHELL-NATIVE-WIN-AUTOMATION|Native Win32 automation failed|" + $_.Exception.Message) }
} 2>$AUTOMATION_STDERR
$eventsRaw | Out-File -FilePath $EVENTS_FILE -Encoding utf8

# ---- display / DPI probe ----
$DISPLAY_METADATA = Join-Path $OUTPUT_DIR 'display-metadata.json'
$DISPLAY_EXIT = 0
try { Get-DisplayMetadata $DISPLAY_METADATA | Out-Null } catch { $DISPLAY_EXIT = 1 }

# ---- WebView companion (Playwright DOM layer) ----
$WEBVIEW_DIR = Join-Path $OUTPUT_DIR 'webview'
New-Item -ItemType Directory -Path $WEBVIEW_DIR -Force | Out-Null
$WEBVIEW_STDOUT = Join-Path $OUTPUT_DIR 'webview-stdout.txt'
$WEBVIEW_STDERR = Join-Path $OUTPUT_DIR 'webview-stderr.txt'
$COMPANION_EXIT = 0
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $compScript = Join-Path $ROOT_DIR 'scripts/ui-shell/run-ui-shell-acceptance.mjs'
    # Redirect child stderr to a file (do NOT merge with 2>&1: PS 5.1 treats
    # Vite's normal stderr lines as NativeCommandError under ErrorActionPreference=Stop).
    $comp = & node $compScript --platform win32 --skip-native-evidence --output $WEBVIEW_DIR --output-exact 2>$WEBVIEW_STDERR
    $COMPANION_EXIT = $LASTEXITCODE
    $comp | Out-File -FilePath $WEBVIEW_STDOUT -Encoding utf8
} catch { $COMPANION_EXIT = 1 }
$ErrorActionPreference = $prevEap

# ---- cleanup app ----
if ($APP_PID -gt 0) {
    Stop-Process -Id $APP_PID -Force -ErrorAction SilentlyContinue
}

# ---- assemble result.json (inline Node, same pattern as macOS runner) ----
$env:NATIVE_REPORT_DIR = $OUTPUT_DIR
$env:NATIVE_EVENTS_FILE = $EVENTS_FILE
$env:NATIVE_PROCESS_NAME = $PROCESS_NAME
$env:NATIVE_DISPLAY_METADATA = $DISPLAY_METADATA
$env:NATIVE_DISPLAY_METADATA_EXIT = [string]$DISPLAY_EXIT
# Keep env-var values ASCII to avoid PS 5.1 GBK -> Node UTF-8 corruption.
# Full localized caption is written to a JSON file and read by Node below.
$env:NATIVE_OS_VERSION = ('Windows build ' + $OS_BUILD)
$env:NATIVE_OS_CAPTION = ''
$env:NATIVE_OS_BUILD = $OS_BUILD
$env:NATIVE_ARCH = $OS_ARCH
$env:NATIVE_NODE = $NODE_VERSION
$env:NATIVE_RUST = $RUST_VERSION
$env:NATIVE_TAURI_CLI = $TAURI_CLI
$env:NATIVE_APP_EXE = (Split-Path -Leaf $APP_EXE)
$env:NATIVE_RUNTIME_LOG = $RUNTIME_LOG
$env:NATIVE_REPOSITORY_VERSION = $REPOSITORY_VERSION
$env:NATIVE_REPOSITORY_SHA = $REPOSITORY_SHA
$env:NATIVE_REPOSITORY_DIRTY = $REPOSITORY_DIRTY
$env:NATIVE_TESTER_ID = $TESTER_ID
$env:NATIVE_PROFILE_MODE = $PROFILE_MODE
$env:NATIVE_PROFILE_INJECTED = $(if ($script:Opt.NoLaunch) { '0' } else { '1' })
$env:NATIVE_COMPANION_EXIT = [string]$COMPANION_EXIT
$env:NATIVE_WEBVIEW_RESULT = (Join-Path $WEBVIEW_DIR 'result.json')
$env:NATIVE_RUN_STARTED_MS = [string]$RUN_STARTED_MS
$env:NATIVE_NO_LAUNCH = $(if ($script:Opt.NoLaunch) { '1' } else { '0' })
$env:NATIVE_ARCHIVE_NAME = $(if ($script:Opt.NoArchive) { '' } else { "run-$RUN_ID.tar.gz" })

$osMeta = @{ caption = $OS_CAPTION } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $OUTPUT_DIR '.os-meta.json'), $osMeta, (New-Object System.Text.UTF8Encoding($false)))

$nodeScript = @'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = process.env.NATIVE_REPORT_DIR
const osMetaPath = join(outputDir, '.os-meta.json')
let osCaptionLocalized = null
if (existsSync(osMetaPath)) { try { osCaptionLocalized = JSON.parse(readFileSync(osMetaPath, 'utf8')).caption } catch {} }
const eventsPath = process.env.NATIVE_EVENTS_FILE
const rawEvents = readFileSync(eventsPath, 'utf8').split(/\r?\n/u).filter(Boolean)
const cases = rawEvents.map((line) => {
  const [status, caseId, title, ...detailParts] = line.split('|')
  return { caseId, title, status, source: 'native-win32', detail: detailParts.join('|') || null }
}).filter((item) => item.caseId && ['PASS', 'FAIL', 'BLOCKED'].includes(item.status))
if (cases.length === 0) cases.push({ caseId: 'SHELL-NATIVE-WIN-AUTOMATION', title: 'Native Win32 automation', status: 'BLOCKED', detail: 'no parseable events' })

const companionResultPath = process.env.NATIVE_WEBVIEW_RESULT
let companionResult = null
if (companionResultPath && existsSync(companionResultPath)) {
  try {
    companionResult = JSON.parse(readFileSync(companionResultPath, 'utf8'))
    for (const item of companionResult.cases ?? []) cases.push({ ...item, source: 'playwright-webview' })
  } catch (error) {
    cases.push({ caseId: 'SHELL-WEBVIEW-COMPANION', title: 'Playwright WebView companion', status: 'BLOCKED', source: 'playwright-webview', detail: `cannot read companion: ${String(error)}` })
  }
} else {
  cases.push({ caseId: 'SHELL-WEBVIEW-COMPANION', title: 'Playwright WebView companion', status: 'BLOCKED', source: 'playwright-webview', detail: `no webview/result.json (exit=${process.env.NATIVE_COMPANION_EXIT || 'unknown'})` })
}

const screenshots = existsSync(join(outputDir, 'screenshots')) ? readdirSync(join(outputDir, 'screenshots')).filter((name) => name.endsWith('.png')).sort() : []
const screenshotHashes = Object.fromEntries(screenshots.map((name) => [name, createHash('sha256').update(readFileSync(join(outputDir, 'screenshots', name))).digest('hex')]))
let displayMetadata = null
try { displayMetadata = JSON.parse(readFileSync(process.env.NATIVE_DISPLAY_METADATA, 'utf8')) } catch { /* reported below */ }
const displays = Array.isArray(displayMetadata?.displays) ? displayMetadata.displays : []
const dpiOk = Number(process.env.NATIVE_DISPLAY_METADATA_EXIT) === 0
  && displays.length > 0
  && displayMetadata?.allPhysicalDpiAvailable === true
cases.push({
  caseId: 'SHELL-NATIVE-WIN-DISPLAY-SCALE',
  title: 'Reliable display scale and physical DPI probe',
  status: dpiOk ? 'PASS' : 'BLOCKED',
  source: 'native-display-probe',
  detail: dpiOk
    ? `displays=${displays.length};source=GetDpiForMonitor+GetDeviceCaps;scale=${displays[0]?.scalePercent}%;physicalDpi=${displays[0]?.physicalDpi?.x}x${displays[0]?.physicalDpi?.y}`
    : `displays=${displays.length};manual-fallback-required=true;probeExit=${process.env.NATIVE_DISPLAY_METADATA_EXIT || 'unknown'}`,
})

const profileInjected = process.env.NATIVE_PROFILE_INJECTED === '1'
cases.push({
  caseId: 'SHELL-P-ISOLATED-PROFILE',
  title: 'Isolated acceptance profile',
  status: profileInjected ? 'PASS' : 'BLOCKED',
  source: 'acceptance-runner',
  detail: profileInjected ? `mode=${process.env.NATIVE_PROFILE_MODE};environment=VINKEY_ACCEPTANCE_DATA_DIR` : 'mode=external-caller-managed;cannot prove injected profile',
})

const readRuntimeStart = () => {
  const runtimePath = process.env.NATIVE_RUNTIME_LOG
  if (!runtimePath || !existsSync(runtimePath)) return null
  const minimumTimestamp = Number(process.env.NATIVE_RUN_STARTED_MS || 0) - 5_000
  const requireCurrentRun = process.env.NATIVE_NO_LAUNCH !== '1'
  const lines = readFileSync(runtimePath, 'utf8').split(/\r?\n/u).reverse()
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.event === 'app.start' && (!requireCurrentRun || Number(entry.timestamp) >= minimumTimestamp)) return entry
    } catch { /* ignore trailing partial line */ }
  }
  return null
}
const runtimeStart = readRuntimeStart()
const runtimeFields = runtimeStart?.fields ?? {}
const applicationSha = typeof runtimeFields.commitSha === 'string' ? runtimeFields.commitSha : null
const applicationDirty = typeof runtimeFields.workingTreeDirty === 'boolean' ? runtimeFields.workingTreeDirty : null
const application = {
  path: process.env.NATIVE_APP_EXE || null,
  version: null,
  gitSha: applicationSha,
  gitShaEvidence: applicationSha ? 'app.start runtime log (VINKEY_COMMIT_SHA)' : 'UNAVAILABLE',
  buildTimeEpochMs: runtimeFields.buildTime ?? null,
  workingTreeDirtyAtBuild: applicationDirty,
  runtimeLog: existsSync(process.env.NATIVE_RUNTIME_LOG || '') ? 'runtime log observed locally; path omitted from report' : null,
}
const repository = {
  version: process.env.NATIVE_REPOSITORY_VERSION || null,
  gitSha: process.env.NATIVE_REPOSITORY_SHA || null,
  dirty: process.env.NATIVE_REPOSITORY_DIRTY === 'true',
}
const versionsAvailable = Boolean(application.version && repository.version)
const versionsMatch = versionsAvailable && application.version === repository.version
const commitsMatch = typeof applicationSha === 'string' && /^[0-9a-f]{7,40}$/iu.test(applicationSha)
  && typeof repository.gitSha === 'string' && (
    applicationSha === repository.gitSha
    || applicationSha.startsWith(repository.gitSha)
    || repository.gitSha.startsWith(applicationSha))
let provenanceStatus = 'PASS'
let provenanceDetail = `gitSha=${applicationSha}`
if (!applicationSha || !repository.gitSha) {
  provenanceStatus = 'BLOCKED'
  provenanceDetail = 'installed app did not expose VINKEY_COMMIT_SHA or repository SHA unavailable'
} else if (!commitsMatch || (versionsAvailable && !versionsMatch)) {
  provenanceStatus = 'FAIL'
  provenanceDetail = `app/repository mismatch: appSha=${applicationSha};repoSha=${repository.gitSha};appVersion=${application.version};repoVersion=${repository.version}`
} else if (repository.dirty) {
  provenanceStatus = 'BLOCKED'
  provenanceDetail = 'repository has uncommitted product-source changes; Git SHA cannot represent installed app'
}
cases.push({ caseId: 'SHELL-P-BUILD-PROVENANCE', title: 'Installed app build provenance', status: provenanceStatus, source: 'build-provenance', detail: provenanceDetail })
const provenance = { status: provenanceStatus, versionMatch: versionsMatch, gitShaMatch: commitsMatch, repositoryClean: !repository.dirty, detail: provenanceDetail }

const summary = {
  caseCount: cases.length,
  passed: cases.filter((item) => item.status === 'PASS').length,
  failed: cases.filter((item) => item.status === 'FAIL').length,
  blocked: cases.filter((item) => item.status === 'BLOCKED').length,
}
const conclusion = summary.failed > 0 ? 'FAIL' : summary.blocked > 0 ? 'BLOCKED' : 'PASS'
const exitCode = summary.failed > 0 ? 2 : summary.blocked > 0 ? 1 : 0
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  acceptance: { id: 'W0-SHELL-P-NATIVE-WINDOWS', domainId: 'D-SHELL', gate: 'P' },
  suite: { id: 'ui-shell-native-windows', version: '1.0.0' },
  repository,
  application,
  provenance,
  execution: {
    testerId: process.env.NATIVE_TESTER_ID || 'local-tester',
    testerIdBasis: 'non-personal identifier supplied by -TesterId',
    profile: { mode: process.env.NATIVE_PROFILE_MODE, environmentVariable: 'VINKEY_ACCEPTANCE_DATA_DIR', injectedByRunner: profileInjected, path: '<acceptance-profile>' },
  },
  environment: {
    os: 'Windows',
    platform: 'win32',
    osVersion: process.env.NATIVE_OS_VERSION || 'unknown',
    osCaption: osCaptionLocalized,
    osBuild: process.env.NATIVE_OS_BUILD || null,
    arch: process.env.NATIVE_ARCH || null,
    node: process.env.NATIVE_NODE || null,
    rust: process.env.NATIVE_RUST || 'UNAVAILABLE',
    tauriCli: process.env.NATIVE_TAURI_CLI || 'UNAVAILABLE',
    processName: process.env.NATIVE_PROCESS_NAME,
    displays: displayMetadata,
    dpiNote: dpiOk
      ? 'DPI awareness declared before GDI calls; physical DPI computed from DESKTOPHORZRES and HORZSIZE. Effective scale from GetDpiForMonitor.'
      : 'Reliable physical DPI unavailable; manual fallback required.',
    screenshot: {
      mechanism: 'Win32 BitBlt from screen DC (window bounds)',
      scope: 'target-application-window',
      note: 'Auxiliary visual evidence only; machine verdict is based on Win32 window state queries.',
    },
  },
  platformEvidence: {
    titlebarMenus: 'CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P',
    windowControls: 'COVERED_BY_WIN32',
    physicalDpi: dpiOk ? 'MEASURED_WITH_DPI_AWARE_GDI_PROBE' : 'BLOCKED:MANUAL_FALLBACK_REQUIRED',
  },
  cases,
  summary,
  exitCode,
  conclusion,
  artifacts: {
    screenshots,
    sha256: screenshotHashes,
    manifestFile: 'SHA256SUMS',
    outputDirectory: '.',
    events: 'events.txt',
    displayMetadata: existsSync(process.env.NATIVE_DISPLAY_METADATA) ? 'display-metadata.json' : null,
    automationStderr: existsSync(join(outputDir, 'automation-stderr.txt')) ? 'automation-stderr.txt' : null,
    webview: companionResult ? { directory: 'webview', result: 'webview/result.json', manifest: 'webview/SHA256SUMS', exitCode: Number(process.env.NATIVE_COMPANION_EXIT || 1) } : null,
    privacyAudit: { status: 'PENDING', scannedTextFiles: 0 },
    archive: process.env.NATIVE_ARCHIVE_NAME || null,
  },
}
writeFileSync(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
'@
$nodeScript | node --input-type=module

# ---- WebView child manifest ----
if (Test-Path (Join-Path $WEBVIEW_DIR 'result.json')) {
    $wvManifest = Join-Path $WEBVIEW_DIR 'SHA256SUMS'
    $lines = @()
    Get-ChildItem -Path $WEBVIEW_DIR -Recurse -File | Where-Object { $_.FullName -ne $wvManifest } | Sort-Object FullName | ForEach-Object {
        $rel = $_.FullName.Substring($WEBVIEW_DIR.Length).TrimStart('\','/').Replace('\','/')
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
        $lines += "$hash  $rel"
    }
    [System.IO.File]::WriteAllText($wvManifest, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
}

# ---- privacy redaction + audit (inline Node) ----
$env:NATIVE_REPORT_DIR = $OUTPUT_DIR
$env:NATIVE_OUTPUT_ROOT = $OUTPUT_ROOT
$env:NATIVE_REPOSITORY_ROOT = $ROOT_DIR
$env:NATIVE_PROFILE_DIR = $PROFILE_DIR
$env:NATIVE_USER_HOME = $env:USERPROFILE
$redactScript = @'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
const outputDir = process.env.NATIVE_REPORT_DIR
const textExtensions = new Set(['.applescript','.css','.html','.js','.json','.jsonl','.log','.md','.mjs','.ps1','.swift','.ts','.txt'])
const walk = (dir) => readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p] })
const replacements = [
  [process.env.NATIVE_PROFILE_DIR, '<ACCEPTANCE_PROFILE>'],
  [process.env.NATIVE_REPORT_DIR, '<RUN_OUTPUT>'],
  [process.env.NATIVE_OUTPUT_ROOT, '<OUTPUT_ROOT>'],
  [process.env.NATIVE_REPOSITORY_ROOT, '<REPO_ROOT>'],
  [process.env.NATIVE_USER_HOME, '<USER_HOME>'],
].filter(([v]) => v).sort((a, b) => b[0].length - a[0].length)
for (const p of walk(outputDir).filter((p) => textExtensions.has(extname(p).toLowerCase()))) {
  let text = readFileSync(p, 'utf8')
  for (const [value, replacement] of replacements) text = text.split(value).join(replacement)
  text = text
    .replace(/[A-Za-z]:\\+Users\\+[^\s"'<>|]+/gu, '<USER_HOME>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '<redacted-email>')
    .replace(/^(\s*[^:\r\n]*(?:Serial Number|UUID|\u5e8f\u53f7\u7801)[^:\r\n]*:\s*).+$/gimu, '$1<redacted>')
  writeFileSync(p, text)
}
'@
$redactScript | node --input-type=module

$env:NATIVE_REPORT_DIR = $OUTPUT_DIR
$auditScript = @'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
const outputDir = process.env.NATIVE_REPORT_DIR
const textExtensions = new Set(['.applescript','.css','.html','.js','.json','.jsonl','.log','.md','.mjs','.ps1','.swift','.ts','.txt'])
const walk = (dir) => readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p] })
const patterns = [
  ['windows-user-path', /[A-Za-z]:\\+Users\\+/u],
  ['email-address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu],
  ['display-serial-or-uuid', /(?:Serial Number|UUID|\u5e8f\u53f7\u7801)[^:\r\n]*:(?![ \t]*<redacted>[ \t]*(?:\r?$))[^\r\n]+/imu],
]
const findings = []
let scannedTextFiles = 0
for (const p of walk(outputDir).filter((p) => textExtensions.has(extname(p).toLowerCase()))) {
  scannedTextFiles += 1
  const text = readFileSync(p, 'utf8')
  for (const [kind, pattern] of patterns) if (pattern.test(text)) findings.push({ file: relative(outputDir, p), kind })
}
const status = findings.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(join(outputDir, 'privacy-audit.json'), `${JSON.stringify({ schemaVersion: 1, status, scannedTextFiles, findingCount: findings.length, findings }, null, 2)}\n`)
const resultPath = join(outputDir, 'result.json')
const result = JSON.parse(readFileSync(resultPath, 'utf8'))
result.cases.push({ caseId: 'SHELL-P-ARTIFACT-PRIVACY', title: 'Distributable artifact privacy redaction', status, source: 'artifact-privacy-audit', detail: `scannedTextFiles=${scannedTextFiles};findingCount=${findings.length}` })
result.summary = { caseCount: result.cases.length, passed: result.cases.filter((i) => i.status === 'PASS').length, failed: result.cases.filter((i) => i.status === 'FAIL').length, blocked: result.cases.filter((i) => i.status === 'BLOCKED').length }
result.conclusion = result.summary.failed > 0 ? 'FAIL' : result.summary.blocked > 0 ? 'BLOCKED' : 'PASS'
result.exitCode = result.summary.failed > 0 ? 2 : result.summary.blocked > 0 ? 1 : 0
result.artifacts.privacyAudit = { file: 'privacy-audit.json', status, scannedTextFiles, findingCount: findings.length }
if (status !== 'PASS') result.artifacts.archive = null
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`)
'@
$auditScript | node --input-type=module

# ---- SHA256SUMS ----
$manifest = Join-Path $OUTPUT_DIR 'SHA256SUMS'
$manLines = @()
Get-ChildItem -Path $OUTPUT_DIR -Recurse -File | Where-Object { $_.FullName -ne $manifest } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($OUTPUT_DIR.Length).TrimStart('\','/').Replace('\','/')
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    $manLines += "$hash  $rel"
}
[System.IO.File]::WriteAllText($manifest, (($manLines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

# ---- archive (tar.gz) ----
$archiveName = ''
if (-not $script:Opt.NoArchive) {
    $privacy = Get-Content (Join-Path $OUTPUT_DIR 'privacy-audit.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($privacy.status -eq 'PASS') {
        $archiveName = "run-$RUN_ID.tar.gz"
        & tar -czf (Join-Path $OUTPUT_ROOT $archiveName) -C $OUTPUT_ROOT "run-$RUN_ID" 2>$null
    }
}

# ---- fixed four-line stdout ----
$final = Get-Content (Join-Path $OUTPUT_DIR 'result.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ("ui-shell-native-windows acceptance: " + $final.conclusion + " (" + $final.summary.passed + "/" + $final.summary.caseCount + " passed, " + $final.summary.failed + " failed, " + $final.summary.blocked + " blocked)")
Write-Output ("Results: " + $OUTPUT_DIR + "/result.json")
Write-Output ("SHA256SUMS: " + $OUTPUT_DIR + "/SHA256SUMS")
Write-Output ("exit=" + $final.exitCode)

# cleanup temporary profile
if ($PROFILE_CREATED -and (Test-Path $PROFILE_DIR)) {
    Remove-Item -LiteralPath $PROFILE_DIR -Recurse -Force -ErrorAction SilentlyContinue
}
exit $final.exitCode
