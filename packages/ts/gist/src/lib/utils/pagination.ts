/**
 * @fileoverview Generic page-walking helpers.
 * @module lib/utils/pagination
 */

/** Pagination inputs handed to a {@link PageFetcher}. */
export interface PaginationOptions {
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/** Fetches one page of results. */
export type PageFetcher<T> = (options: PaginationOptions) => Promise<T[]>;

const DEFAULT_PER_PAGE = 30;

/**
 * Walk pages, yielding one item at a time.
 *
 * Stops on an empty page, or on a short page — fewer items than `per_page`
 * means the last page has been reached, so requesting another is a wasted call.
 */
export async function* paginate<T>(
  fetchPage: PageFetcher<T>,
  options: PaginationOptions = {}
): AsyncIterableIterator<T> {
  const perPage = options.per_page ?? DEFAULT_PER_PAGE;
  let page = options.page ?? 1;

  for (;;) {
    const items = await fetchPage({ ...options, per_page: perPage, page });
    if (!items || items.length === 0) return;

    for (const item of items) yield item;

    if (items.length < perPage) return;
    page += 1;
  }
}

/** {@link paginate}, collected into a single array. */
export async function paginateAll<T>(
  fetchPage: PageFetcher<T>,
  options: PaginationOptions = {}
): Promise<T[]> {
  const all: T[] = [];
  for await (const item of paginate(fetchPage, options)) all.push(item);
  return all;
}
