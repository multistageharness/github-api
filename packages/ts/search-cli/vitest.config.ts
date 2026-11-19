import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      setupFiles: ['./tests/setup.ts'],
      // Builds dist/esm/ for the suites that spawn the real bin — see the file's header.
      globalSetup: ['./tests/global-setup.ts'],
    },
  })
);
