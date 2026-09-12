import { defineConfig } from 'vitest/config'
import path from 'path'

const isIntegration = process.env.TEST_INTEGRATION === 'true'

export default defineConfig({
  test: {
    environment: 'jsdom',
    alias: {
      '@': path.resolve(process.cwd(), './'),
      'server-only': path.resolve(process.cwd(), 'node_modules/server-only/empty.js'),
    },
    exclude: isIntegration
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
})
