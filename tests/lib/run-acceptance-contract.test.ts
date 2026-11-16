import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAcceptanceCli } from '../../scripts/lib/run-acceptance.mjs'

vi.mock('esbuild', () => ({ build: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

const repositoryRoot = resolve(import.meta.dirname, '../..')
const originalNodeVersion = process.versions.node
const originalExitCode = process.exitCode
const mockedBuild = vi.mocked(build)
const mockedSpawn = vi.mocked(spawnSync)
const mockedRm = vi.mocked(rm)

function stubNodeVersion(version: string): void {
  Object.defineProperty(process.versions, 'node', { value: version, configurable: true })
}

beforeEach(() => {
  mockedBuild.mockReset()
  mockedSpawn.mockReset()
  mockedRm.mockClear()
})

afterEach(() => {
  Object.defineProperty(process.versions, 'node', { value: originalNodeVersion, configurable: true })
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
})

function mockSuccessfulRun(status = 0): void {
  mockedBuild.mockResolvedValue({} as never)
  mockedSpawn.mockReturnValue({ status } as never)
}

describe('runAcceptanceCli version gate', () => {
  it('refuses to run on Node.js older than 22.5', async () => {
    stubNodeVersion('20.11.0')
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runAcceptanceCli({ label: '对话验收', slug: 'gate', entry: 'entry.ts' }))
      .rejects.toThrow('exit:1')
    expect(mockedBuild).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('对话验收需要 Node.js 22.5 或更高版本'))
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('rejects the 22.4 minor boundary', async () => {
    stubNodeVersion('22.4.9')
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit:1')
    }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runAcceptanceCli({ label: 'L', slug: 'gate', entry: 'entry.ts' })).rejects.toThrow('exit:1')
    expect(mockedBuild).not.toHaveBeenCalled()
  })

  it('accepts the 22.5 boundary', async () => {
    stubNodeVersion('22.5.0')
    mockSuccessfulRun(0)

    await runAcceptanceCli({ label: 'L', slug: 'boundary', entry: 'scripts/chat/chat-acceptance.ts' })

    expect(mockedBuild).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(0)
  })
})

describe('runAcceptanceCli bundling and spawn contract', () => {
  it('bundles the entry and forwards the environment, root and exit code', async () => {
    stubNodeVersion('22.5.0')
    mockSuccessfulRun(0)

    await runAcceptanceCli({
      label: 'L',
      slug: 'lib-plumbing',
      entry: 'scripts/chat/chat-acceptance.ts',
      env: { VINKEY_LIB_PROBE: '1' },
      rootEnv: 'VINKEY_LIB_ROOT',
    })

    const options = mockedBuild.mock.calls[0][0] as {
      entryPoints: string[]
      outfile: string
      bundle: boolean
      platform: string
      format: string
      target: string
      sourcemap: string
      jsx?: string
      define?: Record<string, string>
      loader?: Record<string, string>
    }
    expect(options.entryPoints).toEqual([join(repositoryRoot, 'scripts/chat/chat-acceptance.ts')])
    expect(options.outfile).toMatch(/vinkey-lib-plumbing-[^/\\]+[/\\]lib-plumbing\.mjs$/)
    expect(options.bundle).toBe(true)
    expect(options.platform).toBe('node')
    expect(options.format).toBe('esm')
    expect(options.target).toBe('node22')
    expect(options.sourcemap).toBe('inline')
    expect(options.jsx).toBeUndefined()
    expect(options.define).toBeUndefined()
    expect(options.loader).toBeUndefined()

    const [command, args, spawnOptions] = mockedSpawn.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; env: Record<string, string | undefined>; stdio: string },
    ]
    expect(command).toBe(process.execPath)
    expect(args[0]).toBe(options.outfile)
    expect(spawnOptions.cwd).toBe(repositoryRoot)
    expect(spawnOptions.stdio).toBe('inherit')
    expect(spawnOptions.env.VINKEY_LIB_PROBE).toBe('1')
    expect(spawnOptions.env.VINKEY_LIB_ROOT).toBe(repositoryRoot)
    expect(spawnOptions.env.PATH).toBe(process.env.PATH)

    expect(mockedRm).toHaveBeenCalledTimes(1)
    const [removed, rmOptions] = mockedRm.mock.calls[0] as unknown as [string, { recursive: boolean; force: boolean }]
    expect(removed).toBe(dirname(options.outfile))
    expect(rmOptions).toEqual({ recursive: true, force: true })
    expect(process.exitCode).toBe(0)
  })

  it('adds the DOM/JSX harness only when ui is requested', async () => {
    stubNodeVersion('23.0.0')
    mockSuccessfulRun(0)

    await runAcceptanceCli({ label: 'L', slug: 'lib-ui', entry: 'scripts/title-bar/title-bar-acceptance.ts', ui: true })

    const options = mockedBuild.mock.calls[0][0] as {
      jsx?: string
      define?: Record<string, string>
      loader?: Record<string, string>
    }
    expect(options.jsx).toBe('automatic')
    expect(options.define).toEqual({ 'import.meta.env': '{"VITE_UI_ACCEPTANCE":"0"}' })
    expect(options.loader).toEqual({ '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'js' })
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
  })

  it('maps a missing child status to exit code 1', async () => {
    stubNodeVersion('22.5.0')
    mockedBuild.mockResolvedValue({} as never)
    mockedSpawn.mockReturnValue({ status: null } as never)

    await runAcceptanceCli({ label: 'L', slug: 'lib-null', entry: 'entry.ts' })
    expect(process.exitCode).toBe(1)
  })

  it('propagates a non-zero child exit code', async () => {
    stubNodeVersion('22.5.0')
    mockSuccessfulRun(2)

    await runAcceptanceCli({ label: 'L', slug: 'lib-fail', entry: 'entry.ts' })
    expect(process.exitCode).toBe(2)
  })

  it('cleans up the temporary directory when bundling fails', async () => {
    stubNodeVersion('22.5.0')
    mockedBuild.mockRejectedValue(new Error('bundle failed'))

    await expect(runAcceptanceCli({ label: 'L', slug: 'lib-boom', entry: 'entry.ts' }))
      .rejects.toThrow('bundle failed')
    expect(mockedSpawn).not.toHaveBeenCalled()
    expect(mockedRm).toHaveBeenCalledWith(expect.stringMatching(/vinkey-lib-boom-/), { recursive: true, force: true })
    expect(process.exitCode).toBe(originalExitCode)
  })
})
