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
      // Core coverage scope: solver (excluding data helpers & heavy worker infra) + app state/logic
      include: ['src/solver/**', 'src/app/state/**', 'src/app/logic/**'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.*',
        'src/worker/**',
        'src/solver/data/**',
        'src/worker/solver.worker.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90,
      },
    },
    include: ['src/**/*.test.{ts,tsx}', 'eval/**/*.test.{ts,tsx}'],
    globals: true,
  },
})
