/**
 * @fileoverview HTTP transport. Every request now goes out through
 * `@internal/github-sdk-fetch-rest-api` (PRD 0002, R14).
 *
 * The exported surface is unchanged: `request` takes and returns exactly what
 * it always did, `parseLink`/`extractPagination`/`handleRateLimit` keep their
 * signatures, and the module-level limiter is still shared. What changed is
 * what is underneath — the URL building, headers, body handling, timeout,
 * response reading and `Link` parsing are the layer's, not this file's.
 * @module utils/http
 */

import {
  GitHubHttpError,
  GitHubRestClient,
  parseLinkHeader,
} from '@internal/github-sdk-fetch-rest-api';
import {
  GitHubRateLimiter,
  isRateLimitError,
  rateLimitErrorFrom,
  type GitHubRateLimitError,
} from '@internal/github-sdk-ratelimit';

/**
 * Options accepted by {@link request}.
 */
export interface RequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /**
   * Limiter governing this request. Defaults to the module-level one shared by
   * every call, which is what keeps a single process from spending the same
   * GitHub budget from two independent limiters.
   */
  limiter?: GitHubRateLimiter;
  /**
   * HTTP proxy for this request (PRD 0002, R6, R8).
   *
   * Resolved from `GITHUB_PROXY`/`HTTPS_PROXY` when omitted; `null` forces a
   * direct connection. Transports are cached per limiter **and** per proxy, so
   * two clients with different proxies do not share one.
   */
  proxy?: string | null | undefined;
  /** Hosts reached directly even when a proxy is configured — curl's `NO_PROXY` rules (R2). */
  proxyBypass?: string | readonly string[] | null | undefined;
}

let sharedLimiter: GitHubRateLimiter | undefined;

/**
 * One REST client per limiter.
 *
 * `request` is a free function with no client object to hang state off, so the
 * transport is cached against the limiter that governs it rather than rebuilt
 * per call. Keyed weakly, so replacing the shared limiter drops its client too.
 */
const clientsByLimiter = new WeakMap<GitHubRateLimiter, Map<string, GitHubRestClient>>();

/**
 * The limiter every {@link request} uses unless one is passed in.
 *
 * `request` is a free function with no client object to hang state off, so the
 * budget has to live at module scope to be shared at all. Constructed lazily so
 * importing this module costs nothing.
 */
export function getSharedRateLimiter(): GitHubRateLimiter {
  if (sharedLimiter === undefined) {
    sharedLimiter = new GitHubRateLimiter();
  }
  return sharedLimiter;
}

/**
 * Replace the module-level limiter. Intended for tests and for a host that
 * wants one limiter across several SDKs sharing a token.
 */
export function setSharedRateLimiter(limiter: GitHubRateLimiter | undefined): void {
  sharedLimiter = limiter;
}

/**
 * The transport for a given limiter.
 *
 * No token and no base URL are configured here: this client's callers pass a
 * fully-built absolute URL and their own `Authorization` header, and the layer
 * takes an absolute URL verbatim. Changing that would be a public API change
 * to `TeamsClient`, which R14 forbids.
 */
function clientFor(
  limiter: GitHubRateLimiter,
  proxy: string | null | undefined,
  proxyBypass: string | readonly string[] | null | undefined,
): GitHubRestClient {
  // Keyed by limiter *and* proxy: a client built for one proxy cannot serve a
  // request that asked for another, and `undefined` (resolve from the
  // environment) is a different key from `null` (force direct). A proxy value
  // can never be `-`, so it is safe as the absent marker.
  const key = `${proxy === undefined ? '-' : String(proxy)}\u0000${
    proxyBypass === undefined ? '-' : String(proxyBypass)
  }`;

  let byProxy = clientsByLimiter.get(limiter);
  if (byProxy === undefined) {
    byProxy = new Map<string, GitHubRestClient>();
    clientsByLimiter.set(limiter, byProxy);
  }

  const existing = byProxy.get(key);
  if (existing !== undefined) return existing;

  const client = new GitHubRestClient({
    limiter,
    ...(proxy === undefined ? {} : { proxy }),
    ...(proxyBypass === undefined ? {} : { proxyBypass }),
  });
  byProxy.set(key, client);
  return client;
}

/**
 * Error augmented with HTTP response metadata, mirroring the dynamic properties
 * the source attached to a plain `Error`.
 */
export interface HttpError extends Error {
  status?: number;
  response?: unknown;
  headers?: Record<string, string>;
  original?: unknown;
}

export async function request(options: RequestOptions): Promise<unknown> {
  const { method, url, headers, body } = options;
  const limiter = options.limiter ?? getSharedRateLimiter();

  try {
    const result = await clientFor(limiter, options.proxy, options.proxyBypass).request(
      `${method} ${url}`,
      {},
      {
        headers: {
          // Sent on every request, as it always was here — including GETs.
          'Content-Type': 'application/json',
          ...headers,
        },
        // The source sent a body for everything except GET and DELETE.
        ...(body !== undefined && body !== null && method !== 'GET' && method !== 'DELETE'
          ? { body }
          : {}),
      },
    );

    return result.data;
  } catch (error) {
    // A rate limit the limiter could not wait out. Carry `status` so it takes
    // the same path as any other HTTP failure for callers that branch on it.
    if (isRateLimitError(error)) {
      const limitError = error as GitHubRateLimitError;
      const rateLimited = new Error(limitError.message) as HttpError;
      rateLimited.status = limitError.status;
      rateLimited.original = limitError;
      throw rateLimited;
    }

    // The layer's HTTP error, mapped back onto the shape this package's callers
    // already catch: a plain `Error` carrying `status`, `response` and
    // `headers` (R14).
    if (error instanceof GitHubHttpError) {
      const message =
        (error.data as { message?: string } | null)?.message ??
        `HTTP ${error.status}: ${error.response.statusText}`;
      const mapped = new Error(message) as HttpError;
      mapped.status = error.status;
      mapped.response = error.data;
      mapped.headers = Object.fromEntries(error.headers.entries());
      throw mapped;
    }

    const err = error as HttpError;
    if (err.status) {
      throw err;
    }

    const networkError = new Error(`Network error: ${err.message}`) as HttpError;
    networkError.original = error;
    throw networkError;
  }
}

/**
 * Pagination links extracted from a `Link` header.
 */
export type ParsedLinks = Record<string, string>;

/**
 * Parse a `Link` header.
 *
 * Delegates to the fetch layer's parser rather than keeping a ninth copy of it
 * (R6). The layer's is the one that does not split on a comma inside a query
 * string, which the regex this used to hold did.
 */
export function parseLink(linkHeader?: string | null): ParsedLinks {
  return parseLinkHeader(linkHeader);
}

/**
 * Pagination cursor links.
 */
export interface Pagination {
  next: string | null;
  prev: string | null;
  first: string | null;
  last: string | null;
}

export function extractPagination(headers: Record<string, string>): Pagination {
  const linkHeader = headers['link'] || headers['Link'];
  const links = parseLink(linkHeader);

  return {
    next: links['next'] || null,
    prev: links['prev'] || null,
    first: links['first'] || null,
    last: links['last'] || null
  };
}

/**
 * Parsed rate-limit metadata.
 */
export interface RateLimit {
  limit: number;
  remaining: number;
  reset: Date;
}

export function handleRateLimit(headers: Record<string, string>): RateLimit {
  const limit = headers['x-ratelimit-limit'];
  const remaining = headers['x-ratelimit-remaining'];
  const reset = headers['x-ratelimit-reset'];

  if (remaining === '0') {
    const resetDate = new Date(Number(reset) * 1000);
    // Still an `Error` with the same message, so existing `catch` blocks and
    // message assertions are unaffected — but now a *typed* one, recognizable
    // by `isRateLimitError` instead of only by reading its text (R11).
    throw rateLimitErrorFrom(
      {
        kind: 'primary',
        isRateLimit: true,
        resource: 'core',
        status: 403,
        reason: 'x-ratelimit-remaining: 0',
        resetAtMs: Number.isFinite(Number(reset)) ? Number(reset) * 1000 : undefined,
      },
      { retried: false, attempts: 1, exceededWaitCeiling: false },
      { message: `Rate limit exceeded. Resets at ${resetDate.toISOString()}` },
    );
  }

  return {
    limit: parseInt(limit as string, 10),
    remaining: parseInt(remaining as string, 10),
    reset: new Date(Number(reset) * 1000)
  };
}
