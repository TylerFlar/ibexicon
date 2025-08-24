import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Derive repo name in CI (GITHUB_REPOSITORY="owner/repo")
const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1] ?? ''
const isCI = !!process.env.GITHUB_ACTIONS
// Allow explicit override (e.g. FORCE_BASE=/ for Lighthouse static run so absolute asset paths resolve)
const forced = process.env.FORCE_BASE
const base = forced ? forced : isCI && repo ? `/${repo}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    sourcemap: true,
  },
})
