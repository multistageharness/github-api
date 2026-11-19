import { defineConfig } from 'vitest/config';

/** Shared Vitest base. Each package re-exports / merges this in its own config. */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/**/*.test.ts',
      'test/**/*.test.ts',
      '**/__tests__/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
