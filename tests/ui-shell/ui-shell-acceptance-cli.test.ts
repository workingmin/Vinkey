import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const repositoryRoot = resolve(import.meta.dirname, '../..')

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
    expect(result.stdout).toContain('辅助功能')
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
    expect(script).toContain("version: '1.2.1'")
    expect(script).not.toContain('set zoomButton to candidate')
    expect(script).not.toContain('click zoomButton')
    expect(script).not.toContain('click minimizeButton')
    expect(script).not.toContain('click closeButton')
    expect(script).not.toContain('SHELL-NATIVE-MAC-MENU-OPEN')
    expect(script).not.toContain('menu item "日志中心"')
  })

  it('keeps title-bar menu interaction outside the W0-SHELL-P browser runner', () => {
    const script = readFileSync(resolve(repositoryRoot, 'scripts/ui-shell/run-ui-shell-acceptance.mjs'), 'utf8')
    expect(script).toContain('OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(script).toContain("const expectedMenus = ['项目', '会话', '编辑', '查看', '窗口', '帮助']")
    expect(script).toContain('CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P')
    expect(script).not.toContain("getByRole('button', { name: '文件', exact: true }).click()")
    expect(script).not.toContain("getByRole('menu').waitFor()")
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
