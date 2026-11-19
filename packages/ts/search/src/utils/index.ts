/**
 * Public utilities barrel — resolved by the `./utils` package export.
 * @module utils
 */

export {
  SearchError,
  AuthError,
  APIError,
  RateLimitError
} from './errors.js';

/**
 * Normalize a search query string for stable cache keys: trim and collapse
 * internal whitespace, lowercasing qualifier-free terms.
 */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/**
 * Build a stable cache key from an endpoint name and a params object.
 */
export function buildCacheKey(endpoint: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return `${endpoint}?${sorted}`;
}
