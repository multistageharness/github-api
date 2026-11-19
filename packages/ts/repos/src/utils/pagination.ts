/**
 * @fileoverview Pagination utilities for GitHub API
 * @module pagination
 */

import { parseLinkHeader as parseLinkHeaderOnce } from '@internal/github-sdk-fetch-rest-api';
import { ValidationError } from './errors.js';

/**
 * Minimal HTTP client surface used by the pagination helpers.
 */
export interface PaginationHttpClient {
  request(url: string): Promise<unknown>;
}

/**
 * Parsed `rel -> url` link map.
 */
export type PaginationLinks = Record<string, string>;

/**
 * Pagination info derived from Link headers.
 */
export interface PaginationInfo {
  first: number | null;
  prev: number | null;
  next: number | null;
  last: number | null;
  hasNext: boolean;
  hasPrev: boolean;
  links: PaginationLinks;
}

/**
 * Options accepted by the pagination helpers.
 */
export interface PaginationOptions {
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/**
 * A minimal object exposing GitHub-style pagination headers.
 */
export interface ResponseWithHeaders {
  headers?: { get(name: string): string | null };
}

/**
 * Parse pagination links from GitHub API response headers
 *
 * Delegates to `@internal/github-sdk-fetch-rest-api`'s parser rather than
 * keeping a private copy (PRD 0002, R6). Nine implementations of this existed
 * across `src/` and they already disagreed; the layer's is the one that does
 * not split on a comma inside a query string, which GitHub does emit in `q=`
 * values. Signature and return shape are unchanged.
 */
export function parsePaginationLinks(linkHeader: string | null | undefined): PaginationLinks {
  return parseLinkHeaderOnce(linkHeader);
}

/**
 * Extract page number from URL
 */
export function extractPageFromUrl(url: string | null | undefined): number | null {
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
export function getPaginationInfo(response: ResponseWithHeaders): PaginationInfo {
  const linkHeader = response.headers?.get('link');
  const links = parsePaginationLinks(linkHeader);

  return {
    first: links['first'] ? extractPageFromUrl(links['first']) : null,
    prev: links['prev'] ? extractPageFromUrl(links['prev']) : null,
    next: links['next'] ? extractPageFromUrl(links['next']) : null,
    last: links['last'] ? extractPageFromUrl(links['last']) : null,
    hasNext: !!links['next'],
    hasPrev: !!links['prev'],
    links
  };
}

/**
 * A paginated iterator returned by createPaginatedIterator.
 */
export interface PaginatedIterator<T = unknown> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
  all(limit?: number): Promise<T[]>;
  first(count?: number): Promise<T | T[]>;
}

/**
 * Create paginated request iterator
 */
export function createPaginatedIterator<T = unknown>(
  httpClient: PaginationHttpClient,
  endpoint: string,
  options: PaginationOptions = {}
): PaginatedIterator<T> {
  const defaultOptions: PaginationOptions = {
    per_page: 30,
    page: 1,
    ...options
  };

  return {
    async *[Symbol.asyncIterator](): AsyncIterator<T> {
      let currentPage = defaultOptions.page as number;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          per_page: (defaultOptions.per_page as number).toString()
        });

        // Add other query parameters
        Object.entries(defaultOptions).forEach(([key, value]) => {
          if (!['page', 'per_page'].includes(key) && value !== undefined) {
            params.set(key, String(value));
          }
        });

        const url = `${endpoint}?${params.toString()}`;
        // response shape is endpoint-dependent (array, {items}, or single object)
        const response = (await httpClient.request(url)) as unknown;

        // For most GitHub API endpoints, the response is an array
        if (Array.isArray(response)) {
          for (const item of response) {
            yield item as T;
          }

          // Check if we should continue
          hasMore = response.length === defaultOptions.per_page;
        } else {
          // Some endpoints return objects with items array
          const objResponse = response as { items?: unknown[] };
          if (objResponse.items && Array.isArray(objResponse.items)) {
            for (const item of objResponse.items) {
              yield item as T;
            }
            hasMore = objResponse.items.length === defaultOptions.per_page;
          } else {
            // Single item response
            yield response as T;
            hasMore = false;
          }
        }

        currentPage++;

        // Safety check to prevent infinite loops
        if (currentPage > 1000) {
          break;
        }
      }
    },

    async all(limit: number = Infinity): Promise<T[]> {
      const results: T[] = [];
      let count = 0;

      for await (const item of this) {
        if (count >= limit) break;
        results.push(item);
        count++;
      }

      return results;
    },

    async first(count = 1): Promise<T | T[]> {
      const results: T[] = [];
      let collected = 0;

      for await (const item of this) {
        if (collected >= count) break;
        results.push(item);
        collected++;
      }

      return count === 1 ? (results[0] as T) : results;
    }
  };
}

/**
 * Paginate through all pages and collect results
 */
export async function paginateAll<T = unknown>(
  httpClient: PaginationHttpClient,
  endpoint: string,
  options: PaginationOptions = {}
): Promise<T[]> {
  const iterator = createPaginatedIterator<T>(httpClient, endpoint, options);
  return await iterator.all();
}

/**
 * Get a single page of results
 */
export async function paginate(
  httpClient: PaginationHttpClient,
  endpoint: string,
  options: PaginationOptions = {}
): Promise<{ data: unknown; pagination: PaginationInfo }> {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    per_page: String(options.per_page || 30)
  });

  // Append any additional options
  Object.entries(options).forEach(([key, value]) => {
    if (!['page', 'per_page'].includes(key) && value !== undefined) {
      params.set(key, String(value));
    }
  });

  const url = `${endpoint}?${params.toString()}`;
  const response = await httpClient.request(url);

  return {
    data: response,
    pagination: getPaginationInfo(response as ResponseWithHeaders)
  };
}

/**
 * Page info utility class
 */
export class PageInfo implements PaginationInfo {
  first: number | null = null;
  prev: number | null = null;
  next: number | null = null;
  last: number | null = null;
  hasNext = false;
  hasPrev = false;
  links: PaginationLinks = {};

  constructor(response: ResponseWithHeaders) {
    const paginationInfo = getPaginationInfo(response);
    Object.assign(this, paginationInfo);
  }

  /**
   * Get total number of pages (if last page is known)
   */
  getTotalPages(): number | null {
    return this.last || null;
  }

  /**
   * Check if this is the first page
   */
  isFirstPage(): boolean {
    return !this.hasPrev;
  }

  /**
   * Check if this is the last page
   */
  isLastPage(): boolean {
    return !this.hasNext;
  }

  /**
   * Get current page number (estimated from prev/next)
   */
  getCurrentPage(): number {
    if (this.next) {
      return this.next - 1;
    }
    if (this.prev) {
      return this.prev + 1;
    }
    return 1;
  }
}

/**
 * Options accepted by the PaginationHelper.
 */
export interface PaginationHelperOptions {
  pageSize?: number;
  maxPages?: number;
}

/**
 * Pagination helper for CLI/display purposes
 */
export class PaginationHelper {
  pageSize: number;
  maxPages: number;

  constructor(options: PaginationHelperOptions = {}) {
    this.pageSize = options.pageSize || 30;
    this.maxPages = options.maxPages || 10;
  }

  /**
   * Create pagination display for CLI
   */
  createDisplay(currentPage: number, totalPages: number): string {
    if (totalPages <= 1) {
      return '';
    }

    const parts: string[] = [];

    // Previous page link
    if (currentPage > 1) {
      parts.push(`← Prev (${currentPage - 1})`);
    }

    // Page numbers
    const startPage = Math.max(1, currentPage - Math.floor(this.maxPages / 2));
    const endPage = Math.min(totalPages, startPage + this.maxPages - 1);

    if (startPage > 1) {
      parts.push('1');
      if (startPage > 2) {
        parts.push('...');
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        parts.push(`[${i}]`);
      } else {
        parts.push(i.toString());
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        parts.push('...');
      }
      parts.push(totalPages.toString());
    }

    // Next page link
    if (currentPage < totalPages) {
      parts.push(`Next (${currentPage + 1}) →`);
    }

    return parts.join(' ');
  }

  /**
   * Calculate pagination info for array of items
   */
  paginateArray<T>(
    items: T[],
    page = 1
  ): {
    items: T[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      hasNext: boolean;
      hasPrev: boolean;
      startIndex: number;
      endIndex: number;
    };
  } {
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / this.pageSize);
    const startIndex = (page - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;

    return {
      items: items.slice(startIndex, endIndex),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        startIndex,
        endIndex: Math.min(endIndex, totalItems)
      }
    };
  }
}

/**
 * Validate pagination options
 */
export function validatePaginationOptions(options: PaginationOptions = {}): boolean {
  const errors: string[] = [];

  if (options.page !== undefined) {
    if (!Number.isInteger(options.page) || options.page < 1) {
      errors.push('Page must be a positive integer');
    }
    if (options.page > 1000) {
      errors.push('Page cannot be greater than 1000');
    }
  }

  if (options.per_page !== undefined) {
    if (!Number.isInteger(options.per_page) || options.per_page < 1) {
      errors.push('per_page must be a positive integer');
    }
    if (options.per_page > 100) {
      errors.push('per_page cannot be greater than 100');
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`Pagination validation failed: ${errors.join(', ')}`);
  }

  return true;
}
