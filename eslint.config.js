import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['scripts/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
