import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCommand } from '../../scripts/lib/acceptance'
import {
  collectCoreEnvironment,
  collectRepository,
  probeOllamaCliVersion,
  probeOllamaVersion,
} from '../../scripts/lib/environment'

const temporaryDirectories: string[] = []
const originalPath = process.env.PATH
const gitAvailable = runCommand('git', ['--version']).ok
const shellScripts = process.platform !== 'win32'

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'vinkey-lib-environment-'))
  temporaryDirectories.push(directory)
  return directory
}

/** Prepends an executable fixture to PATH for the duration of one test. */
function fakeBin(files: Record<string, string>): string {
  const directory = temporaryDirectory()
  for (const [name, content] of Object.entries(files)) {
    const file = join(directory, name)
    writeFileSync(file, content)
    chmodSync(file, 0o755)
  }
  process.env.PATH = `${directory}${delimiter}${originalPath ?? ''}`
  return directory
}

afterEach(() => {
  process.env.PATH = originalPath
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('collectRepository', () => {
  it('reads the package version and echoes the probe root', () => {
    const root = temporaryDirectory()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }))
    const repository = collectRepository(root)
    expect(repository.version).toBe('9.9.9')
    expect(repository.root).toBe(root)
    expect(typeof repository.dirty).toBe('boolean')
  })

  it('falls back to 0.0.0 for missing or invalid package metadata', () => {
    const missing = temporaryDirectory()
    expect(collectRepository(missing).version).toBe('0.0.0')
    const invalid = temporaryDirectory()
    writeFileSync(join(invalid, 'package.json'), '{ not json')
    expect(collectRepository(invalid).version).toBe('0.0.0')
    const blank = temporaryDirectory()
    writeFileSync(join(blank, 'package.json'), JSON.stringify({ version: '' }))
    expect(collectRepository(blank).version).toBe('0.0.0')
  })

  it.skipIf(!gitAvailable)('reports the HEAD sha and dirty state of a git worktree', () => {
    const root = temporaryDirectory()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    expect(runCommand('git', ['-C', root, 'init', '-q']).ok).toBe(true)
    expect(runCommand('git', ['-C', root, 'add', 'package.json']).ok).toBe(true)
    expect(runCommand('git', [
      '-C', root, '-c', 'user.name=contract', '-c', 'user.email=contract@example.com',
      'commit', '-qm', 'init',
    ]).ok).toBe(true)

    const clean = collectRepository(root)
    const head = runCommand('git', ['-C', root, 'rev-parse', 'HEAD'])
    expect(clean.gitSha).toBe(head.stdout)
    expect(clean.dirty).toBe(false)

    writeFileSync(join(root, 'untracked.txt'), 'dirty')
    expect(collectRepository(root).dirty).toBe(true)
  })
})

describe('collectCoreEnvironment', () => {
  it('reads toolchain metadata from package.json and Cargo.toml', () => {
    const root = temporaryDirectory()
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      devDependencies: { '@tauri-apps/cli': '^2.1.0' },
    }))
    mkdirSync(join(root, 'src-tauri'))
    writeFileSync(join(root, 'src-tauri', 'Cargo.toml'), [
      '[build-dependencies]',
      'tauri = { version = "2.0.3", features = [] }',
    ].join('\n'))

    const environment = collectCoreEnvironment(root)
    expect(environment.tauriCli).toBe('^2.1.0')
    expect(environment.tauriFramework).toBe('2.0.3')
    expect(environment.node).toBe(process.version)
    expect(environment.arch).toBe(process.arch)
    expect(environment.os).toBe(
      process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    )
    expect(typeof environment.osVersion).toBe('string')
    expect(typeof environment.rust).toBe('string')
  })

  it('supports the direct tauri version syntax', () => {
    const root = temporaryDirectory()
    mkdirSync(join(root, 'src-tauri'))
    writeFileSync(join(root, 'src-tauri', 'Cargo.toml'), '[dependencies]\ntauri = "2.7.1"\n')
    expect(collectCoreEnvironment(root).tauriFramework).toBe('2.7.1')
  })

  it('falls back to N/A when toolchain files are absent', () => {
    const environment = collectCoreEnvironment(temporaryDirectory())
    expect(environment.tauriCli).toBe('N/A')
    expect(environment.tauriFramework).toBe('N/A')
  })

  it.skipIf(!shellScripts)('parses the rustc version through gnuVersion', () => {
    fakeBin({ rustc: '#!/bin/sh\nprintf "%s\\n" "rustc 1.80.1 (abc 2024-01-01)"\n' })
    expect(collectCoreEnvironment(temporaryDirectory()).rust).toBe('1.80.1')
  })

  it.skipIf(!shellScripts)('keeps the raw token when the rustc output has no dotted version', () => {
    fakeBin({ rustc: '#!/bin/sh\nprintf "%s\\n" "rustc nightly-x"\n' })
    expect(collectCoreEnvironment(temporaryDirectory()).rust).toBe('nightly-x')
  })
})

describe('probeOllamaVersion', () => {
  it.skipIf(!shellScripts)('parses the version reported by an Ollama endpoint', () => {
    fakeBin({ curl: '#!/bin/sh\nprintf "%s" \'{"version":"0.5.1"}\'\n' })
    expect(probeOllamaVersion('http://127.0.0.1:11434', 2_000)).toBe('0.5.1')
  })

  it.skipIf(!shellScripts)('returns N/A for non-JSON output or a failing probe', () => {
    fakeBin({ curl: '#!/bin/sh\nprintf "%s" "not json"\n' })
    expect(probeOllamaVersion('http://127.0.0.1:11434', 2_000)).toBe('N/A')
    fakeBin({ curl: '#!/bin/sh\nexit 7\n' })
    expect(probeOllamaVersion('http://127.0.0.1:11434', 2_000)).toBe('N/A')
  })

  it.skipIf(!shellScripts)('returns N/A when curl is unavailable', () => {
    process.env.PATH = temporaryDirectory()
    expect(probeOllamaVersion('http://127.0.0.1:11434', 2_000)).toBe('N/A')
  })
})

describe('probeOllamaCliVersion', () => {
  it.skipIf(!shellScripts)('parses the version from the ollama CLI banner', () => {
    fakeBin({ ollama: '#!/bin/sh\nprintf "%s\\n" "ollama version 0.5.2"\n' })
    expect(probeOllamaCliVersion()).toBe('0.5.2')
  })

  it.skipIf(!shellScripts)('keeps the raw output when the banner is unrecognised', () => {
    fakeBin({ ollama: '#!/bin/sh\nprintf "%s\\n" "0.6.0"\n' })
    expect(probeOllamaCliVersion()).toBe('0.6.0')
  })

  it.skipIf(!shellScripts)('returns N/A when the CLI is unavailable', () => {
    process.env.PATH = temporaryDirectory()
    expect(probeOllamaCliVersion()).toBe('N/A')
  })
})
