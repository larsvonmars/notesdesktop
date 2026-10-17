import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Static accessibility gate for CI (missing labels/alt text, bad roles,
      // click handlers without keyboard equivalents, …). The plugin itself is
      // already registered by eslint-config-next, so only the rules are added.
      ...jsxA11y.flatConfigs.recommended.rules,
      // Canvas/drag-heavy editor surfaces rely on pointer handlers that have no
      // 1:1 keyboard equivalent; autofocus is deliberate inside dialogs. Keep
      // them visible without failing the gate, as with the compiler rules below.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      // React Compiler rules added in eslint-config-next 16 flag patterns this
      // codebase relies on deliberately (render-time "latest value" refs, state
      // hydrated from localStorage/storage APIs inside effects). Keep them
      // visible as warnings so real regressions still surface, without making
      // the lint gate unusable while components are migrated incrementally.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'node_modules/**',
    'src-tauri/**',
    'next-env.d.ts',
  ]),
])
