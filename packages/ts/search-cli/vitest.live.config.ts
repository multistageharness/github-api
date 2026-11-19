import { defineConfig } from 'vitest/config';

/**
 * Live suite: spawns the real CLI against api.github.com. Opt-in, read-only.
 *
 *   GITHUB_LIVE=1 npm run test:live
 *
 * No setupFiles: tests/setup.ts only loads fixture values, and the live suite
 * must not stub anything. The global setup builds `dist/esm/` (the bin the suite
 * spawns), exactly as for `npm test`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['live/**/*.live.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
