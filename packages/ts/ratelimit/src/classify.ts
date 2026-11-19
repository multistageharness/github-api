/**
 * @fileoverview Deciding what a response actually means: an exhausted primary
 * budget, a secondary (burst) limit, or a plain permission failure that must not
 * be retried as a rate limit (R3, R4, R5).
 * @module classify
 */

import { HEADER, parseIntegerHeader, parseRetryAfter, readHeader } from './headers.js';
import type { Classification, ResponseLike } from './types.js';

/**
 * GitHub's wording for a secondary limit. It appears in the response body's
 * `message`, not in any header, which is why the body is worth a look.
 *
 * @see https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api
 */
const SECONDARY_PATTERNS = [
  'secondary rate limit',
  'abuse detection',
  'abuse-detection',
  'triggered an abuse',
] as const;

/** Pull GitHub's `message` out of whatever the caller parsed as the body. */
function messageOf(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data !== null && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return '';
}

function looksSecondary(data: unknown): boolean {
  const message = messageOf(data).toLowerCase();
  if (message === '') {
    return false;
  }
  return SECONDARY_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Classify a single response.
 *
 * The rules, in order:
 *
 * 1. Anything other than `403` or `429` is not a rate limit.
 * 2. `remaining: 0` means the primary budget is spent — on **either** status.
 *    Today `reactions` only ever checks `429` and `activity` only ever checks
 *    the `403` case; each misses what the other catches.
 * 3. A body that says "secondary rate limit", or a `429` that still has budget
 *    left, is a secondary limit: waiting for the primary reset will not clear it
 *    and retrying into it makes it worse (R5).
 * 4. A `403` that carries a parseable `Retry-After` is a secondary limit too.
 *    GitHub documents exactly this shape for secondary limits, and it is the
 *    only signal left when the body was never read — a `fetch` `Response`
 *    body is a stream the default extractor cannot see into.
 * 5. Any other `403` with budget remaining is a permission or policy failure.
 *    It is explicitly *not* a rate limit, and must not be retried as one.
 *
 * `Retry-After` is read whenever present and always wins over a delay derived
 * from `x-ratelimit-reset` (R4).
 */
export function classifyResponse(
  response: ResponseLike,
  nowMs: number,
  resourceHint?: string,
): Classification {
  const { status, headers } = response;

  const remaining = parseIntegerHeader(readHeader(headers, HEADER.remaining));
  const reset = parseIntegerHeader(readHeader(headers, HEADER.reset));
  const resourceHeader = readHeader(headers, HEADER.resource)?.trim();
  const retryAfterMs = parseRetryAfter(readHeader(headers, HEADER.retryAfter), nowMs);

  const resource =
    resourceHeader !== undefined && resourceHeader !== '' ? resourceHeader : (resourceHint ?? 'core');
  const resetAtMs = reset === undefined ? undefined : reset * 1000;

  const base = { resource, status, retryAfterMs, resetAtMs };

  if (status !== 403 && status !== 429) {
    return { ...base, kind: 'none', isRateLimit: false, reason: `status ${status} is not a limit signal` };
  }

  const secondaryByBody = looksSecondary(response.data);

  // The body is unambiguous when present, and it outranks header heuristics —
  // a secondary limit can arrive with `remaining: 0` purely by coincidence.
  if (secondaryByBody) {
    return {
      ...base,
      kind: 'secondary',
      isRateLimit: true,
      reason: `status ${status} with GitHub's secondary-limit wording`,
    };
  }

  if (remaining === 0) {
    return {
      ...base,
      kind: 'primary',
      isRateLimit: true,
      reason: `status ${status} with ${HEADER.remaining}: 0`,
    };
  }

  if (status === 429) {
    // GitHub uses 429 for burst throttling; budget is typically still available.
    return {
      ...base,
      kind: 'secondary',
      isRateLimit: true,
      reason: remaining === undefined ? 'status 429 with no budget reported' : `status 429 with budget remaining`,
    };
  }

  if (retryAfterMs !== undefined) {
    // GitHub's documented secondary-limit response: budget left, told to wait.
    return {
      ...base,
      kind: 'secondary',
      isRateLimit: true,
      reason: `status 403 with ${HEADER.retryAfter} and no exhausted budget`,
    };
  }

  // 403 with budget left, or with no budget reported at all.
  return {
    ...base,
    kind: 'none',
    isRateLimit: false,
    reason:
      remaining === undefined
        ? 'status 403 with no rate-limit headers — permission or policy failure'
        : `status 403 with ${remaining} remaining — permission or policy failure`,
  };
}
