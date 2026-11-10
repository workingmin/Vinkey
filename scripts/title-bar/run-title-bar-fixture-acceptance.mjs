import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

// UI-ACC-TITLE-BAR-FIXTURE-001 独立入口：bundle F 门槛核心，注入仓库根后执行。
// 与 run-title-bar-acceptance.mjs（机器合同层）和 run-title-bar-native-acceptance.mjs
// （macOS 原生 P 门槛）三者互不混报，各自独立批次归档。

const [majorVersion, minorVersion] = process.versions.node.split('.').map(Number)
if (!Number.isInteger(majorVersion) || majorVersion < 22 || (majorVersion === 22 && minorVersion < 5)) {
  console.error(`标题栏菜单 F 门槛验收需要 Node.js 22.5 或更高版本；当前为 ${process.version}。`)
  process.exit(1)
}

const root = resolve(import.meta.dirname, '../..')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vinkey-title-bar-fixture-gate-'))
const output = join(temporaryDirectory, 'title-bar-fixture-acceptance.mjs')

try {
  await build({
    entryPoints: [join(root, 'scripts', 'title-bar', 'title-bar-fixture-acceptance.ts')],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
    jsx: 'automatic',
    define: {
      'import.meta.env': '{"VITE_UI_ACCEPTANCE":"0"}',
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.jsx': 'jsx',
      '.js': 'js',
    },
  })
  const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], {
    cwd: root,
    env: {
      ...process.env,
      VINKEY_TITLE_BAR_FIXTURE_CLI: '1',
      VINKEY_TITLE_BAR_FIXTURE_ROOT: root,
      VINKEY_TITLE_BAR_ACCEPTANCE_ROOT: root,
    },
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
