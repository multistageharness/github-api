/**
 * @fileoverview Pagination utilities for GitHub Users API
 * @module pagination
 */

import { parseLinkHeader as parseLinkHeaderOnce } from '@internal/github-sdk-fetch-rest-api';
import { validatePagination, type PaginationOptions } from './validation.js';
import { UsersError } from './errors.js';

/**
 * Pagination info extracted from a response Link header.
 */
export interface PaginationInfo {
  hasNext: boolean;
  hasPrev: boolean;
  nextUrl: string | null;
  prevUrl: string | null;
  firstUrl: string | null;
  lastUrl: string | null;
  totalCount: number | null;
}

/**
 * Parsed Link header relations.
 */
export type PaginationLinks = Record<string, string>;

/**
 * Minimal response shape carrying headers + an attached `_pagination` marker.
 */
export interface ResponseWithHeaders {
  headers?: { get(name: string): string | null };
}

/**
 * Options accepted by the paginate helpers (pagination + a safety request cap).
 */
export interface PaginateOptions extends PaginationOptions {
  maxRequests?: number;
}

/**
 * The dynamic per-page payload returned by an API call. GitHub endpoints return
 * arrays or objects; the HTTP client attaches a `_pagination` marker.
 */
// API responses are dynamically shaped per endpoint; the `_pagination` marker is attached at runtime.
type ApiCallResponse = any;

/**
 * A function that performs one paginated API call.
 */
export type ApiCall = (options: PaginationOptions) => Promise<ApiCallResponse>;

/**
 * Extract pagination info from response
 */
export function extractPaginationInfo(response: ResponseWithHeaders): PaginationInfo {
  const linkHeader = response.headers?.get('link');
  const totalCountHeader = response.headers?.get('x-total-count');

  const info: PaginationInfo = {
    hasNext: false,
    hasPrev: false,
    nextUrl: null,
    prevUrl: null,
    firstUrl: null,
    lastUrl: null,
    totalCount: totalCountHeader ? parseInt(totalCountHeader) : null
  };

  if (!linkHeader) {
    return info;
  }

  // Parse Link header
  const links = parseLinkHeader(linkHeader);

  if (links['next']) {
    info.hasNext = true;
    info.nextUrl = links['next'];
  }

  if (links['prev']) {
    info.hasPrev = true;
    info.prevUrl = links['prev'];
  }

  if (links['first']) {
    info.firstUrl = links['first'];
  }

  if (links['last']) {
    info.lastUrl = links['last'];
  }

  return info;
}

/**
 * Parse Link header into object
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
 * Create pagination iterator
 */
export function paginate(
  apiCall: ApiCall,
  options: PaginateOptions = {}
): { [Symbol.asyncIterator](): AsyncGenerator<unknown, void, unknown> } {
  const validatedOptions = validatePagination(options);

  return {
    async *[Symbol.asyncIterator]() {
      let currentPage = validatedOptions.page || 1;
      let hasMore = true;

      while (hasMore) {
        const response = await apiCall({
          ...validatedOptions,
          page: currentPage
        });

        // Yield the data
        if (Array.isArray(response)) {
          yield* response;
        } else {
          yield response;
        }

        // Check if there's more data
        const pagination = response._pagination;
        hasMore = pagination && pagination.next;

        if (hasMore) {
          currentPage++;
        }
      }
    }
  };
}

/**
 * Collect all pages into a single array
 */
export async function paginateAll(apiCall: ApiCall, options: PaginateOptions = {}): Promise<unknown[]> {
  const results: unknown[] = [];
  const validatedOptions = validatePagination(options);

  let currentPage = validatedOptions.page || 1;
  let hasMore = true;
  let requestCount = 0;
  const maxRequests = options.maxRequests || 100; // Safety limit

  while (hasMore && requestCount < maxRequests) {
    const response = await apiCall({
      ...validatedOptions,
      page: currentPage
    });

    // Add results
    if (Array.isArray(response)) {
      results.push(...response);
    } else if (response && Array.isArray(response.data)) {
      results.push(...response.data);
    } else {
      results.push(response);
    }

    // Check pagination
    const pagination = response._pagination;
    hasMore = pagination && pagination.next;

    if (hasMore) {
      currentPage++;
      requestCount++;
    }
  }

  if (requestCount >= maxRequests) {
    console.warn(`Reached maximum request limit (${maxRequests}). Some results may be missing.`);
  }

  return results;
}

/**
 * Page info extracted from a URL.
 */
export interface PageInfo {
  page?: number | null;
  per_page?: number | null;
  since?: number | null;
}

/**
 * Get page info from URL
 */
export function getPageInfo(url: string | null | undefined): PageInfo {
  if (!url) {
    return {};
  }

  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    return {
      page: params.get('page') ? parseInt(params.get('page')!) : null,
      per_page: params.get('per_page') ? parseInt(params.get('per_page')!) : null,
      since: params.get('since') ? parseInt(params.get('since')!) : null
    };
  } catch {
    return {};
  }
}

/**
 * Build pagination parameters for API request
 */
export function buildPaginationParams(options: PaginationOptions = {}): PaginationOptions {
  const params: PaginationOptions = {};

  if (options.page) {
    params.page = options.page;
  }

  if (options.per_page) {
    params.per_page = options.per_page;
  }

  if (options.since) {
    params.since = options.since;
  }

  return params;
}

/**
 * A paginated response wrapper.
 */
export interface PaginatedResponse {
  data: unknown[];
  pagination: PaginationInfo;
}

/**
 * Create a paginated response wrapper
 */
export function createPaginatedResponse(
  data: unknown,
  pagination: Partial<PaginationInfo> = {}
): PaginatedResponse {
  return {
    data: Array.isArray(data) ? data : [data],
    pagination: {
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false,
      nextUrl: pagination.nextUrl || null,
      prevUrl: pagination.prevUrl || null,
      firstUrl: pagination.firstUrl || null,
      lastUrl: pagination.lastUrl || null,
      totalCount: pagination.totalCount || null
    }
  };
}

/**
 * Auto-paginate helper that yields individual items
 */
export async function* autoPaginate(
  apiCall: ApiCall,
  options: PaginateOptions = {}
): AsyncGenerator<unknown, void, unknown> {
  const validatedOptions = validatePagination(options);
  let currentPage = validatedOptions.page || 1;
  let hasMore = true;
  let requestCount = 0;
  const maxRequests = options.maxRequests || 100;

  while (hasMore && requestCount < maxRequests) {
    try {
      const response = await apiCall({
        ...validatedOptions,
        page: currentPage
      });

      // Yield individual items
      const items = Array.isArray(response)
        ? response
        : response.data
          ? response.data
          : [response];

      for (const item of items) {
        yield item;
      }

      // Check for more pages
      const pagination = response._pagination;
      hasMore = pagination && pagination.next;

      if (hasMore) {
        currentPage++;
        requestCount++;
      }
    } catch (error) {
      throw new UsersError(`Pagination failed at page ${currentPage}: ${(error as Error).message}`);
    }
  }

  if (requestCount >= maxRequests) {
    console.warn(`Auto-pagination stopped at maximum request limit (${maxRequests})`);
  }
}

/**
 * Calculate total pages from pagination info
 */
export function calculateTotalPages(pagination: PaginationInfo, perPage = 30): number | null {
  if (pagination.totalCount) {
    return Math.ceil(pagination.totalCount / perPage);
  }

  // Try to extract from last URL
  if (pagination.lastUrl) {
    const pageInfo = getPageInfo(pagination.lastUrl);
    return pageInfo.page || null;
  }

  return null;
}

/**
 * Create pagination summary
 */
export function createPaginationSummary(
  currentPage: number,
  perPage: number,
  pagination: PaginationInfo
): string {
  if (!pagination.totalCount) {
    return `Page ${currentPage}`;
  }

  const startItem = (currentPage - 1) * perPage + 1;
  const endItem = Math.min(currentPage * perPage, pagination.totalCount);

  return `Items ${startItem}-${endItem} of ${pagination.totalCount}`;
}
