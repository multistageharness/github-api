/**
 * Pagination utilities for GitHub API
 */

// Was a type-only import of `node-fetch`'s `Response`. That dependency is retired
// (PRD 0002, R15); this is the platform `Response` — exactly what
// `@internal/github-sdk-fetch-rest-api` issues and hands back — so these
// signatures already accept what the layer produces when this package's client
// tier is built on it (Q4). `lib: DOM` in this package's tsconfig supplies the
// type; nothing is imported, and no HTTP dependency is declared.
import { parseLinkHeader as parseLinkHeaderOnce } from '@internal/github-sdk-fetch-rest-api';
import type { RateLimitError } from './errors.js';

/** Map of pagination relation -> URL parsed from a Link header. */
export type PaginationLinks = Partial<Record<string, string>>;

/** Resolved pagination info derived from response headers. */
export interface PaginationInfo {
  first: number | null;
  prev: number | null;
  next: number | null;
  last: number | null;
  hasNext: boolean;
  hasPrev: boolean;
}

/** A function that fetches a single page (1-based) of array results. */
export type PageFetcher<T> = (page: number) => Promise<T[] | null | undefined>;

/** Options accepted by the page-based paginators. */
export interface PaginateOptions {
  maxPages?: number;
  perPage?: number;
  [key: string]: unknown;
}

/** A single API call invoked with built pagination params. */
export type ApiCall<T> = (params: Record<string, unknown>) => Promise<T[] | null | undefined>;

/** Options accepted by createPaginatedFetcher. */
export interface PaginatedFetcherOptions {
  perPage?: number;
  waitForRateLimit?: boolean;
  /**
   * How many times one page is retried after a `RateLimitError` when
   * `waitForRateLimit` is set. Defaults to 3; the last error is rethrown after.
   */
  maxRateLimitRetries?: number;
  /**
   * Called before each rate-limit wait. The library never writes to stdout
   * itself — that would corrupt a CLI's `--json` output.
   */
  onRateLimit?: (info: { waitMs: number; attempt: number; page: number }) => void;
  [key: string]: unknown;
}

const DEFAULT_MAX_RATE_LIMIT_RETRIES = 3;

/** Response shape consumed by cursor-based pagination. */
export interface CursorPage<T> {
  items?: T[];
  nextCursor?: string | null;
  endCursor?: string | null;
}

/** A function that fetches a page given a cursor. */
export type CursorFetcher<T> = (cursor: string | null) => Promise<CursorPage<T> | null | undefined>;

/** Options accepted by paginateWithCursor. */
export interface CursorOptions {
  cursor?: string | null;
  maxPages?: number;
}

/** Options accepted by buildPaginationParams. */
export interface PaginationParamOptions {
  page?: number | string;
  perPage?: number | string;
  per_page?: number | string;
  sort?: string;
  direction?: string;
  order?: string;
}

/**
 * Parse Link header for pagination
 *
 * Delegates to `@internal/github-sdk-fetch-rest-api`'s parser rather than
 * keeping a private copy (PRD 0002, R6). Nine implementations of this existed
 * across `src/` and they already disagreed; the layer's is the one that does
 * not split on a comma inside a query string, which GitHub does emit in `q=`
 * values. Signature and return shape are unchanged.
 */
export function parseLinkHeader(linkHeader: string | null | undefined): PaginationLinks {
  return parseLinkHeaderOnce(linkHeader);
}

/**
 * Extract page number from URL
 */
export function extractPageNumber(url: string | null | undefined): number | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const page = urlObj.searchParams.get('page');
    return page ? parseInt(page, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Get pagination info from response headers
 */
export function getPaginationInfo(response: Response): PaginationInfo {
  const linkHeader = response.headers.get('link');
  const links = parseLinkHeader(linkHeader);

  return {
    first: extractPageNumber(links.first),
    prev: extractPageNumber(links.prev),
    next: extractPageNumber(links.next),
    last: extractPageNumber(links.last),
    hasNext: !!links.next,
    hasPrev: !!links.prev
  };
}

/**
 * Paginate through all results
 */
export async function* paginate<T>(
  fetcher: PageFetcher<T>,
  options: PaginateOptions = {}
): AsyncGenerator<T, void, unknown> {
  const maxPages = options.maxPages || Infinity;
  const perPage = options.perPage || 30;
  let page = 1;

  while (page <= maxPages) {
    const results = await fetcher(page);

    if (!results || !Array.isArray(results) || results.length === 0) {
      break;
    }

    for (const item of results) {
      yield item;
    }

    // Stop pagination if we get fewer results than expected
    // This typically indicates we've reached the last page
    if (results.length < perPage) {
      break;
    }

    page++;
  }
}

/**
 * Collect all pages into a single array
 */
export async function collectAllPages<T>(
  fetcher: PageFetcher<T>,
  options: PaginateOptions = {}
): Promise<T[]> {
  const results: T[] = [];

  for await (const item of paginate(fetcher, options)) {
    results.push(item);
  }

  return results;
}

/**
 * Create a paginated fetcher with rate limit handling
 */
export function createPaginatedFetcher<T>(
  apiCall: ApiCall<T>,
  options: PaginatedFetcherOptions = {}
): PageFetcher<T> {
  const {
    maxRateLimitRetries = DEFAULT_MAX_RATE_LIMIT_RETRIES,
    onRateLimit,
    ...forwarded
  } = options;

  return async function fetchPage(page: number): Promise<T[] | null | undefined> {
    const params = {
      ...forwarded,
      page,
      per_page: options.perPage || 30
    };

    for (let attempt = 1; ; attempt++) {
      try {
        return await apiCall(params);
      } catch (error) {
        // If rate limited, wait (bounded) and retry. `getTimeUntilReset()` is ms.
        if (
          (error as { name?: string }).name === 'RateLimitError' &&
          options.waitForRateLimit &&
          attempt <= maxRateLimitRetries
        ) {
          const waitMs = (error as RateLimitError).getTimeUntilReset();
          if (waitMs > 0) {
            onRateLimit?.({ waitMs, attempt, page });
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
        }
        throw error;
      }
    }
  };
}

/**
 * Paginate with cursor-based pagination
 */
export async function* paginateWithCursor<T>(
  fetcher: CursorFetcher<T>,
  options: CursorOptions = {}
): AsyncGenerator<T, void, unknown> {
  let cursor: string | null = options.cursor || null;
  const maxPages = options.maxPages || Infinity;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const response = await fetcher(cursor);

    if (!response || !response.items || response.items.length === 0) {
      break;
    }

    for (const item of response.items) {
      yield item;
    }

    cursor = response.nextCursor || response.endCursor || null;
    if (!cursor) {
      break;
    }

    pageCount++;
  }
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(totalItems: number, perPage: number): number {
  return Math.ceil(totalItems / perPage);
}

/**
 * Build pagination query parameters
 */
export function buildPaginationParams(options: PaginationParamOptions = {}): URLSearchParams {
  const params = new URLSearchParams();

  if (options.page) {
    params.append('page', String(options.page));
  }

  if (options.perPage || options.per_page) {
    params.append('per_page', String(options.perPage || options.per_page));
  }

  if (options.sort) {
    params.append('sort', options.sort);
  }

  if (options.direction || options.order) {
    params.append('direction', String(options.direction || options.order));
  }

  return params;
}

export default {
  parseLinkHeader,
  extractPageNumber,
  getPaginationInfo,
  paginate,
  collectAllPages,
  createPaginatedFetcher,
  paginateWithCursor,
  calculateTotalPages,
  buildPaginationParams
};
