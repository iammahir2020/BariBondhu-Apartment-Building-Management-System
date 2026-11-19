/**
 * ESLint rules for the app: Next.js's core-web-vitals and TypeScript configs, no `any`, and Prettier last so
 * formatting rules never clash with it.
 *
 * @author Mahir Al Kamal
 */
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      // CONTRIBUTING.md: no `any`. Use `unknown` and narrow it.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
