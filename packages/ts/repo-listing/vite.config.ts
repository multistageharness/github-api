import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev-server config for the harness in `dev/`. Tests use `vitest.config.ts`. */
export default defineConfig({
  root: 'dev',
  plugins: [react()],
  server: { port: 5200, strictPort: true },
});
