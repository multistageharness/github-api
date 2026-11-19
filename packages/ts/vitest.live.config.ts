import { defineConfig } from 'vitest/config';

/**
 * Live suite: real api.github.com + a real clone, read-only, opt-in.
 *
 *   GITHUB_LIVE=1 npm run test:live
 *
 * It imports the packages by name, so it exercises the built `dist/` exactly as
 * a consumer would — run `npm run build` first. `npm test` never includes it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['live/**/*.live.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Sequential: keeps the request rate polite and the secondary limit out of play.
    fileParallelism: false,
  },
});
