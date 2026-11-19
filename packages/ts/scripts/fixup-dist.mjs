#!/usr/bin/env node
/**
 * Post-emit fixup for the bundler-free dual ESM+CJS build.
 *
 * Strategy (no extension rename): `tsc` emits `.js` into dist/esm and dist/cjs.
 * We mark each directory with a per-dir package.json `type` so Node interprets
 * the `.js` files correctly:
 *   dist/esm/package.json -> {"type":"module"}
 *   dist/cjs/package.json -> {"type":"commonjs"}
 *
 * Usage (from a package dir): node ../scripts/fixup-dist.mjs <pkgDir>   (pkgDir defaults to cwd)
 * Idempotent.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pkgDir = resolve(process.argv[2] ?? process.cwd());
const targets = [
  ['dist/esm', { type: 'module' }],
  ['dist/cjs', { type: 'commonjs' }],
];

for (const [rel, marker] of targets) {
  const dir = join(pkgDir, rel);
  if (!existsSync(dir)) {
    console.warn(`fixup-dist: ${rel} not found (build may have skipped it)`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(marker) + '\n');
}
console.log('fixup-dist: wrote dist/esm and dist/cjs type markers');
