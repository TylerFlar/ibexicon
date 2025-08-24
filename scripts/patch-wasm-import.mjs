#!/usr/bin/env node
/**
 * Deterministically overwrite the wasm glue to use ?init so Vite can bundle in CI.
 * Avoids brittle regex patching & double-run noise.
 */
import { writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(root, '..', 'src', 'wasm', 'pkg')
const glue = join(pkgDir, 'ibxwasm.js')

if (!existsSync(glue)) {
  console.log('[patch-wasm] No glue file found, skipping')
  process.exit(0)
}

const content = `// Auto-generated patch for Vite CI: force ?init loader\nimport initWasm from './ibxwasm_bg.wasm?init'\nexport * from './ibxwasm_bg.js'\nimport { __wbg_set_wasm } from './ibxwasm_bg.js'\nlet _wasmPromise\nif (!_wasmPromise) {\n  _wasmPromise = initWasm().then(wasm => {\n    __wbg_set_wasm(wasm)\n    if (wasm.__wbindgen_start) wasm.__wbindgen_start()\n    return wasm\n  })\n}\nexport default _wasmPromise\n`

writeFileSync(glue, content, 'utf8')
console.log('[patch-wasm] Wrote deterministic glue with ?init')
