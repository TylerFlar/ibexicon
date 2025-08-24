import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts', './vitest.setup.worker.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov', 'html'],
      all: true,
      include: ['src/solver/**', 'src/worker/**', 'src/app/state/**', 'src/app/logic/**'],
      exclude: ['**/__tests__/**', '**/*.test.*'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
    include: ['src/**/*.test.{ts,tsx}', 'eval/**/*.test.{ts,tsx}'],
    globals: true,
  },
})
