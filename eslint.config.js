import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const impureMessage =
  'packages/engine must stay pure (CLAUDE.md rule 3): inject an Rng or pass time in instead.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.js', 'apps/server/**/*.ts', 'e2e/**/*.ts', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['packages/engine/**/*.ts', 'packages/protocol/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    // Enforce the pure-engine rule mechanically rather than relying on review.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: impureMessage },
        { object: 'Date', property: 'now', message: impureMessage },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: impureMessage },
      ],
      'no-restricted-globals': [
        'error',
        ...['setTimeout', 'setInterval', 'setImmediate', 'fetch', 'process', 'console'].map(
          (name) => ({ name, message: impureMessage }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@qa/server', '@qa/client', '**/apps/**'],
              message: 'packages/engine must not import from apps.',
            },
            { group: ['node:*', 'fs', 'path', 'http', 'net', 'crypto'], message: impureMessage },
          ],
        },
      ],
    },
  },
  prettier,
);
