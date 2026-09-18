import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const [majorVersion, minorVersion] = process.versions.node.split('.').map(Number)
if (!Number.isInteger(majorVersion) || majorVersion < 22 || (majorVersion === 22 && minorVersion < 5)) {
  console.error(`IntentRouter 验收需要 Node.js 22.5 或更高版本；当前为 ${process.version}。`)
  process.exit(1)
}

const root = resolve(import.meta.dirname, '../..')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vinkey-intent-router-acceptance-'))
const output = join(temporaryDirectory, 'intent-router-acceptance.mjs')

try {
  await build({
    entryPoints: [join(root, 'scripts', 'intent-router', 'intent-router-acceptance.ts')],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
  })
  const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, VINKEY_INTENT_MODEL_EVAL_CLI: '1' },
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
