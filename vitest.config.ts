import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig({
  ...viteConfig,
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
