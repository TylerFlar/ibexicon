// Flat ESLint configuration
// Order: base JS -> TS -> React Hooks / Refresh -> Prettier disables conflicting formatting rules.

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores([
    'dist',
    '.vite',
    'src/wasm/pkg',
    'wasm/ibxwasm/src/wasm/pkg',
    'wasm/ibxwasm/target',
  ]),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['dist', 'node_modules'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        project: false,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        // Allow import.meta typical for Vite
        import: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
      ...jsxA11y.configs.recommended.rules,
      // Custom tweaks (minimal for now)
      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },
  // Prettier must be last to turn off conflicting formatting rules
  prettier,
])
