#!/usr/bin/env node
/**
 * Network-free smoke gate for every workspace package.
 *
 * For each package: import the built ESM entry (must expose >0 named exports),
 * require the built CJS entry, and run each `bin` with `--help` asserting exit 0
 * and with `--version` asserting it prints the manifest's version.
 * No network calls. Emits a table by default, or JSON with `--json`.
 *
 * Exit 0 = all packages healthy; exit 1 = at least one failure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const pkgs = root.workspaces;
const asJson = process.argv.includes('--json');

const results = [];
for (const pkg of pkgs) {
  const dir = join(ROOT, pkg);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const r = { pkg, name: meta.name, esm: false, cjs: false, exports: [], bins: {}, ok: false };
  try {
    const esmEntry = join(dir, 'dist/esm/index.js');
    if (!existsSync(esmEntry)) throw new Error('dist/esm/index.js missing — run build first');
    const mod = await import(pathToFileURL(esmEntry).href);
    r.exports = Object.keys(mod).sort();
    r.esm = r.exports.length > 0;

    const cjsEntry = join(dir, 'dist/cjs/index.js');
    const require = (await import('node:module')).createRequire(import.meta.url);
    const cmod = require(cjsEntry);
    r.cjs = !!cmod && Object.keys(cmod).length > 0;

    for (const [binName, binPath] of Object.entries(meta.bin ?? {})) {
      try {
        execFileSync(process.execPath, [join(dir, binPath), '--help'], {
          stdio: 'ignore',
          timeout: 15000,
          env: { ...process.env, NO_COLOR: '1' },
        });
        const printed = execFileSync(process.execPath, [join(dir, binPath), '--version'], {
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 15000,
          env: { ...process.env, NO_COLOR: '1' },
        })
          .toString()
          .trim();
        r.bins[binName] = printed === meta.version ? 'ok' : `version ${printed} != ${meta.version}`;
      } catch {
        r.bins[binName] = 'fail';
      }
    }
    const binsOk = Object.values(r.bins).every((v) => v === 'ok');
    r.ok = r.esm && r.cjs && binsOk;
  } catch (err) {
    r.error = err.message;
    r.ok = false;
  }
  results.push(r);
}

const failed = results.filter((r) => !r.ok);

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    const bins = Object.entries(r.bins).map(([k, v]) => `${k}:${v}`).join(' ') || '(no bin)';
    console.log(
      `${status}  ${r.pkg.padEnd(10)} esm=${r.esm} cjs=${r.cjs} exports=${r.exports.length} ${bins}` +
        (r.error ? ` ERROR: ${r.error}` : '')
    );
  }
  console.log(`\n${results.length - failed.length}/${results.length} packages healthy`);
}

process.exit(failed.length === 0 ? 0 : 1);
