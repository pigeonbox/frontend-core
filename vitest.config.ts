import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 前端单测配置（vitest；与 vite.config.ts 的 @ alias 保持一致）
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
  },
})
