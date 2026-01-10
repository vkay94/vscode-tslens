import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default [
  ...defineConfig(eslint.configs.recommended, ...tseslint.configs.recommended),
  ...defineConfig({
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  }),
];
