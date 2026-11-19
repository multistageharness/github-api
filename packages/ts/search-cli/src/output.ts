/**
 * The result sink — the CLI's **only** point of filesystem contact.
 *
 * Isolating every write here keeps `src/cli.ts` free of `node:fs` writes by
 * composition rather than by prohibition, and gives the writer a pure unit under
 * test.
 *
 * The default directory is a per-user state dir (`src/config.ts`,
 * `resolveOutputDir`), not the caller's cwd. The caller renders the result
 * *before* calling this and treats a throw as a warning, so a failed write never
 * loses a completed search.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reduce a query to a filesystem-safe slug.
 *
 * The user's query contains `/`, `:`, `>`, spaces and `..` as a matter of
 * course (`repo:nodejs/node is:open`). Interpolating it into a path is a
 * path-traversal bug, so the filename is **derived**, never interpolated.
 */
export function slugify(query: unknown, maxLength = 40): string {
  return (
    String(query)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/, '') || 'query'
  );
}

/** A short, stable digest of the full query — restores the uniqueness slugging discards. */
export const queryHash = (query: unknown): string =>
  createHash('sha256').update(String(query)).digest('hex').slice(0, 8);

/** `2026-07-08T18:12:48.000Z` → `20260708T181248Z` */
export const utcStamp = (now: number | string | Date): string =>
  new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export interface WriteResultOptions {
  endpoint?: string;
  query?: string;
  params?: unknown;
  dir?: string;
  now?: number;
  uuid?: string;
}

/**
 * Persist a completed search as JSON.
 *
 * Constraints, each load-bearing:
 * - **Filename is derived, never interpolated** — see `slugify`.
 * - **`mkdirSync(dir, { recursive: true })`** — idempotent; never throws on an
 *   existing directory.
 * - **Never destructive.** No `rmSync`, no truncation, no overwrite of an
 *   existing path. The directory accumulates; a same-stamp collision is
 *   disambiguated with the record's `uuid`.
 * - **Token never written.** The payload is the `SearchResult` plus a params
 *   echo from which `token` is structurally absent — `buildParams()` never puts
 *   it there.
 * - **`now`/`uuid` are injected** so the writer is deterministic under test.
 *
 * The caller announces the returned path on **stderr**, never stdout, so the
 * `--json` stdout contract survives.
 *
 * @returns the path written.
 */
export function writeResult(
  result: unknown,
  { endpoint, query, params = {}, dir, now = Date.now(), uuid = randomUUID() }: WriteResultOptions = {}
): string {
  if (!dir) throw new TypeError('writeResult requires an output directory');
  mkdirSync(dir, { recursive: true });

  const base = `${utcStamp(now)}-${endpoint}-${slugify(query)}-${queryHash(query)}`;
  let path = join(dir, `${base}.json`);
  // Never overwrite a prior run.
  if (existsSync(path)) path = join(dir, `${base}-${String(uuid).slice(0, 8)}.json`);

  const payload = {
    endpoint,
    query,
    savedAt: new Date(now).toISOString(),
    params,
    result,
  };

  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}
