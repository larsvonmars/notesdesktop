import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    rules: {
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
