import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

function embeddedNativeNodeBlocks(script: string) {
  return [...script.matchAll(/node --input-type=module[^\n]*<<'NODE'\n([\s\S]*?)\nNODE/gu)]
    .map((match) => match[1])
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('UI shell acceptance CLI', () => {
  it('documents output and external-server options without starting a browser', () => {
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-acceptance.mjs'), '--help'], {
      cwd: tmpdir(),
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('test:ui-shell-acceptance')
    expect(result.stdout).toContain('--output')
    expect(result.stdout).toContain('--base-url')
    expect(result.stdout).toContain('--platform')
    expect(result.stdout).toContain('--skip-native-evidence')
    expect(result.stdout).toContain('--output-exact')
  })

  it('documents the macOS native accessibility runner without launching a desktop app', () => {
    const result = spawnSync('bash', [resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-native-macos.sh'), '--help'], {
      cwd: tmpdir(),
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--app')
    expect(result.stdout).toContain('/Applications/Vinkey.app')
    expect(result.stdout).toContain('--dev')
    expect(result.stdout).toContain('--process-name')
    expect(result.stdout).toContain('--profile-dir')
    expect(result.stdout).toContain('--tester-id')
    expect(result.stdout).toContain('--no-archive')
    expect(result.stdout).toContain('辅助功能')
    expect(result.stdout).toContain('macOS 15+')
    expect(result.stdout).toContain('swiftc')
    expect(result.stdout).toContain('ScreenCaptureKit')
    const script = readFileSync(resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-native-macos.sh'), 'utf8')
    expect(script).toContain('SHELL-P-BUILD-PROVENANCE')
    expect(script).toContain('--skip-native-evidence')
    expect(script).toContain('NATIVE_APP_BUILD_NUMBER')
    expect(script).toContain('tauriFramework')
    expect(script).toContain('OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(script).toContain('SHELL-NATIVE-MAC-MENU-CONTRACT-GUARD')
    expect(script).toContain('CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(script).toContain('on pressTrafficLight(appName, buttonKind)')
    expect(script).toContain('perform action "AXPress" of candidateButton')
    expect(script).toContain('on restoreMinimizedWindow(appName)')
    expect(script).toContain('accessible_window_exists()')
    expect(script).toContain('exists front window')
    expect(script).toContain('return (count of windows) > 0')
    expect(script).toContain('MIN_MACOS_MAJOR=15')
    expect(script).toContain('command -v swiftc')
    expect(script).toContain('swiftc -O -target')
    expect(script).toContain('SCScreenshotManager.captureImage')
    expect(script).toContain('SCContentFilter(desktopIndependentWindow: window)')
    expect(script).toContain('largest-visible-target-application-window')
    expect(script).not.toContain('SCContentFilter(display:')
    expect(script).toContain("mechanism: 'ScreenCaptureKit.SCScreenshotManager'")
    expect(script).not.toContain('command -v screencapture')
    expect(script).not.toContain('/usr/sbin/screencapture')
    expect(script).toContain('SHELL-NATIVE-MAC-PRECONDITION')
    expect(script).toContain('SHELL-NATIVE-MAC-WINDOW-READY')
    expect(script).toContain('SHELL-NATIVE-MAC-WINDOW-REOPEN')
    expect(script).toContain('04-mac-window-reopened.png')
    expect(script).toContain('WINDOW_READY_WAIT_MS')
    expect(script).toContain("version: '1.5.0'")
    expect(script).toContain('NSScreen.screens')
    expect(script).toContain('backingScaleFactor')
    expect(script).toContain('CGDisplayPixelsWide')
    expect(script).toContain('CGDisplayScreenSize')
    expect(script).toContain('manual-fallback-required')
    expect(script).toContain('display-metadata.json')
    expect(script).not.toContain('displayScaleEstimate')
    expect(script).toContain('VINKEY_ACCEPTANCE_DATA_DIR')
    expect(script).toContain('/usr/bin/open -n --env')
    expect(script).toContain('SHELL-P-ISOLATED-PROFILE')
    expect(script).toContain('SHELL-P-ARTIFACT-PRIVACY')
    expect(script).toContain('privacy-audit.json')
    expect(script).toContain('--uid 0 --gid 0 --uname root --gname wheel')
    expect(script).toContain('COPYFILE_DISABLE=1 /usr/bin/tar')
    expect(script).not.toContain('REPOSITORY_COMMITTER')
    expect(script).not.toContain('lastCommitter')
    expect(script).not.toContain('set zoomButton to candidate')
    expect(script).not.toContain('click zoomButton')
    expect(script).not.toContain('click minimizeButton')
    expect(script).not.toContain('click closeButton')
    expect(script).not.toContain('SHELL-NATIVE-MAC-MENU-OPEN')
    expect(script).not.toContain('menu item "日志中心"')
  })

  it('requires an explicit profile when attaching to an existing macOS process', () => {
    const result = spawnSync('bash', [
      resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-native-macos.sh'),
      '--no-launch',
    ], { cwd: tmpdir(), encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--no-launch 必须同时指定 --profile-dir')
  })

  it('redacts native text artifacts and fails closed when a privacy leak remains', () => {
    const output = mkdtempSync(join(tmpdir(), 'vinkey-native-privacy-'))
    temporaryDirectories.push(output)
    const script = readFileSync(resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-native-macos.sh'), 'utf8')
    const blocks = embeddedNativeNodeBlocks(script)
    expect(blocks).toHaveLength(5)
    writeFileSync(join(output, 'result.json'), JSON.stringify({
      cases: [],
      summary: { caseCount: 0, passed: 0, failed: 0, blocked: 0 },
      artifacts: { archive: 'run-test.tar.gz' },
    }))
    writeFileSync(join(output, 'leak.log'), [
      '/Users/alice/project',
      '/home/bob/work',
      'C:\\Users\\carol\\project',
      'alice@example.com',
      'Display Serial Number: SECRET-SERIAL',
      '显示器序列号: SECRET-LOCALIZED',
      'UUID: SECRET-UUID',
      repositoryRoot,
      '/tmp/vinkey-profile/vinkey-runtime.jsonl',
    ].join('\n'))
    const redact = spawnSync(process.execPath, ['--input-type=module'], {
      input: blocks[1],
      encoding: 'utf8',
      env: {
        ...process.env,
        NATIVE_REPORT_DIR: output,
        NATIVE_OUTPUT_ROOT: tmpdir(),
        NATIVE_REPOSITORY_ROOT: repositoryRoot,
        NATIVE_PROFILE_DIR: '/tmp/vinkey-profile',
        NATIVE_USER_HOME: '/Users/alice',
      },
    })
    expect(redact.status, redact.stderr).toBe(0)
    const redacted = readFileSync(join(output, 'leak.log'), 'utf8')
    expect(redacted).toContain('<USER_HOME>')
    expect(redacted).toContain('<redacted-email>')
    expect(redacted).toContain('Display Serial Number: <redacted>')
    expect(redacted).toContain('显示器序列号: <redacted>')
    expect(redacted).toContain('UUID: <redacted>')
    expect(redacted).toContain('<REPO_ROOT>')
    expect(redacted).toContain('<ACCEPTANCE_PROFILE>')

    writeFileSync(join(output, 'late-leak.txt'), '/Users/not-redacted/private.txt\n')
    const audit = spawnSync(process.execPath, ['--input-type=module'], {
      input: blocks[2],
      encoding: 'utf8',
      env: { ...process.env, NATIVE_REPORT_DIR: output },
    })
    expect(audit.status, audit.stderr).toBe(0)
    const privacy = JSON.parse(readFileSync(join(output, 'privacy-audit.json'), 'utf8')) as {
      status: string
      findingCount: number
    }
    const report = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8')) as {
      conclusion: string
      exitCode: number
      artifacts: { archive: string | null; privacyAudit: { status: string } }
    }
    expect(privacy.status).toBe('FAIL')
    expect(privacy.findingCount).toBe(1)
    expect(report.conclusion).toBe('FAIL')
    expect(report.exitCode).toBe(2)
    expect(report.artifacts.archive).toBeNull()
    expect(report.artifacts.privacyAudit.status).toBe('FAIL')
  })

  it('keeps the macOS main window available for a later reopen event', () => {
    const appSource = readFileSync(resolve(repositoryRoot, 'src-tauri/src/lib.rs'), 'utf8')
    const windowSource = readFileSync(resolve(repositoryRoot, 'src-tauri/src/window_controls.rs'), 'utf8')
    expect(appSource).toContain('tauri::RunEvent::Reopen')
    expect(appSource).toContain('restore_main_window(app_handle, has_visible_windows)')
    expect(windowSource).toContain('WindowEvent::CloseRequested')
    expect(windowSource).toContain('api.prevent_close()')
    expect(windowSource).toContain('target.hide()')
    expect(appSource).toContain('path.file_name()')
    expect(appSource).toContain('窗口诊断日志：<app-data>/vinkey-window.log')
    expect(appSource).not.toContain('path.display().to_string()')
  })

  it('keeps title-bar menu interaction outside the W0-SHELL-P browser runner', () => {
    const script = readFileSync(resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-acceptance.mjs'), 'utf8')
    expect(script).toContain('OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(script).toContain("const expectedMenus = ['项目', '会话', '编辑', '查看', '窗口', '帮助']")
    expect(script).toContain('CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(script).not.toContain("getByRole('button', { name: '文件', exact: true }).click()")
    expect(script).not.toContain("getByRole('menu').waitFor()")
  })

  it('waits for painted UI state and covers the runtime diagnostics workflow', () => {
    const script = readFileSync(resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-acceptance.mjs'), 'utf8')
    expect(script).toContain('waitForStableWidth(sidebar, 52)')
    expect(script).toContain('waitForStableWidth(sidebar, 288)')
    expect(script).toContain("waitForThemePaint(page, 'light')")
    expect(script).toContain("animations: 'disabled'")
    expect(script).toContain('SHELL-P-006-DIAGNOSTICS-${platform}')
    expect(script).toContain('vinkey:ui-acceptance-runtime-diagnostics')
    expect(script).toContain("page.keyboard.press('Escape')")
    expect(script).toContain('navigator.clipboard.readText()')
    expect(script).toContain("version: '1.2.0'")
  })

  it('does not allow the native evidence gate to be skipped outside a platform companion run', () => {
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-acceptance.mjs'),
      '--skip-native-evidence',
    ], { cwd: tmpdir(), encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('只能与 --platform 一起')
  })

  it('writes a blocked result for an invalid server instead of reporting a pass', () => {
    const output = mkdtempSync(join(tmpdir(), 'vinkey-shell-acceptance-'))
    temporaryDirectories.push(output)
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-acceptance.mjs'),
      '--output', output,
      '--base-url', 'http://127.0.0.1:1',
    ], { cwd: tmpdir(), encoding: 'utf8', timeout: 60_000 })
    expect(result.status).toBe(1)
    const runDirectory = join(output, readdirSync(output).find((entry) => statSync(join(output, entry)).isDirectory())!)
    const report = JSON.parse(readFileSync(join(runDirectory, 'result.json'), 'utf8')) as {
      acceptance: { id: string; domainId: string; gate: string }
      conclusion: string
      exitCode: number
      artifacts: { manifestFile: string }
      summary: { blocked: number }
    }
    expect(report.acceptance).toEqual({ id: 'W0-SHELL-P', domainId: 'D-SHELL', gate: 'P' })
    expect(report.conclusion).toBe('BLOCKED')
    expect(report.exitCode).toBe(1)
    expect(report.artifacts.manifestFile).toBe('SHA256SUMS')
    expect(report.summary.blocked).toBe(1)
    expect(readdirSync(runDirectory)).not.toContain('result.txt')
    expect(readdirSync(runDirectory)).not.toContain('stdout.txt')
    expect(result.stdout).toContain('exit=1')
    expect(result.stdout).toContain('SHA256SUMS:')
    expect(result.stdout).not.toContain('Result summary:')
    expect(result.stdout.trim().split(/\r?\n/u)).toHaveLength(4)
  })
})
