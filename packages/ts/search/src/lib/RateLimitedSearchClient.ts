/**
 * @fileoverview Client-side sliding-window request accounting.
 *
 * Sits between `BaseSearchClient` and `SafeSearchClient` in the tier chain, so
 * its constructor forwards base options untouched.
 *
 * @module lib/RateLimitedSearchClient
 */

import { BaseSearchClient } from './BaseSearchClient.js';
import type { BaseSearchClientOptions, SearchParams, SearchResult } from './BaseSearchClient.js';
import type { SearchEndpoint } from '../endpoints/index.js';

/** Default requests tracked per window. */
export const DEFAULT_REQUESTS_PER_WINDOW = 30;
/** Default sliding-window size, in milliseconds. */
export const DEFAULT_WINDOW_MS = 60_000;

export interface RateLimitedSearchClientOptions extends BaseSearchClientOptions {
  /** Tracking budget per window. Default `30`. */
  requestsPerWindow?: number;
  /** Sliding window size in ms. Default `60000`. */
  windowMs?: number;
  /**
   * Pace requests against GitHub's remaining `search` budget, stretching what
   * is left across the rest of the window instead of spending it in a burst.
   *
   * Default `false`, which preserves this client's long-standing
   * track-but-do-not-throttle behavior. Previously this option was accepted,
   * stored, and drove nothing; an option that does not do what it says is a
   * defect, not a placeholder (R12).
   */
  adaptiveRateLimit?: boolean;
  /**
   * Requests held back from GitHub's reported budget so a burst cannot spend
   * the very last one. Unit: **requests**. Default `0`.
   *
   * Only has an effect when `adaptiveRateLimit` is on, which is the only mode
   * that consults the budget at all.
   */
  rateLimitBuffer?: number;
}

/** Snapshot returned by `getRateLimitStatus()`. */
export interface RateLimitStatus {
  requestsInWindow: number;
  requestsPerWindow: number;
  windowMs: number;
}

/**
 * Records the timestamp of every request in a sliding window so the SDK can
 * observe its own burst rate.
 *
 * By default it still only **tracks** — `getRateLimitStatus()` reports this
 * client's own window and nothing paces against it, which is the behavior
 * callers have always had. What changed is that the two tuning options are no
 * longer inert: `adaptiveRateLimit` turns on pacing against GitHub's reported
 * `search` budget, and `rateLimitBuffer` reserves requests within it (R12).
 *
 * Note the two different questions these answer. This window is *client-side*
 * accounting of 30 requests per 60 s, invented locally. `getSearchRateLimit()`
 * on the base client reports what GitHub actually says about the `search`
 * resource. They are not the same number and never were.
 */
export class RateLimitedSearchClient extends BaseSearchClient {
  #timestamps: number[] = [];
  readonly #requestsPerWindow: number;
  readonly #windowMs: number;
  readonly #adaptiveRateLimit: boolean;
  readonly #rateLimitBuffer: number;

  constructor(options: RateLimitedSearchClientOptions = {}) {
    const adaptiveRateLimit = options.adaptiveRateLimit ?? false;
    const rateLimitBuffer = options.rateLimitBuffer ?? 0;

    super({
      ...options,
      // Both options now reach the limiter, which is what makes them real.
      // With `adaptiveRateLimit` off — the default — pacing is disabled and
      // this client still only tracks, exactly as it did before.
      rateLimiterOptions: {
        adaptivePacing: adaptiveRateLimit,
        reserve: rateLimitBuffer,
        ...options.rateLimiterOptions,
      },
    });

    this.#requestsPerWindow = options.requestsPerWindow ?? DEFAULT_REQUESTS_PER_WINDOW;
    this.#windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.#adaptiveRateLimit = adaptiveRateLimit;
    this.#rateLimitBuffer = rateLimitBuffer;
  }

  /** Drop timestamps that have aged out of the window. */
  #evictExpired(): void {
    const cutoff = Date.now() - this.#windowMs;
    this.#timestamps = this.#timestamps.filter((t) => t > cutoff);
  }

  protected override async request<T = unknown>(
    endpoint: SearchEndpoint,
    params: SearchParams = {}
  ): Promise<SearchResult<T>> {
    this.#evictExpired();
    this.#timestamps.push(Date.now());
    return super.request<T>(endpoint, params);
  }

  /**
   * Current window occupancy.
   *
   * Evicting on read (not only on write) matters: without it a client idle for
   * an hour still reports a full window.
   */
  getRateLimitStatus(): RateLimitStatus {
    this.#evictExpired();
    return {
      requestsInWindow: this.#timestamps.length,
      requestsPerWindow: this.#requestsPerWindow,
      windowMs: this.#windowMs,
    };
  }

  /** Read-back for the two declared-but-unenforced options. */
  protected get rateLimitTuning(): { adaptiveRateLimit: boolean; rateLimitBuffer: number } {
    return { adaptiveRateLimit: this.#adaptiveRateLimit, rateLimitBuffer: this.#rateLimitBuffer };
  }
}
