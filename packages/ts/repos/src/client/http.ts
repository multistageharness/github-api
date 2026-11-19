/**
 * @fileoverview HTTP client for GitHub API requests
 * @module http
 *
 * Rate limiting is delegated to `@internal/github-sdk-ratelimit`. This client
 * keeps its own retry for network faults and 5xx — rate-limit retry now belongs
 * to the limiter, which is the only layer that can bound and cancel a wait (R6).
 */

import {
  GitHubHttpError,
  GitHubNetworkError,
  GitHubRestClient,
  GitHubTimeoutError,
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  type GitHubProxyOptions,
} from '@internal/github-sdk-fetch-rest-api';
import {
  GitHubRateLimiter,
  isRateLimitError,
  type GitHubRateLimitError,
} from '@internal/github-sdk-ratelimit';
import { ErrorFactory, NetworkError, RateLimitError } from '../utils/errors.js';

/**
 * Rate limiting configuration.
 */
export interface RateLimitingConfig {
  enabled: boolean;
  padding: number;
}

/**
 * Full HTTP client configuration.
 */
export interface HTTPClientConfig {
  baseUrl: string;
  timeout: number;
  userAgent: string;
  retryAttempts: number;
  retryDelay: number;
  rateLimiting: RateLimitingConfig;
}

/**
 * Provider of an Authorization header value.
 */
export interface AuthManagerLike {
  getAuthHeader(): string;
}

/**
 * Options accepted by the HTTPClient constructor.
 */
export interface HTTPClientOptions extends Partial<HTTPClientConfig>, GitHubProxyOptions {
  authManager?: AuthManagerLike;
  verbose?: boolean;
}

/**
 * Per-request options.
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  // request bodies are dynamic — object (JSON), string, or array payloads
  body?: unknown;
}

/**
 * The shape {@link HTTPClient.buildRequestOptions} produces and
 * {@link HTTPClient.performRequest} consumes.
 *
 * Was `node-fetch`'s `RequestInit & { timeout }`. Named here instead, because
 * this package no longer declares an HTTP client to borrow a type from
 * (PRD 0002, R15) — the fields are the same ones it always carried.
 */
export interface BuiltRequestOptions {
  method?: string;
  headers: Record<string, string>;
  /** Serialized by the fetch layer: an object becomes JSON, a string goes verbatim. */
  body?: unknown;
  /** Per-request timeout in milliseconds. */
  timeout: number;
}

/**
 * Rate limit status snapshot.
 */
export interface RateLimitStatus {
  remaining: number | undefined;
  reset: Date | null;
  used: number | undefined;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HTTPClientConfig = {
  // One home for this value now, in `@internal/github-sdk-fetch-rest-api`
  // (PRD 0002, R5). The config key stays, so existing callers are unaffected.
  baseUrl: DEFAULT_BASE_URL,
  timeout: 10000,
  userAgent: '@github-api/repos/1.0.0',
  retryAttempts: 3,
  retryDelay: 1000,
  rateLimiting: {
    enabled: true,
    padding: 100 // ms padding between requests
  }
};

/**
 * HTTP client for GitHub API
 */
export class HTTPClient {
  config: HTTPClientConfig;
  authManager: AuthManagerLike | undefined;
  lastRequestTime: number;
  rateLimitRemaining: number | undefined;
  rateLimitReset: number | undefined;
  rateLimitUsed: number | undefined;

  /**
   * The shared limiter. One per client — layering a second limiter over this
   * one would double-count the same GitHub budget.
   */
  readonly rateLimiter: GitHubRateLimiter;

  /**
   * The transport (PRD 0002, R14).
   *
   * Configured with no auth and no media-type defaults of its own:
   * `buildRequestOptions` still composes this client's headers, including the
   * `authManager`'s `Authorization`, and is still public API.
   */
  readonly #rest: GitHubRestClient;

  constructor(options: HTTPClientOptions = {}) {
    // `rateLimiting` is merged field-by-field so `{ enabled: false }` no longer
    // silently drops `padding` the way a shallow spread did.
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      rateLimiting: { ...DEFAULT_CONFIG.rateLimiting, ...options.rateLimiting }
    };
    this.authManager = options.authManager;
    this.lastRequestTime = 0;

    this.rateLimiter = new GitHubRateLimiter({
      enabled: this.config.rateLimiting.enabled,
      // The existing `padding` key keeps working; it is a minimum interval in ms.
      minIntervalMs: this.config.rateLimiting.padding,
      // `retryAttempts` counts total attempts; the limiter counts replays.
      maxRetries: Math.max(0, this.config.retryAttempts - 1),
      // The `extractResponse` shim this package used to need is gone. The fetch
      // layer's governed task returns its own response contract — status,
      // headers *and* the parsed body — which is exactly what the limiter's
      // default extractor reads. GitHub's secondary-limit signal, which appears
      // only in the body, still reaches the limiter; it is now one integration
      // in the layer rather than one per consumer (PRD 0002, R10).
    });

    this.#rest = new GitHubRestClient({
      baseUrl: this.config.baseUrl,
      limiter: this.rateLimiter,
      // Omitted keys rather than `undefined` values, so an unset proxy option is
      // resolved from `GITHUB_PROXY`/`HTTPS_PROXY` while an explicit `null`
      // still forces a direct connection (PRD 0002, R4).
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });
  }

  /**
   * Make HTTP request
   */
  // Endpoint responses are dynamically shaped per GitHub API endpoint.
  async request(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    const url = this.buildUrl(endpoint);
    const requestOptions = this.buildRequestOptions(options);
    const method = options.method || 'GET';

    // Retry here covers network faults and 5xx only. Rate limits are waited out
    // and replayed inside the layer's limiter, under a bounded, cancellable
    // ceiling.
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // The layer builds the URL, applies the defaults, bounds the request
        // with a timeout, reads the body and governs the round-trip. What stays
        // here is this package's retry for network faults and 5xx (R14).
        const result = await this.#rest.request(
          `${method} ${url}`,
          {},
          {
            headers: requestOptions.headers as Record<string, string>,
            ...(requestOptions.body === undefined ? {} : { body: requestOptions.body }),
            timeoutMs: requestOptions.timeout,
          }
        );
        this.syncLegacyRateLimitFields();
        return result.data;
      } catch (error) {
        const translated = this.toRepoError(error);
        lastError = translated;

        if (!this.shouldRetry(translated, attempt)) {
          throw translated;
        }

        const delay = this.calculateRetryDelay(translated, attempt);
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Map the limiter's and the fetch layer's error contracts onto this package's
   * own, so adopting them does not change what callers catch (R11, R15, R14).
   */
  toRepoError(error: unknown): unknown {
    if (isRateLimitError(error)) {
      const limitError = error as GitHubRateLimitError;
      const mapped = new RateLimitError(
        limitError.message,
        limitError.resetAt === null ? null : limitError.resetAt.getTime(),
        this.rateLimitRemaining ?? null
      );
      (mapped as { cause?: unknown }).cause = limitError;
      return mapped;
    }

    // GitHub answered with an error status. `ErrorFactory` picks this package's
    // own class from the status and body, exactly as it did when this file read
    // the response itself.
    if (error instanceof GitHubHttpError) {
      return ErrorFactory.fromResponse(
        error.response,
        error.data as Record<string, unknown> | null
      );
    }

    // A timeout was a `NetworkError` with this wording before the layer existed,
    // and `shouldRetry` treats `NetworkError` as retryable — keep both.
    if (error instanceof GitHubTimeoutError) {
      return new NetworkError(`Request timeout after ${error.timeoutMs}ms`);
    }

    if (error instanceof GitHubNetworkError) {
      return ErrorFactory.fromNetworkError(
        ((error as { cause?: unknown }).cause as Error) ?? error,
        error.url
      );
    }

    return error;
  }

  /**
   * Build full URL from endpoint
   */
  buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.config.baseUrl}${cleanEndpoint}`;
  }

  /**
   * Build request options
   */
  buildRequestOptions(options: RequestOptions = {}): BuiltRequestOptions {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': this.config.userAgent,
      'X-GitHub-Api-Version': DEFAULT_API_VERSION,
      ...options.headers
    };

    const method = options.method || 'GET';

    const requestOptions: BuiltRequestOptions = {
      method,
      headers,
      timeout: options.timeout || this.config.timeout
    };

    // Add authentication
    if (this.authManager) {
      headers['Authorization'] = this.authManager.getAuthHeader();
    }

    // Add body for POST/PUT/PATCH requests
    if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      if (typeof options.body === 'object') {
        requestOptions.body = JSON.stringify(options.body);
        headers['Content-Type'] = 'application/json';
      } else {
        requestOptions.body = options.body as string;
      }
    }

    return requestOptions;
  }

  /**
   * Perform the actual HTTP request.
   *
   * Issued through the fetch layer, with the body left **unread** so this
   * method keeps returning a `Response` whose body `readBody` can still consume
   * — the contract `head()` and any external caller already depend on (R14).
   * `request()` does not go through here: it needs the parsed body, both for
   * its result and so the limiter can see GitHub's secondary-limit wording.
   */
  async performRequest(url: string, options: BuiltRequestOptions): Promise<Response> {
    try {
      const result = await this.#rest.request(
        `${options.method ?? 'GET'} ${url}`,
        {},
        {
          headers: options.headers,
          ...(options.body === undefined ? {} : { body: options.body }),
          timeoutMs: options.timeout,
          responseType: 'stream',
        }
      );
      // Mirror the limiter's view onto the legacy public fields so anything
      // reading them directly keeps working.
      this.syncLegacyRateLimitFields();
      return result.response;
    } catch (error) {
      // A non-2xx used to arrive here as an ordinary `Response` for the caller
      // to inspect, so it still does.
      if (error instanceof GitHubHttpError) {
        this.syncLegacyRateLimitFields();
        return error.response;
      }
      if (error instanceof GitHubTimeoutError) {
        throw new NetworkError(`Request timeout after ${options.timeout}ms`);
      }
      if ((error as { name?: string }).name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${options.timeout}ms`);
      }
      throw ErrorFactory.fromNetworkError(error as Error, url);
    }
  }

  /**
   * Handle HTTP response
   */
  // Parsed body shape is endpoint-dependent (JSON object/array, string, or null).
  async handleResponse(response: Response): Promise<unknown> {
    return this.finishResponse(response, await this.readBody(response));
  }

  /**
   * Read and parse a response body. Split out of `handleResponse` because the
   * body must be consumed inside the governed task — a `Response` body can only
   * be read once, and the limiter needs to see it.
   */
  async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        // Response claimed to be JSON but wasn't parseable
        return await response.text();
      }
    }
    if (response.headers.get('content-length') !== '0') {
      return await response.text();
    }
    return null;
  }

  /**
   * Turn an already-read response into a result, or into this package's error.
   */
  finishResponse(response: Response, body: unknown): unknown {
    // Rate limit state was already recorded by the limiter, on this response and
    // on every error response before it (R1).
    this.syncLegacyRateLimitFields();

    // Handle error responses
    if (!response.ok) {
      throw ErrorFactory.fromResponse(response, body as Record<string, unknown> | null);
    }

    return body;
  }

  /**
   * Apply rate limiting.
   *
   * Superseded by the limiter, which paces inside `execute` against the actual
   * per-resource budget rather than a flat interval. Retained so an external
   * caller invoking it directly still compiles; it no longer sleeps, because
   * doing so here would pace the same request twice.
   */
  async applyRateLimit(): Promise<void> {
    this.lastRequestTime = Date.now();
  }

  /**
   * Update rate limit information from response headers
   */
  updateRateLimitInfo(response: Response): void {
    this.rateLimiter.observe({ status: response.status, headers: response.headers });
    this.syncLegacyRateLimitFields();
  }

  /**
   * Copy the limiter's `core` budget onto this class's long-standing public
   * fields. They are part of the published surface, so they keep being written.
   */
  private syncLegacyRateLimitFields(): void {
    const status = this.rateLimiter.getStatus('core');
    this.rateLimitRemaining = status.remaining;
    this.rateLimitReset = status.reset;
    this.rateLimitUsed = status.used;
  }

  /**
   * Check if request should be retried.
   *
   * Rate limits are deliberately **not** retried here: the limiter has already
   * waited them out and replayed the request up to its own bound. Retrying again
   * would multiply the attempts and, via `calculateRetryDelay`, sleep for the
   * whole reset window — the unbounded wait R6 forbids.
   */
  shouldRetry(error: unknown, attempt: number): boolean {
    // Don't retry on last attempt
    if (attempt >= this.config.retryAttempts) {
      return false;
    }

    // Rate limits belong to the limiter.
    if (error instanceof RateLimitError || isRateLimitError(error)) {
      return false;
    }

    // Retry on network errors
    if (error instanceof NetworkError) {
      return true;
    }

    // Retry on 5xx errors
    if ((error as { statusCode?: number }).statusCode! >= 500) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay.
   *
   * Bounded at the limiter's own wait ceiling: a reset an hour out must never
   * become an hour-long sleep (R6).
   */
  calculateRetryDelay(error: unknown, attempt: number): number {
    const ceiling = this.rateLimiter.getConfig().maxWaitMs;

    // Rate limit errors have specific reset times
    if (error instanceof RateLimitError && error.resetTime) {
      return Math.min(ceiling, error.getTimeUntilReset());
    }

    // Exponential backoff for other errors
    return Math.min(ceiling, this.config.retryDelay * Math.pow(2, attempt - 1));
  }

  /**
   * Sleep utility
   */
  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convenience methods for different HTTP verbs
   */
  async get(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<unknown> {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  async put(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<unknown> {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  async patch(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<unknown> {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  async delete(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  async head(endpoint: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(endpoint);
    const requestOptions = this.buildRequestOptions({ ...options, method: 'HEAD' });

    let response: Response;
    try {
      // `performRequest` is already governed — it goes through the fetch layer,
      // which holds this client's limiter. Wrapping it in a second `execute`
      // would take a concurrency slot and pace the same request twice (R10).
      response = await this.performRequest(url, requestOptions);
    } catch (error) {
      throw this.toRepoError(error);
    }

    this.syncLegacyRateLimitFields();

    if (!response.ok) {
      const body = null; // HEAD requests don't have bodies
      throw ErrorFactory.fromResponse(response, body);
    }

    // Return response object for HEAD requests so headers can be accessed
    return response;
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    const status = this.rateLimiter.getStatus('core');
    return {
      remaining: status.remaining,
      reset: status.resetAt,
      used: status.used
    };
  }

  /**
   * Check if we're approaching rate limit
   */
  isApproachingRateLimit(threshold = 100): boolean {
    return this.rateLimiter.isApproachingLimit(threshold, 'core');
  }
}

/**
 * Create HTTP client with default configuration
 */
export function createHTTPClient(options: HTTPClientOptions = {}): HTTPClient {
  return new HTTPClient(options);
}
