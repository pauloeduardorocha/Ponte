import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-seed/**',
      '**/coverage/**',
      '**/node_modules/**',
      'tmp/**',
      'desktop/translation-windows/qr-code.cjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      'apps/api/src/modules/banking/efatura/*.cjs',
      'apps/api/scripts/*.cjs',
      'apps/api/prisma/library-production/*.cjs',
      'apps/api/prisma/bootstrap-production.cjs',
      'apps/api/jest.*.cjs',
      'apps/api/test/*.cjs',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['desktop/translation-windows/*.{js,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, AudioWorkletProcessor: 'readonly', registerProcessor: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['desktop/translation-windows/{*.test,smoke-*,*-smoke}.cjs'],
    rules: { '@typescript-eslint/no-this-alias': 'off' },
  },
  {
    files: ['desktop/translation-windows/playback.js'],
    languageOptions: { sourceType: 'script', globals: { LocalAudioCodec: 'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^TranslationPlayback$' }] },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
);
