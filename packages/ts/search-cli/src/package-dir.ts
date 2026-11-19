/**
 * Locate this package's own directory from the running entry file.
 *
 * The CLI loads its `.env` from the package directory — never the cwd. The
 * original `.mjs` entry derived that from `import.meta.url`, but this package is
 * compiled twice (ESM and CommonJS) and `import.meta` is a compile error in the
 * CommonJS pass. So the entry file is taken from `__filename` where it exists
 * (CommonJS) and otherwise from `process.argv[1]` (the ESM bin, which is always
 * the main module), and the directory is found by walking up to the
 * `package.json` whose `name` is ours. That holds from `src/`, `dist/esm/` and
 * `dist/cjs/` alike, and through an npm bin symlink.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walk up from `entryFile` to the nearest directory whose `package.json` is
 * named `packageName`. Returns `undefined` when there is none — the caller then
 * loads no `.env` at all, rather than falling back to the cwd.
 */
export function findPackageDir(entryFile: string, packageName: string): string | undefined {
  let dir = dirname(resolve(entryFile));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown };
        if (name === packageName) return dir;
      } catch {
        // An unreadable or invalid manifest is not ours; keep walking.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** The file the process is running this module from, symlinks resolved. */
export function entryFile(): string | undefined {
  // `__filename` exists only in the CommonJS build; `typeof` is safe on an undeclared global.
  const file = typeof __filename === 'string' ? __filename : process.argv[1];
  if (!file) return undefined;
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}
