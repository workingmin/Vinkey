import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const MIN_NODE_MAJOR = 22
const MIN_NODE_MINOR = 5

/**
 * Bundle a TypeScript acceptance entry with esbuild and run it from a temporary
 * directory. Every suite keeps its own entry, label and CLI environment; this
 * module only owns the identical build/spawn/cleanup plumbing.
 *
 * @param {object} options
 * @param {string} options.label Suite name used in the Node.js version error.
 * @param {string} options.slug Temp-dir and bundle prefix, e.g. `chat-acceptance`.
 * @param {string} options.entry Repo-relative path of the TypeScript entry.
 * @param {Record<string, string>} [options.env] Extra environment for the CLI.
 * @param {string} [options.rootEnv] Environment variable that receives the repo root.
 * @param {boolean} [options.ui] Bundle the DOM/JSX acceptance harness.
 */
export async function runAcceptanceCli({ label, slug, entry, env = {}, rootEnv, ui = false }) {
  const [majorVersion, minorVersion] = process.versions.node.split('.').map(Number)
  if (!Number.isInteger(majorVersion)
    || majorVersion < MIN_NODE_MAJOR
    || (majorVersion === MIN_NODE_MAJOR && minorVersion < MIN_NODE_MINOR)) {
    console.error(`${label}需要 Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} 或更高版本；当前为 ${process.version}。`)
    process.exit(1)
  }

  const root = resolve(import.meta.dirname, '../..')
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `vinkey-${slug}-`))
  const output = join(temporaryDirectory, `${slug}.mjs`)

  try {
    await build({
      entryPoints: [join(root, entry)],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: `node${MIN_NODE_MAJOR}`,
      sourcemap: 'inline',
      ...(ui ? {
        jsx: 'automatic',
        define: { 'import.meta.env': '{"VITE_UI_ACCEPTANCE":"0"}' },
        loader: { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'js' },
      } : {}),
    })
    const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], {
      cwd: root,
      env: { ...process.env, ...env, ...(rootEnv ? { [rootEnv]: root } : {}) },
      stdio: 'inherit',
    })
    process.exitCode = result.status ?? 1
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
