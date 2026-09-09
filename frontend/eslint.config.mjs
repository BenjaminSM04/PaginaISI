import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: {
      // Migración gradual: el proyecto existente aún usa tipos API flexibles.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@next/next/no-img-element': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts', 'test/*.cjs']),
]);
