import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

// Logic layer: layer rule (workspace) plus module boundaries (docs/modularisierung.md).
// ESLint replaces rule options per block, so every block repeats the base patterns.
const BASE_PATTERNS = [
  {
    group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
    message: 'Logic layer must not import React.',
  },
  {
    group: ['**/ui/**', '**/io/**'],
    message: 'Logic layer must not import from ui/ or io/.',
  },
];
// Only index.ts is the public API of a module; mandate/model.ts holds the shared types.
const deepImport = (module, extraAllowed = []) => ({
  group: [
    `**/${module}/*`,
    `!**/${module}/index.*`,
    ...extraAllowed.map((f) => `!**/${module}/${f}`),
  ],
  message: `Import from the module root (logic/${module}), not from a file inside it.`,
});
const noImport = (module, why) => ({
  group: [`**/${module}`, `**/${module}/**`],
  message: `Direction core <- mandate/model <- config <- mandate <- audit: ${why}`,
});
const GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
];
function logicBlocks() {
  const block = (files, extra) => ({
    files,
    rules: {
      'no-restricted-imports': ['error', { patterns: [...BASE_PATTERNS, ...extra] }],
      'no-restricted-globals': ['error', ...GLOBALS],
    },
  });
  const deepMandate = deepImport('mandate', ['model.*']);
  const deepCore = deepImport('core');
  return [
    // Workspace rule: the logic layer runs and is testable without any UI, browser or IO.
    block(['src/logic/**/*.ts'], []),
    block(
      ['src/logic/core/**/*.ts'],
      [
        noImport('mandate', 'core imports nothing from other modules.'),
        noImport('audit', 'core imports nothing from other modules.'),
        noImport('sanctions', 'core imports nothing from other modules.'),
        noImport('tasks', 'core imports nothing from other modules.'),
        {
          group: ['**/config', '**/config.*'],
          message: 'core imports nothing from other modules.',
        },
      ],
    ),
    block(
      ['src/logic/mandate/**/*.ts'],
      [
        noImport('audit', 'mandate must not import audit.'),
        noImport('tasks', 'mandate must not import tasks.'),
        deepImport('sanctions'),
        deepCore,
      ],
    ),
    block(
      ['src/logic/sanctions/**/*.ts'],
      [
        noImport('audit', 'sanctions must not import audit.'),
        noImport('tasks', 'sanctions must not import tasks.'),
        deepMandate,
        deepCore,
      ],
    ),
    block(
      ['src/logic/audit/**/*.ts'],
      [
        noImport('tasks', 'audit must not import tasks.'),
        deepMandate,
        deepImport('sanctions'),
        deepCore,
      ],
    ),
    block(
      ['src/logic/tasks/**/*.ts'],
      [deepMandate, deepImport('audit'), deepImport('sanctions'), deepCore],
    ),
    block(
      ['src/logic/*.ts'],
      [deepMandate, deepImport('audit'), deepImport('sanctions'), deepImport('tasks'), deepCore],
    ),
  ];
}

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
  ...logicBlocks(),
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
