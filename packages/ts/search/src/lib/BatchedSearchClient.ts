/**
 * @fileoverview Client-side request coalescing.
 *
 * GitHub has **no batch search endpoint**. "Batching" here is concurrency
 * management on the client side: requests issued within `batchWindowMs` are
 * collected, deduplicated, chunked to at most `maxBatchSize`, and issued in
 * parallel within a chunk / serially across chunks. Firing 500 requests at once
 * would trip GitHub's abuse detection.
 *
 * Extends `BaseSearchClient` **directly** — an independent branch, not part of
 * the `Safe` chain (`tests/module-structure.test.ts:102-105`).
 *
 * @module lib/BatchedSearchClient
 */

import { BaseSearchClient } from './BaseSearchClient.js';
import type { BaseSearchClientOptions, SearchParams, SearchResult } from './BaseSearchClient.js';
import type { SearchEndpoint } from '../endpoints/index.js';
import { buildCacheKey } from '../utils/index.js';

/** Default maximum requests issued in parallel per flush. */
export const DEFAULT_MAX_BATCH_SIZE = 10;
/** Default coalescing window, in milliseconds. */
export const DEFAULT_BATCH_WINDOW_MS = 100;

export interface BatchedSearchClientOptions extends BaseSearchClientOptions {
  /** Maximum parallel requests per flush. Default `10`. */
  maxBatchSize?: number;
  /** Coalescing window in ms. Default `100`. */
  batchWindowMs?: number;
  /** Collapse identical requests within one flush. Default `true`. */
  deduplicateRequests?: boolean;
  /** Declared for option-surface parity with the safe tier; unenforced. */
  batchingEnabled?: boolean;
}

/** One entry of a `batchSearch()` call. */
export type BatchSearchRequest = { type: SearchEndpoint } & SearchParams;

/** One settled slot of a `batchSearch()` result, positionally aligned to input. */
export interface BatchSearchResult<T = unknown> {
  success: boolean;
  data?: SearchResult<T>;
  error?: string;
}

interface PendingRequest {
  key: string;
  endpoint: SearchEndpoint;
  params: SearchParams;
  resolve: (value: SearchResult<unknown>) => void;
  reject: (reason: unknown) => void;
}

/** Render an unknown rejection reason as a message string. */
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export class BatchedSearchClient extends BaseSearchClient {
  readonly #maxBatchSize: number;
  readonly #batchWindowMs: number;
  readonly #deduplicateRequests: boolean;
  readonly #batchingEnabled: boolean;

  #pending: PendingRequest[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: BatchedSearchClientOptions = {}) {
    super(options);
    this.#maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    this.#batchWindowMs = options.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
    this.#deduplicateRequests = options.deduplicateRequests ?? true;
    this.#batchingEnabled = options.batchingEnabled ?? true;
  }

  /**
   * Queue the request and return a promise settled by the next flush.
   *
   * Every inherited `searchXxx()` funnels through here, so single searches
   * issued inside one window coalesce and deduplicate just as an explicit
   * `batchSearch()` does.
   */
  protected override request<T = unknown>(
    endpoint: SearchEndpoint,
    params: SearchParams = {}
  ): Promise<SearchResult<T>> {
    return new Promise<SearchResult<T>>((resolve, reject) => {
      this.#pending.push({
        key: buildCacheKey(endpoint, params),
        endpoint,
        params,
        resolve: (value) => resolve(value as SearchResult<T>),
        reject,
      });
      this.#schedule();
    });
  }

  /**
   * Arm the window timer, if one is not already armed.
   *
   * The timer is only ever scheduled while `#pending` is non-empty, so an idle
   * client holds no handle and a process that constructs one exits immediately.
   */
  #schedule(): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#flush();
    }, this.#batchWindowMs);
  }

  /** Drain the queue: dedup, chunk, issue, settle. */
  async #flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    const queued = this.#pending;
    this.#pending = [];
    if (queued.length === 0) return;

    // Group identical requests so one HTTP call serves every caller that shares a key.
    const groups = new Map<string, PendingRequest[]>();
    for (const item of queued) {
      const key = this.#deduplicateRequests ? item.key : `${item.key}#${String(groups.size)}`;
      const existing = groups.get(key);
      if (existing) existing.push(item);
      else groups.set(key, [item]);
    }

    const distinct = [...groups.values()];
    // Parallel within a chunk, serial across chunks — this is what bounds concurrency.
    for (let i = 0; i < distinct.length; i += this.#maxBatchSize) {
      const chunk = distinct.slice(i, i + this.#maxBatchSize);
      const settled = await Promise.allSettled(
        chunk.map((group) => {
          const head = group[0];
          if (!head) throw new Error('empty dedup group');
          return super.request(head.endpoint, head.params);
        })
      );

      settled.forEach((outcome, index) => {
        const group = chunk[index];
        if (!group) return;
        for (const item of group) {
          // One failure settles only its own slots — never the whole batch.
          if (outcome.status === 'fulfilled') item.resolve(outcome.value);
          else item.reject(outcome.reason);
        }
      });
    }
  }

  /**
   * Issue many searches as one batch.
   *
   * The returned array is positionally aligned to `requests`, even under
   * deduplication, and never rejects: a failing slot carries `success: false`
   * and an `error` string.
   */
  async batchSearch<T = unknown>(requests: BatchSearchRequest[]): Promise<BatchSearchResult<T>[]> {
    const promises = requests.map(({ type, ...params }) => this.request<T>(type, params));
    // An explicit batch is already a batch — flush now rather than waiting out the window.
    await this.#flush();
    const settled = await Promise.allSettled(promises);
    return settled.map((outcome) =>
      outcome.status === 'fulfilled'
        ? { success: true, data: outcome.value }
        : { success: false, error: errorMessage(outcome.reason) }
    );
  }

  /** Whether coalescing is enabled (declared option; informational). */
  protected get batchingEnabled(): boolean {
    return this.#batchingEnabled;
  }

  /** Flush queued work and clear the window timer. */
  override async close(): Promise<void> {
    await this.#flush();
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    await super.close();
  }
}
