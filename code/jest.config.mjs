/**
 * Jest settings, through `next/jest` so tests compile the way Next does (SWC, `@/` imports, CSS ignored). Tests sit
 * next to the code as `*.test.ts(x)`. Services and helpers run in Node; component tests add
 * `@jest-environment jsdom` at the top of the file. A `.mjs` file, so Jest needs no TypeScript loader for it.
 *
 * @author Mahir Al Kamal
 */
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/services/**/*.ts',
    'src/components/**/*.tsx',
    '!src/components/ui/**',
    '!**/*.test.{ts,tsx}',
    '!**/test*.ts',
    '!**/README.md',
  ],
  coverageReporters: ['text-summary', 'lcov', 'html'],
};

export default createJestConfig(config);
