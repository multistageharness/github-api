import { mergeConfig, defineConfig } from 'vitest/config';

import shared from '../vitest.shared.ts';

// `setupFiles` clears the layer's environment variables before each test — the
// proxy ones included, since a developer running the suite behind a corporate
// proxy would otherwise have `HTTPS_PROXY` decide half these assertions
// (PRD 0002, R14).
export default mergeConfig(
  shared,
  defineConfig({ test: { setupFiles: ['./tests/setup.env.ts'] } }),
);
