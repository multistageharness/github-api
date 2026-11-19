/**
 * @fileoverview The production tier and the package's default export.
 *
 * Extends `RateLimitedSearchClient` (and thus `BaseSearchClient`), adds
 * `multiEndpointSearch()` and `getHealth()`, and ships the
 * `createSafeSearchClient()` factory imported by `src/index.ts` and `src/cli.ts`.
 *
 * **Tier-graph consequence, by design:** `CachedSearchClient` and
 * `BatchedSearchClient` extend `BaseSearchClient` on independent branches. A
 * `SafeSearchClient` therefore has **no** `getCacheStats()` and **no**
 * `batchSearch()`, even though `SafeSearchClientOptions` accepts `cacheEnabled`
 * and `batchingEnabled`. That is the documented design (`INTERFACE.md` tier
 * hierarchy) and `tests/module-structure.test.ts` pins it. Do not "fix" it by
 * re-parenting.
 *
 * @module lib/SafeSearchClient
 */

import { RateLimitedSearchClient } from './RateLimitedSearchClient.js';
import type { RateLimitedSearchClientOptions } from './RateLimitedSearchClient.js';
import type { SearchParams, SearchResult } from './BaseSearchClient.js';
import { ENDPOINT_METHODS } from '../endpoints/index.js';
import type { SearchEndpoint } from '../endpoints/index.js';

/** Recent-error count at which health reports `degraded`. */
export const DEFAULT_FAILURE_THRESHOLD = 5;

export interface SafeSearchClientOptions extends RateLimitedSearchClientOptions {
  /** Recent-error count at which `getHealth()` reports `degraded`. Default `5`. */
  failureThreshold?: number;
  /** Declared; **no enforcement logic in source** (`INTERFACE.md`). */
  circuitBreakerEnabled?: boolean;
  /** Declared; no enforcement. */
  circuitTimeout?: number;
  /** Declared; no enforcement. */
  degradationEnabled?: boolean;
  /** Declared; no enforcement. */
  autoRecovery?: boolean;
  /** Declared; no enforcement. */
  monitoringEnabled?: boolean;
  /** Declared; no enforcement. Caching lives on the independent `Cached` branch. */
  cacheEnabled?: boolean;
  /** Declared; no enforcement. */
  cacheStrategy?: 'aggressive' | 'moderate' | 'conservative';
  /** Declared; no enforcement. Batching lives on the independent `Batched` branch. */
  batchingEnabled?: boolean;
}

/** Per-endpoint outcome of a `multiEndpointSearch()` fan-out. */
export interface MultiEndpointOutcome<T = unknown> {
  success: boolean;
  data?: SearchResult<T>;
  error?: string;
}

/** Snapshot returned by `getHealth()`. */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  degradationLevel: number;
  recentErrors: number;
}

/** Render an unknown rejection reason as a message string. */
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export class SafeSearchClient extends RateLimitedSearchClient {
  #recentErrors = 0;
  readonly #failureThreshold: number;

  /**
   * Declared-but-unenforced safe-tier options, stored verbatim.
   *
   * `INTERFACE.md` is candid that these carry "no enforcement logic in source".
   * They are accepted without throwing and drive nothing. Inventing
   * circuit-breaker semantics would diverge from the contract the rest of the
   * monorepo was written against.
   */
  readonly #declaredOptions: Readonly<Omit<SafeSearchClientOptions, keyof RateLimitedSearchClientOptions | 'failureThreshold'>>;

  constructor(options: SafeSearchClientOptions = {}) {
    super(options);
    this.#failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.#declaredOptions = Object.freeze({
      circuitBreakerEnabled: options.circuitBreakerEnabled,
      circuitTimeout: options.circuitTimeout,
      degradationEnabled: options.degradationEnabled,
      autoRecovery: options.autoRecovery,
      monitoringEnabled: options.monitoringEnabled,
      cacheEnabled: options.cacheEnabled,
      cacheStrategy: options.cacheStrategy,
      batchingEnabled: options.batchingEnabled,
    });
  }

  protected override async request<T = unknown>(
    endpoint: SearchEndpoint,
    params: SearchParams = {}
  ): Promise<SearchResult<T>> {
    try {
      return await super.request<T>(endpoint, params);
    } catch (error) {
      this.#recentErrors += 1;
      throw error;
    }
  }

  /**
   * Run one query across several search types in parallel.
   *
   * `Promise.allSettled`, not `Promise.all`: `code` search 403s without a token
   * while `repositories` succeeds, and a single rejection must not discard six
   * good results.
   *
   * An unknown endpoint name is captured as a failed slot rather than thrown —
   * and does **not** bump `recentErrors`, because no request was ever issued.
   * `recentErrors` measures service health, not caller typos.
   */
  async multiEndpointSearch<T = unknown>(
    query: string,
    endpoints: string[],
    options: SearchParams = {}
  ): Promise<Record<string, MultiEndpointOutcome<T>>> {
    const results: Record<string, MultiEndpointOutcome<T>> = {};
    const runnable: SearchEndpoint[] = [];

    for (const endpoint of endpoints) {
      if (Object.prototype.hasOwnProperty.call(ENDPOINT_METHODS, endpoint)) {
        runnable.push(endpoint as SearchEndpoint);
      } else {
        results[endpoint] = { success: false, error: `Unknown endpoint: ${endpoint}` };
      }
    }

    // Dispatch through ENDPOINT_METHODS — never a hand-written switch.
    const invoke = (endpoint: SearchEndpoint): Promise<SearchResult<T>> => {
      const method = ENDPOINT_METHODS[endpoint];
      const dispatch = this as unknown as Record<
        string,
        (params: SearchParams) => Promise<SearchResult<T>>
      >;
      return dispatch[method]!.call(this, { ...options, q: query });
    };

    const settled = await Promise.allSettled(runnable.map((endpoint) => invoke(endpoint)));

    settled.forEach((outcome, index) => {
      const endpoint = runnable[index];
      if (!endpoint) return;
      results[endpoint] =
        outcome.status === 'fulfilled'
          ? { success: true, data: outcome.value }
          : { success: false, error: errorMessage(outcome.reason) };
    });

    return results;
  }

  /**
   * Derive a coarse health signal from the recent-error count.
   *
   * `INTERFACE.md` names the three statuses and pins only the `degraded`
   * threshold (`failureThreshold`, default `5`). **Plan decision:** `critical`
   * is reported at `2 × failureThreshold` — chosen, not documented upstream.
   *
   * `failureThreshold: 0` is guarded so `degradationLevel` never divides by zero.
   */
  getHealth(): HealthStatus {
    const errors = this.#recentErrors;
    const threshold = this.#failureThreshold;
    const status: HealthStatus['status'] =
      errors >= threshold * 2 ? 'critical' : errors >= threshold ? 'degraded' : 'healthy';
    return {
      status,
      degradationLevel: threshold <= 0 ? 0 : Math.min(1, errors / (threshold * 2)),
      recentErrors: errors,
    };
  }

  /** Read-back of the declared-but-unenforced option surface. */
  protected get declaredOptions(): Readonly<
    Omit<SafeSearchClientOptions, keyof RateLimitedSearchClientOptions | 'failureThreshold'>
  > {
    return this.#declaredOptions;
  }
}

/**
 * Factory for the production client. Imported by `src/index.ts:13`,
 * `src/index.ts:25` (dynamic), `src/cli.ts:12`, and the clack CLI.
 */
export function createSafeSearchClient(options: SafeSearchClientOptions = {}): SafeSearchClient {
  return new SafeSearchClient(options);
}
