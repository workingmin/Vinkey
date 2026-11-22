import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const runnerPath = resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-native-windows.ps1')
const helperPath = resolve(repositoryRoot, 'scripts/ui-shell/win32-native-helper.ps1')

function powershell(...args: string[]) {
  return spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

describe('UI shell native Windows acceptance CLI', () => {
  it('documents the native runner options without launching a desktop app', () => {
    const result = powershell(runnerPath, '-Help')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('W0-SHELL-P-NATIVE-WINDOWS')
    expect(result.stdout).toContain('-Output')
    expect(result.stdout).toContain('-App')
    expect(result.stdout).toContain('-ProcessName')
    expect(result.stdout).toContain('-ProfileDir')
    expect(result.stdout).toContain('-TesterId')
    expect(result.stdout).toContain('-NoLaunch')
    expect(result.stdout).toContain('-NoArchive')
    expect(result.stdout).toContain('VINKEY_ACCEPTANCE_DATA_DIR')
  })

  it('rejects -NoLaunch without an explicit profile', () => {
    const result = powershell(runnerPath, '-NoLaunch')
    expect(result.status).toBe(2)
    // Chinese stderr is GBK-encoded by PS 5.1; assert stable ASCII tokens only.
    expect(result.stderr).toContain('-NoLaunch')
    expect(result.stderr).toContain('ProfileDir')
  })

  it('keeps the Win32 helper purely ASCII (safe under PS 5.1 GBK)', () => {
    const helper = readFileSync(helperPath)
    expect(helper[0]).not.toBe(0xef) // no BOM needed: helper has no non-ASCII text
    expect(helper.every((byte) => byte < 128)).toBe(true)
  })

  it('declares DPI awareness before GDI calls and uses physical dimensions', () => {
    const helper = readFileSync(helperPath, 'utf8')
    expect(helper).toContain('SetProcessDpiAwarenessContext')
    expect(helper).toContain('PER_MONITOR_AWARE_V2')
    expect(helper).toContain('DESKTOPHORZRES')
    expect(helper).toContain('HORZSIZE')
    expect(helper).toContain('GetDpiForMonitor')
    expect(helper).toContain('GetDeviceCaps')
    // HORZRES is virtualized for DPI-unaware processes; the probe must not rely on it.
    expect(helper).toContain('DESKTOPHORZRES is physical')
    expect(helper).not.toContain('GetDeviceCaps($mDc, [VinkeyWin32]::HORZRES)')
  })

  it('drives real window controls via Win32 and emits native case IDs', () => {
    const helper = readFileSync(helperPath, 'utf8')
    expect(helper).toContain('ShowWindow')
    expect(helper).toContain('SW_MINIMIZE')
    expect(helper).toContain('SW_MAXIMIZE')
    expect(helper).toContain('SW_RESTORE')
    expect(helper).toContain('WM_CLOSE')
    expect(helper).toContain('IsIconic')
    expect(helper).toContain('IsZoomed')
    expect(helper).toContain('SHELL-NATIVE-WIN-WINDOW-MINIMIZE')
    expect(helper).toContain('SHELL-NATIVE-WIN-WINDOW-MAXIMIZE')
    expect(helper).toContain('SHELL-NATIVE-WIN-WINDOW-CLOSE')
    expect(helper).toContain('SHELL-NATIVE-WIN-WINDOW-REOPEN')
  })

  it('emits a contract-compliant result with provenance and privacy audit', () => {
    const runner = readFileSync(runnerPath, 'utf8')
    expect(runner).toContain("id: 'W0-SHELL-P-NATIVE-WINDOWS'")
    expect(runner).toContain("version: '1.0.0'")
    expect(runner).toContain('SHELL-P-BUILD-PROVENANCE')
    expect(runner).toContain('SHELL-P-ARTIFACT-PRIVACY')
    expect(runner).toContain('SHELL-P-ISOLATED-PROFILE')
    expect(runner).toContain('SHELL-NATIVE-WIN-DISPLAY-SCALE')
    expect(runner).toContain('SHA256SUMS')
    expect(runner).toContain('privacy-audit.json')
    expect(runner).toContain('display-metadata.json')
    expect(runner).toContain('CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(runner).toContain('COVERED_BY_WIN32')
    expect(runner).toContain('MEASURED_WITH_DPI_AWARE_GDI_PROBE')
    // Fixed four-line stdout contract.
    expect(runner).toContain('acceptance:')
    expect(runner).toContain('Results:')
    expect(runner).toContain('exit=')
  })

  it('registers the npm entry point', () => {
    const pkg = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['test:ui-shell-native-win']).toContain('run-ui-shell-native-windows.ps1')
  })
})
