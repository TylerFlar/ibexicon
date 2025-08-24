#!/usr/bin/env node
/**
 * Ensures the generated wasm glue uses the `?init` query so Vite can bundle in CI.
 * Local dev already patched earlier, but CI's fresh build may overwrite.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(root, '..', 'src', 'wasm', 'pkg')
const glue = join(pkgDir, 'ibxwasm.js')

if (!existsSync(glue)) {
  console.log('[patch-wasm] No glue file found, skipping')
  process.exit(0)
}

let text = readFileSync(glue, 'utf8')
if (text.includes("?init")) {
  console.log('[patch-wasm] Already patched')
  process.exit(0)
}

// Replace first line import * as wasm from './ibxwasm_bg.wasm'
text = text.replace(/import \* as wasm from '(\.\/ibxwasm_bg\.wasm)'/, (
  _m,
  p1,
) => `// patched for Vite CI\nimport initWasm from '${p1}?init'`)

if (!text.includes('initWasm')) {
  console.warn('[patch-wasm] Did not find pattern to patch; aborting')
  process.exit(0)
}

// Append init wrapper & default export if not present
if (!/export default /.test(text)) {
  text += `\nlet _wasmPromise;\nif (!_wasmPromise) {\n  _wasmPromise = initWasm().then(w => {\n    const {{ __wbg_set_wasm }} = require('./ibxwasm_bg.js');\n    __wbg_set_wasm(w);\n    if (w.__wbindgen_start) w.__wbindgen_start();\n    return w;\n  });\n}\nexport default _wasmPromise;\n`
}

// Simpler replacement for existing direct start sequence
text = text.replace(/__wbg_set_wasm\(wasm\)\s*wasm.__wbindgen_start\(\)/, `// runtime init handled in promise`)

writeFileSync(glue, text, 'utf8')
console.log('[patch-wasm] Patched glue for ?init query')
