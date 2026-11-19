import { mergeConfig, defineConfig } from 'vitest/config';

import shared from '../vitest.shared.ts';

// `setupFiles` clears the layer's environment variables before each test, so
// the suite depends on what it sets rather than on the shell it runs in
// (PRD 0001, R12).
export default mergeConfig(
  shared,
  defineConfig({ test: { setupFiles: ['./tests/setup.env.ts'] } }),
);
