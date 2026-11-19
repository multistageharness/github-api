/**
 * @fileoverview LRU + TTL memoizing search client.
 *
 * Extends `BaseSearchClient` **directly** — it is not part of the
 * `Safe → RateLimited → Base` chain. `tests/module-structure.test.ts:76-79`
 * pins that.
 *
 * @module lib/CachedSearchClient
 */

import { BaseSearchClient } from './BaseSearchClient.js';
import type { BaseSearchClientOptions, SearchParams, SearchResult } from './BaseSearchClient.js';
import type { SearchEndpoint } from '../endpoints/index.js';
import { buildCacheKey, normalizeQuery } from '../utils/index.js';

/** Default entry lifetime, in milliseconds. */
export const DEFAULT_CACHE_TTL_MS = 300_000;
/** Default maximum number of cached entries. */
export const DEFAULT_MAX_CACHE_SIZE = 1000;

export interface CachedSearchClientOptions extends BaseSearchClientOptions {
  /** Entry lifetime in ms. Default `300000`. */
  cacheTTL?: number;
  /** LRU ceiling. Default `1000`. */
  maxCacheSize?: number;
  /** Run `params.q` through `normalizeQuery()` before keying. */
  normalizeQueries?: boolean;
}

/** Snapshot returned by `getCacheStats()`. */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
}

interface CacheEntry {
  value: SearchResult;
  expires: number;
}

/**
 * Memoizes search responses under `buildCacheKey(endpoint, params)`.
 *
 * The store is a `Map`, whose guaranteed insertion order gives LRU for free:
 * on a hit, delete-then-set moves the entry to the end; on overflow, the first
 * key is the least recently used.
 */
export class CachedSearchClient extends BaseSearchClient {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #cacheTTL: number;
  readonly #maxCacheSize: number;
  readonly #normalizeQueries: boolean;
  #hits = 0;
  #misses = 0;

  constructor(options: CachedSearchClientOptions = {}) {
    super(options);
    this.#cacheTTL = options.cacheTTL ?? DEFAULT_CACHE_TTL_MS;
    this.#maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    this.#normalizeQueries = options.normalizeQueries ?? false;
  }

  /** Key the entry, optionally normalizing `q` first. */
  #keyFor(endpoint: SearchEndpoint, params: SearchParams): string {
    const keyed: SearchParams = this.#normalizeQueries
      ? { ...params, q: normalizeQuery(String(params.q ?? '')) }
      : params;
    return buildCacheKey(endpoint, keyed);
  }

  protected override async request<T = unknown>(
    endpoint: SearchEndpoint,
    params: SearchParams = {}
  ): Promise<SearchResult<T>> {
    const key = this.#keyFor(endpoint, params);
    const entry = this.#cache.get(key);

    if (entry) {
      if (entry.expires > Date.now()) {
        // Bump recency, then serve.
        this.#cache.delete(key);
        this.#cache.set(key, entry);
        this.#hits += 1;
        return entry.value as SearchResult<T>;
      }
      // An expired entry is a MISS, not a hit — drop it before counting.
      this.#cache.delete(key);
    }

    this.#misses += 1;
    const value = await super.request<T>(endpoint, params);
    this.#cache.set(key, { value: value as SearchResult, expires: Date.now() + this.#cacheTTL });

    while (this.#cache.size > this.#maxCacheSize) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }

    return value;
  }

  /**
   * Cache occupancy plus lifetime hit/miss counters.
   */
  getCacheStats(): CacheStats {
    return { size: this.#cache.size, hits: this.#hits, misses: this.#misses };
  }

  /**
   * Empty the store.
   *
   * Decision: `hits`/`misses` are **not** reset. They are lifetime counters of
   * client behavior — zeroing them would make cache-effectiveness monitoring
   * lie after any flush. Only `size` returns to `0`.
   */
  clearCache(): void {
    this.#cache.clear();
  }
}
