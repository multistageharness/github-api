/**
 * @fileoverview Header composition, and the rate-limit view every response
 * carries (R5, R7).
 *
 * The rate-limit headers are read with `@internal/github-sdk-ratelimit`'s own
 * parser rather than a private copy — a second parser here would be the tenth
 * implementation of a thing this repository already has too many of, and it
 * would be the one that drifts (R10).
 * @module headers
 */

import { parseRateLimitHeaders, parseRetryAfter, readHeader } from '@internal/github-sdk-ratelimit';

import type { RateLimitHeaders } from './types.js';

/**
 * Merge header layers, later winning, comparing names case-insensitively.
 *
 * A per-request `accept` must beat a client-level `Accept`, and HTTP header
 * names are case-insensitive, so a naive object spread — which is what every
 * package in this repository does — silently sends both.
 */
export function mergeHeaders(
  ...layers: (Record<string, string | undefined> | undefined)[]
): Record<string, string> {
  const byLowerName = new Map<string, string>();
  for (const layer of layers) {
    if (layer === undefined) continue;
    for (const [name, value] of Object.entries(layer)) {
      const lower = name.toLowerCase();
      // An explicit `undefined` removes a default rather than sending "undefined".
      if (value === undefined) {
        byLowerName.delete(lower);
        continue;
      }
      byLowerName.set(lower, value);
    }
  }
  return Object.fromEntries(byLowerName);
}

/** Read GitHub's rate-limit headers off a response, once (R7). */
export function readRateLimitHeaders(headers: unknown, nowMs: number): RateLimitHeaders {
  const parsed = parseRateLimitHeaders(headers);
  const retryAfterMs = parseRetryAfter(readHeader(headers, 'retry-after'), nowMs);
  const reset = parsed.reset;
  return {
    limit: parsed.limit,
    remaining: parsed.remaining,
    used: parsed.used,
    reset,
    resetAt: reset === undefined ? null : new Date(reset * 1000),
    resource: parsed.resource,
    retryAfterMs,
  };
}
