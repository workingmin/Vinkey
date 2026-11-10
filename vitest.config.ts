import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig({
  ...viteConfig,
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // 验收合同测试会在进程内生成隔离 SQLite fixture，并通过 spawnSync 现场 esbuild 打包 CLI。
    // 全套并行执行时这些用例会被 CPU 争用拖慢到数十秒；这里只放宽「等待时间」与并行度，
    // 不放宽任何断言、用例清单或覆盖率，也不改变单文件用例的判定规则。
    testTimeout: 90_000,
    hookTimeout: 90_000,
    maxWorkers: 3,
  },
})
