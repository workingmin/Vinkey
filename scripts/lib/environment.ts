import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommand } from './acceptance'

// Repository and toolchain probes shared by every acceptance suite. Suites add
// only the probes that are meaningful for them (for example an Ollama version).

export interface RepositoryInfo {
  version: string
  gitSha: string | null
  dirty: boolean
  root: string
}

export interface CoreEnvironmentInfo {
  os: string
  osVersion: string
  arch: string
  node: string
  rust: string
  tauriCli: string
  tauriFramework: string
}

function gnuVersion(prefix: string, output: string): string {
  const match = output.match(new RegExp(`${prefix}[\\s/]([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)`))
  return (match?.[1] ?? output.split(/\s+/u)[1] ?? output) || 'N/A'
}

export function collectRepository(root: string): RepositoryInfo {
  let version = '0.0.0'
  const packageFile = join(root, 'package.json')
  if (existsSync(packageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version) version = parsed.version
    } catch {
      // 读取失败时保留默认版本，仍可给出可读错误提示
    }
  }
  const shaRun = runCommand('git', ['-C', root, 'rev-parse', 'HEAD'])
  const statusRun = runCommand('git', ['-C', root, 'status', '--porcelain'])
  return { version, gitSha: shaRun.ok ? shaRun.stdout : null, dirty: Boolean(statusRun.stdout), root }
}

export function collectCoreEnvironment(root: string): CoreEnvironmentInfo {
  let tauriCli = 'N/A'
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }
    tauriCli = parsed.devDependencies?.['@tauri-apps/cli'] ?? 'N/A'
  } catch {
    tauriCli = 'N/A'
  }
  let tauriFramework = 'N/A'
  const cargoFile = join(root, 'src-tauri', 'Cargo.toml')
  if (existsSync(cargoFile)) {
    const content = readFileSync(cargoFile, 'utf8')
    const match = content.match(/tauri\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/u)
    if (match?.[1]) tauriFramework = match[1]
    else {
      const direct = content.match(/^tauri\s*=\s*"([^"]+)"/mu)
      if (direct?.[1]) tauriFramework = direct[1]
    }
  }
  const rust = runCommand('rustc', ['--version'])
  const swVers = process.platform === 'win32' ? null : runCommand('sw_vers', ['-productVersion'])
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion: process.platform === 'win32' ? process.arch : (swVers?.ok ? swVers.stdout : 'N/A'),
    arch: process.arch,
    node: process.version,
    rust: rust.ok ? gnuVersion('rustc', rust.stdout) : 'N/A',
    tauriCli,
    tauriFramework,
  }
}

/** Version reported by a reachable Ollama-compatible endpoint. */
export function probeOllamaVersion(baseUrl: string, timeoutMs: number): string {
  const result = runCommand('curl', ['-s', '-m', String(Math.min(timeoutMs, 5_000) / 1_000), `${baseUrl}/api/version`])
  if (!result.ok || !result.stdout) return 'N/A'
  try {
    const parsed = JSON.parse(result.stdout) as { version?: string }
    return parsed.version ?? 'N/A'
  } catch {
    return 'N/A'
  }
}

/** Version reported by the locally installed `ollama` CLI. */
export function probeOllamaCliVersion(): string {
  const result = runCommand('ollama', ['--version'])
  if (!result.ok) return 'N/A'
  return result.stdout.match(/version\s+([0-9][^\s]*)/u)?.[1] ?? result.stdout
}
