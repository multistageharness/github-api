import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Library build (dual format, matching the workspace dist layout):
 *   src/index.ts → dist/esm/index.js (ES) + dist/cjs/index.js (CJS) + dist/style.css
 * CSS modules are compiled by Vite and extracted into one stylesheet; the JS
 * output never imports/requires CSS, so `require('dist/cjs/index.js')` works in
 * plain Node. Consumers load styles via the `./style.css` export.
 * Type declarations are emitted separately by `tsc -p tsconfig.build.json`, and
 * `../scripts/fixup-dist.mjs` writes the dist/{esm,cjs}/package.json type markers.
 * The dev harness keeps its own config (`vite.config.ts`, root `dev/`).
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `${format === 'es' ? 'esm' : 'cjs'}/index.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { assetFileNames: 'style.css' },
    },
  },
});
