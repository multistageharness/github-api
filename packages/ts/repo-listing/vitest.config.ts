import { mergeConfig, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

import shared from '../vitest.shared.ts';

// Component tests are colocated with the components under src/ and need a DOM.
// `mergeConfig` concatenates arrays, so the shared `include` globs are replaced
// (not extended) after the merge.
const merged = mergeConfig(
  shared,
  defineConfig({
    plugins: [react()],
    test: { environment: 'jsdom' },
  }),
);
merged.test = { ...merged.test, include: ['src/**/*.test.{ts,tsx}'] };

export default merged;
