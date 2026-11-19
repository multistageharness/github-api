/**
 * Pagination utilities
 * @module utils/pagination
 */

import { parseLinkHeader as parseLinkHeaderOnce } from '@internal/github-sdk-fetch-rest-api';
import type { PageLinks, RateLimit } from '../models/types.js';

/**
 * Options accepted by pagination helpers and the Paginator.
 */
export interface PaginationOptions {
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: string;
  since?: string;
  before?: string;
  [key: string]: unknown;
}

/**
 * Query parameters produced by buildPaginationParams.
 */
export interface PaginationParams {
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: string;
  since?: string;
  before?: string;
  [key: string]: unknown;
}

/**
 * A result page as returned by HttpClient.get and friends.
 */
export interface PageResult<T> {
  data: T[];
  pagination?: PageLinks | null;
  rateLimit?: RateLimit;
  /** GitHub's `X-Poll-Interval`, in ms, when the response carried one. */
  pollInterval?: number;
}

/**
 * Result of fetching a single page through the Paginator.
 */
export interface PaginatorPage<T> {
  items: T[];
  hasMore: boolean;
  page?: number;
  totalFetched?: number;
  rateLimit?: RateLimit;
}

/**
 * Parse GitHub Link header for pagination
 */
export function parseLinkHeader(linkHeader: string | null | undefined): PageLinks | null {
  if (!linkHeader) {
    return null;
  }

  // The `Link` header is parsed by the fetch layer (PRD 0002, R6); the derived
  // `<rel>_page` numbers are this package's own shape and stay here.
  const links: PageLinks = {};
  for (const [rel, url] of Object.entries(parseLinkHeaderOnce(linkHeader))) {
    links[rel] = url;

    // Extract page number from URL
    const pageMatch = url.match(/[?&]page=(\d+)/);
    if (pageMatch && pageMatch[1] !== undefined) {
      links[`${rel}_page`] = parseInt(pageMatch[1]);
    }
  }

  return links;
}

/**
 * Build pagination query parameters
 */
export function buildPaginationParams(options: PaginationOptions = {}): PaginationParams {
  const params: PaginationParams = {};

  if (options.page !== undefined) {
    params.page = Math.max(1, options.page);
  }

  if (options.per_page !== undefined) {
    params.per_page = Math.min(100, Math.max(1, options.per_page));
  }

  if (options.sort) {
    params.sort = options.sort;
  }

  if (options.direction) {
    params.direction = options.direction;
  }

  if (options.since) {
    params.since = options.since;
  }

  if (options.before) {
    params.before = options.before;
  }

  return params;
}

/**
 * Paginator class for iterating through pages
 */
export class Paginator<T = unknown> {
  fetchFunction: (params: PaginationOptions) => Promise<PageResult<T>>;
  options: PaginationOptions;
  currentPage: number;
  perPage: number;
  hasMore: boolean;
  items: T[];
  totalFetched: number;

  constructor(
    fetchFunction: (params: PaginationOptions) => Promise<PageResult<T>>,
    options: PaginationOptions = {}
  ) {
    this.fetchFunction = fetchFunction;
    this.options = options;
    this.currentPage = options.page || 1;
    this.perPage = options.per_page || 30;
    this.hasMore = true;
    this.items = [];
    this.totalFetched = 0;
  }

  /**
   * Fetch next page
   */
  async fetchNextPage(): Promise<PaginatorPage<T>> {
    if (!this.hasMore) {
      return { items: [], hasMore: false };
    }

    const params: PaginationOptions = {
      ...this.options,
      page: this.currentPage,
      per_page: this.perPage
    };

    const response = await this.fetchFunction(params);

    this.items = response.data;
    this.totalFetched += this.items.length;

    // Check if there are more pages
    if (response.pagination) {
      this.hasMore = !!response.pagination['next'];
      const nextPage = response.pagination['next_page'];
      if (nextPage !== undefined && typeof nextPage === 'number') {
        this.currentPage = nextPage;
      } else {
        this.currentPage++;
      }
    } else {
      // No pagination info, check if we got a full page
      this.hasMore = this.items.length === this.perPage;
      this.currentPage++;
    }

    return {
      items: this.items,
      hasMore: this.hasMore,
      page: this.currentPage - 1,
      totalFetched: this.totalFetched,
      rateLimit: response.rateLimit
    };
  }

  /**
   * Async iterator implementation
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (this.hasMore) {
      const result = await this.fetchNextPage();

      for (const item of result.items) {
        yield item;
      }

      if (!result.hasMore) {
        break;
      }
    }
  }

  /**
   * Fetch all items
   */
  async fetchAll(maxItems: number = Infinity): Promise<T[]> {
    const allItems: T[] = [];

    for await (const item of this) {
      allItems.push(item);

      if (allItems.length >= maxItems) {
        break;
      }
    }

    return allItems;
  }

  /**
   * Reset paginator to first page
   */
  reset(): void {
    this.currentPage = this.options.page || 1;
    this.hasMore = true;
    this.items = [];
    this.totalFetched = 0;
  }
}

/**
 * Pagination metadata accepted by createPaginatedResponse.
 */
export interface PaginationMeta {
  page?: number;
  per_page?: number;
  total?: number | null;
  has_next?: boolean;
  has_previous?: boolean;
  first_page?: number;
  last_page?: number | null;
  next_page?: number | null;
  previous_page?: number | null;
}

/**
 * Create a paginated response object
 */
export function createPaginatedResponse<T>(items: T[], pagination: PaginationMeta) {
  return {
    items,
    pagination: {
      page: pagination.page || 1,
      per_page: pagination.per_page || items.length,
      total: pagination.total || null,
      has_next: pagination.has_next || false,
      has_previous: pagination.has_previous || false,
      first_page: pagination.first_page || 1,
      last_page: pagination.last_page || null,
      next_page: pagination.next_page || null,
      previous_page: pagination.previous_page || null
    }
  };
}
