// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'reports/**',
      'apps/report-viewer/public/report/**',
      'packages/scanner/test-fixtures/**',
      '.internal/**',
      '.tmp-test/**',
      '**/*.config.js',
      '**/*.config.ts',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'packages/scanner/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
