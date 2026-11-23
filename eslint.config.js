import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    '.tmp',
    'import',
    'archiv',
    'playwright-report',
    'test-results',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strict],
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/ui/**/*.tsx', 'src/main.tsx'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
  {
    // Workspace rule: the logic layer runs and is testable without any UI, browser or IO.
    files: ['src/logic/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'Logic layer must not import React.',
            },
            {
              group: ['**/ui/**', '**/io/**'],
              message: 'Logic layer must not import from ui/ or io/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'fetch',
      ],
    },
  },
  {
    files: [
      'vite.config.ts',
      'eslint.config.js',
      'tests/**/*.ts',
      'tools/**/*.ts',
      'src/**/*.test.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests index into fixtures and edit parsed JSON freely.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Tests use Vitest's globals. An explicit import broke when the shell was started in „c:\…“
    // (lower-case drive): a second copy of 'vitest' without a runner, „Cannot read properties of
    // undefined (reading 'config')“ — the whole file silently did not run (2026-11-11).
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vitest',
              importNames: ['describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach'],
              message: 'Use the Vitest globals (globals: true) – see eslint.config.js.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]);
