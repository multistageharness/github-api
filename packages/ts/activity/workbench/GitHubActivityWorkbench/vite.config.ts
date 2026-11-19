import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Unique port within packages/ts/activity (5217). Avoid sibling collisions.
export default defineConfig({
  root: 'dev',
  plugins: [react()],
  server: { host: true, port: 5217, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['../src/**/*.test.{ts,tsx}'],
  },
});
