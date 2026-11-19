/**
 * @fileoverview The one `Link`-header parser (R6).
 *
 * Nine implementations of this existed under `src/` before this file, and they
 * already disagreed: `activity/src/client/http.ts:334` rebuilt the next URL by
 * incrementing a page counter, which GitHub's cursor endpoints reject, and
 * `python.v3`'s carried `# TODO: Implement proper Link header handling` and
 * stopped after the first page.
 * @module pagination
 */

import type { PaginationLinks } from './types.js';

const LINK_ENTRY = /<([^>]*)>\s*;\s*(.*)/;
const REL_PARAM = /\brel\s*=\s*"?([^";,]+)"?/i;

/** The empty result, so callers never branch on `undefined`. */
export const NO_LINKS: PaginationLinks = Object.freeze({
  next: null,
  prev: null,
  first: null,
  last: null,
});

/**
 * Parse a `Link` header into every relation it declares.
 *
 * Splitting on `,` is safe here only because the URL is bracketed: the split
 * happens on `>,` boundaries, so a comma inside a query string — which GitHub
 * does emit, in `q=` values — does not split an entry in two. That is the bug
 * every naive `header.split(',')` implementation in this repository has.
 */
export function parseLinkHeader(header: string | null | undefined): Record<string, string> {
  if (header === null || header === undefined || header.trim() === '') return {};

  const links: Record<string, string> = {};
  for (const entry of splitEntries(header)) {
    const match = LINK_ENTRY.exec(entry.trim());
    if (match === null) continue;
    const url = (match[1] as string).trim();
    const rel = REL_PARAM.exec(match[2] as string);
    if (rel === null) continue;
    for (const name of (rel[1] as string).trim().split(/\s+/)) {
      if (name !== '') links[name] = url;
    }
  }
  return links;
}

/** The four cursors GitHub uses, as a fixed shape (R6). */
export function parseLinks(header: string | null | undefined): PaginationLinks {
  const links = parseLinkHeader(header);
  return {
    next: links['next'] ?? null,
    prev: links['prev'] ?? null,
    first: links['first'] ?? null,
    last: links['last'] ?? null,
  };
}

/**
 * The `next` URL worth following, or `null` when the iteration is over.
 *
 * GitHub's page-numbered endpoints can advertise a `next` past their own
 * `last` — `/repos/{o}/{r}/commits` on its final page sends `rel="next"` to
 * `page=N+1` beside `rel="last"` to `page=N` (observed live against
 * octocat/Hello-World). Following it costs a request and yields an empty page.
 * Cursor endpoints carry no `page` parameter and are followed as given.
 */
export function followableNext(links: PaginationLinks): string | null {
  if (links.next === null || links.last === null) return links.next;
  const next = pageNumber(links.next);
  const last = pageNumber(links.last);
  return next !== null && last !== null && next > last ? null : links.next;
}

function pageNumber(url: string): number | null {
  try {
    const value = new URL(url).searchParams.get('page');
    return value !== null && /^\d+$/.test(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

/**
 * Split a `Link` header on entry boundaries.
 *
 * An entry ends at a `,` that is outside `<…>`. Tracking the brackets is what
 * makes a comma inside a URL harmless.
 */
function splitEntries(header: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    if (char === '<') depth += 1;
    else if (char === '>') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      entries.push(header.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(header.slice(start));
  return entries.filter((entry) => entry.trim() !== '');
}

/**
 * Read the item array out of a page body.
 *
 * A plain list endpoint returns an array. A search endpoint returns an envelope
 * — `{total_count, incomplete_results, items}` — and so do several others
 * (`{total_count, workflow_runs}`, `{total_count, installations}`), which is
 * why the envelope case takes the first array-valued property rather than
 * hardcoding `items`.
 *
 * Anything else throws rather than silently yielding nothing: an endpoint whose
 * pages are not a collection is a caller mistake, and `itemsOf` is the answer.
 */
export function defaultItemsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record['items'])) return record['items'] as unknown[];
    if ('total_count' in record) {
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) return value as unknown[];
      }
    }
  }
  throw new TypeError(
    'Paginated response is not a collection: expected an array, an `items` array, or a ' +
      '`total_count` envelope. Supply `itemsOf` for this endpoint, or use `iterator()` and ' +
      'read the pages yourself.',
  );
}
