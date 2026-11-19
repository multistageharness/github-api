/**
 * Pagination utilities for GitHub Issues API
 */

import { parseLinkHeader as parseLinkHeaderOnce } from '@internal/github-sdk-fetch-rest-api';

/** Map of rel -> url parsed from a Link header. */
export type LinkMap = Record<string, string>;

/** A page response consumed by the paginators. */
export interface PageResponse<T = unknown> {
  data: T[];
  links?: LinkMap;
  [key: string]: unknown;
}

/** Options accepted by the paginators. */
export interface PaginateOptions {
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/** A function that fetches one page given options. */
export type FetchPageFn<T = unknown> = (options: PaginateOptions) => Promise<PageResponse<T>>;

/**
 * Parse Link header to extract pagination URLs
 *
 * Delegates to `@internal/github-sdk-fetch-rest-api`'s parser rather than
 * keeping a private copy (PRD 0002, R6). Nine implementations of this existed
 * across `src/` and they already disagreed; the layer's is the one that does
 * not split on a comma inside a query string, which GitHub does emit in `q=`
 * values. Signature and return shape are unchanged.
 */
export function parseLinkHeader(linkHeader: string | null | undefined): LinkMap {
  return parseLinkHeaderOnce(linkHeader);
}

/**
 * Extract page number from URL
 */
export function extractPageNumber(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = url.match(/[?&]page=(\d+)/);
  return match ? parseInt(match[1] as string, 10) : null;
}

/**
 * Paginate through API results
 */
export async function* paginate<T = unknown>(
  fetchFunction: FetchPageFn<T>,
  options: PaginateOptions = {},
  maxPages = Infinity
): AsyncGenerator<T, void, unknown> {
  let page = options.page || 1;
  let pagesRetrieved = 0;

  while (pagesRetrieved < maxPages) {
    const response = await fetchFunction({ ...options, page, per_page: options.per_page || 100 });

    if (!response || !Array.isArray(response.data)) {
      break;
    }

    for (const item of response.data) {
      yield item;
    }

    pagesRetrieved++;

    // Check if there's a next page
    if (!response.links?.next || response.data.length === 0) {
      break;
    }

    page++;
  }
}

/**
 * Collect all pages into a single array
 */
export async function collectAllPages<T = unknown>(
  fetchFunction: FetchPageFn<T>,
  options: PaginateOptions = {},
  maxItems = Infinity
): Promise<T[]> {
  const items: T[] = [];
  let page = options.page || 1;

  while (items.length < maxItems) {
    const response = await fetchFunction({
      ...options,
      page,
      per_page: Math.min(100, maxItems - items.length)
    });

    if (!response || !Array.isArray(response.data)) {
      break;
    }

    items.push(...response.data);

    // Check if there's a next page
    if (!response.links?.next || response.data.length === 0) {
      break;
    }

    page++;
  }

  return items.slice(0, maxItems);
}

/** Headers as accessed by createPaginatedResponse. */
export interface PaginationHeaders {
  link?: string;
  Link?: string;
  'x-total-count'?: string;
  'x-ratelimit-limit'?: string;
  'x-ratelimit-remaining'?: string;
  'x-ratelimit-reset'?: string;
  [key: string]: string | undefined;
}

/** A built paginated response. */
export interface PaginatedResponse<T = unknown> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number | null;
    hasNext: boolean;
    hasPrev: boolean;
    firstPage: number;
    lastPage: number | null;
    nextPage: number | null;
    prevPage: number | null;
  };
  links: LinkMap;
  headers: {
    rateLimit: number | null;
    rateLimitRemaining: number | null;
    rateLimitReset: number | null;
  };
}

/**
 * Create a paginated response object
 */
export function createPaginatedResponse<T = unknown>(
  data: T[],
  headers: PaginationHeaders,
  options: PaginateOptions = {}
): PaginatedResponse<T> {
  const links = parseLinkHeader(headers.link || headers.Link);
  const currentPage = options.page || 1;

  return {
    data,
    pagination: {
      page: currentPage,
      per_page: options.per_page || 30,
      total: headers['x-total-count'] ? parseInt(headers['x-total-count'], 10) : null,
      hasNext: !!links['next'],
      hasPrev: !!links['prev'],
      firstPage: extractPageNumber(links['first']) || 1,
      lastPage: extractPageNumber(links['last']),
      nextPage: extractPageNumber(links['next']),
      prevPage: extractPageNumber(links['prev'])
    },
    links,
    headers: {
      rateLimit: headers['x-ratelimit-limit'] ? parseInt(headers['x-ratelimit-limit'], 10) : null,
      rateLimitRemaining: headers['x-ratelimit-remaining']
        ? parseInt(headers['x-ratelimit-remaining'], 10)
        : null,
      rateLimitReset: headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset'], 10) : null
    }
  };
}
