/**
 * HTTP Client for GitHub Activity API
 * @module client/http
 *
 * The transport is `@internal/github-sdk-fetch-rest-api` — the platform's
 * global `fetch` — rather than `axios` (PRD 0002, R1, D2). This was the only
 * `axios` client in the repository, and the one migration scheduled last
 * because it was the one most likely to surface a missing capability.
 *
 * What `axios` was actually providing here was four things: an instance with
 * defaults, automatic JSON handling, an `AxiosResponse` shape whose `headers`
 * is a lowercased plain object, and an error-converting interceptor. The first
 * three are the fetch layer's own contract plus the small adapter below; the
 * fourth is now an ordinary `catch`, which is strictly better — the interceptor
 * converted a failure *before* the limiter could read the budget off it, and
 * needed `#withResponse` to put it back.
 */

import {
  GitHubHttpError,
  GitHubRestClient,
  DEFAULT_BASE_URL,
  type GitHubProxyOptions,
  type RequestOptions as FetchRequestOptions,
} from '@internal/github-sdk-fetch-rest-api';
import {
  GitHubRateLimiter,
  isRateLimitError,
  type GitHubRateLimitError,
} from '@internal/github-sdk-ratelimit';
import { parseLinkHeader } from '../utils/pagination.js';
import type { PageResult } from '../utils/pagination.js';
import { APIError, RateLimitError } from '../utils/errors.js';
import type { ValidationErrorDetail } from '../utils/errors.js';
import type { PageLinks, RateLimit } from '../models/types.js';

/**
 * Configuration options for the HTTP client.
 */
export interface HttpClientConfig extends GitHubProxyOptions {
  baseURL?: string;
  token?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Result of building pagination + rate-limit metadata from a response.
 */
export interface ResponseMeta {
  pagination?: PageLinks | null;
  rateLimit: RateLimit;
  /** GitHub's `X-Poll-Interval`, in ms, when the response carried one. */
  pollInterval?: number;
}

/**
 * Per-request options accepted by {@link ActivityTransport}.
 *
 * The `axios` request config this replaces carried far more than this client
 * ever used; these are the two fields it did.
 */
export interface ActivityRequestConfig {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * A completed request, in the shape this package's `buildMeta` and its API
 * modules already read.
 *
 * `headers` is a **plain lowercased object**, not a `Headers`, because that is
 * what `AxiosResponse` gave and what `buildMeta`, `stars.ts` and `auth.ts`
 * index into (`headers['x-oauth-scopes']`, `headers.link`). Preserving it is
 * what keeps this a transport swap rather than an API change (R14).
 */
export interface ActivityResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * The `axios`-shaped surface `HttpClient.client` exposes.
 *
 * `HttpClient.client` was typed `AxiosInstance`. It cannot stay that, because
 * `axios` is gone; it is narrowed to the four members this package actually
 * used — the verb methods and `defaults.headers.common`. Recorded as a
 * deviation rather than done silently (R14).
 */
export interface ActivityTransport {
  defaults: {
    baseURL: string;
    timeout: number;
    headers: { common: Record<string, string> };
  };
  get<T = unknown>(path: string, config?: ActivityRequestConfig): Promise<ActivityResponse<T>>;
  post<T = unknown>(
    path: string,
    data?: unknown,
    config?: ActivityRequestConfig,
  ): Promise<ActivityResponse<T>>;
  put<T = unknown>(
    path: string,
    data?: unknown,
    config?: ActivityRequestConfig,
  ): Promise<ActivityResponse<T>>;
  patch<T = unknown>(
    path: string,
    data?: unknown,
    config?: ActivityRequestConfig,
  ): Promise<ActivityResponse<T>>;
  delete<T = unknown>(path: string, config?: ActivityRequestConfig): Promise<ActivityResponse<T>>;
}

/**
 * HTTP Client class for making API requests
 */
export class HttpClient {
  /**
   * The transport, in the `axios`-shaped surface this package's API modules
   * and `auth.ts` already call (`http.client.get(path, { params, headers })`).
   */
  client: ActivityTransport;

  /**
   * The shared limiter. One per client — layering a second over it would
   * double-count the same GitHub budget.
   */
  readonly rateLimiter: GitHubRateLimiter;

  readonly #rest: GitHubRestClient;
  readonly #defaults: ActivityTransport['defaults'];

  constructor(config: HttpClientConfig = {}) {
    this.rateLimiter = new GitHubRateLimiter();

    this.#defaults = {
      // One home for this value now (R5). `ActivityClient` no longer sets the
      // same default a second time.
      baseURL: config.baseURL || DEFAULT_BASE_URL,
      timeout: config.timeout || 30000,
      headers: {
        common: {
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'GitHub-Activity-SDK/1.0.0',
          ...config.headers,
        },
      },
    };

    this.#rest = new GitHubRestClient({
      baseUrl: this.#defaults.baseURL,
      timeoutMs: this.#defaults.timeout,
      limiter: this.rateLimiter,
      // Omitted keys rather than `undefined` values: an unset proxy is resolved
      // from the environment, an explicit `null` forces direct (PRD 0002, R4).
      ...(config.proxy === undefined ? {} : { proxy: config.proxy }),
      ...(config.proxyBypass === undefined ? {} : { proxyBypass: config.proxyBypass }),
    });

    this.client = this.#buildTransport();

    // Set authorization header if token provided
    if (config.token) {
      this.setAuthToken(config.token);
    }
  }

  /**
   * The `axios`-shaped adapter over the fetch layer.
   *
   * Every verb funnels into one governed request. `defaults.headers.common` is
   * read at call time, so `setAuthToken` keeps working exactly as it did
   * against `axios`'s own defaults.
   */
  #buildTransport(): ActivityTransport {
    const send = async <T>(
      method: string,
      path: string,
      data: unknown,
      config: ActivityRequestConfig | undefined,
    ): Promise<ActivityResponse<T>> => {
      // Was a request interceptor. Kept verbatim, including the env var it
      // reads — reporting is this package's, not the layer's (N7).
      if (process.env['DEBUG'] === 'true') {
        console.log(`[HTTP] ${method} ${path}`);
      }

      const options: FetchRequestOptions = {
        headers: { ...this.#defaults.headers.common, ...config?.headers },
        ...(data === undefined ? {} : { body: data }),
      };

      try {
        const result = await this.#rest.request<T>(
          `${method} ${path}`,
          config?.params ?? {},
          options,
        );
        return {
          data: result.data,
          status: result.status,
          statusText: result.response.statusText,
          headers: Object.fromEntries(result.headers.entries()),
        };
      } catch (error) {
        // The limiter has already seen the response and read the budget off it
        // — including the error responses, which is where it matters most.
        // Converting to this package's taxonomy happens here, *after* that,
        // rather than in an interceptor that ran before it.
        await this.handleError(error);
        /* c8 ignore next -- handleError always throws */
        throw error;
      }
    };

    return {
      defaults: this.#defaults,
      get: (path, config) => send('GET', path, undefined, config),
      post: (path, data, config) => send('POST', path, data ?? {}, config),
      put: (path, data, config) => send('PUT', path, data ?? {}, config),
      patch: (path, data, config) => send('PATCH', path, data ?? {}, config),
      delete: (path, config) => send('DELETE', path, undefined, config),
    };
  }

  /**
   * Build pagination + rate-limit metadata from a response's headers.
   */
  buildMeta(response: ActivityResponse): ResponseMeta {
    const headers = response.headers;
    const meta: ResponseMeta = {
      rateLimit: {
        limit: parseInt(headers['x-ratelimit-limit'] as string) || 0,
        remaining: parseInt(headers['x-ratelimit-remaining'] as string) || 0,
        reset: parseInt(headers['x-ratelimit-reset'] as string) || 0,
        used: parseInt(headers['x-ratelimit-used'] as string) || 0,
        resource: headers['x-ratelimit-resource'] || 'core'
      }
    };

    if (headers['link']) {
      meta.pagination = parseLinkHeader(headers['link']);
    }

    const pollSeconds = parseInt(headers['x-poll-interval'] as string);
    if (pollSeconds > 0) {
      meta.pollInterval = pollSeconds * 1000;
    }

    return meta;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    if (token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.client.defaults.headers.common['Authorization'];
    }
  }

  /**
   * Handle API errors
   */
  async handleError(error: unknown): Promise<never> {
    if (error instanceof GitHubHttpError) {
      const status = error.status;
      const headers = Object.fromEntries(error.headers.entries());
      const data = error.data;
      // data is the parsed error body from GitHub; shape is dynamic.
      const body = (data ?? {}) as {
        message?: string;
        errors?: ValidationErrorDetail[];
        documentation_url?: string;
      };

      // Classified from what GitHub actually sent. The old check was
      // `403 && remaining === '0'`, which missed 429 entirely and could not tell
      // a secondary limit from budget exhaustion (R3, R5).
      const verdict = this.rateLimiter.classify(
        { status, headers, data },
        { url: error.url },
      );

      if (verdict.isRateLimit) {
        // `RateLimitError.resetTime` is a required `number`, so an unknown reset
        // — which a secondary limit routinely has — becomes 0 rather than
        // widening a published field to `number | null` (R15).
        const resetTime = verdict.resetAtMs ?? 0;
        const retryAfter =
          verdict.retryAfterMs ?? (resetTime === 0 ? 0 : resetTime - Date.now());

        const rateLimitError = new RateLimitError(
          resetTime === 0
            ? `Rate limit exceeded (${verdict.kind}) on ${verdict.resource}`
            : `Rate limit exceeded. Resets at ${new Date(resetTime).toISOString()}`,
          retryAfter,
          resetTime,
        );
        throw this.#withResponse(rateLimitError, status, headers, data);
      }

      // Other API errors
      const apiError = new APIError(
        body.message || `Request failed with status ${status}`,
        status,
        body.errors || [],
        body.documentation_url ?? null
      );
      throw this.#withResponse(apiError, status, headers, data);
    }

    // A rate limit the limiter could not wait out, mapped back onto this
    // package's own contract so callers keep catching what they always caught
    // (R15).
    if (isRateLimitError(error)) {
      const limitError = error as GitHubRateLimitError;
      const resetTime = limitError.resetAt === null ? 0 : limitError.resetAt.getTime();
      throw new RateLimitError(
        limitError.message,
        limitError.retryAfterMs ?? (resetTime === 0 ? 0 : resetTime - Date.now()),
        resetTime,
      );
    }

    // Network or other errors
    throw error;
  }

  /**
   * Re-attach the originating response to a converted error, so a caller that
   * needs GitHub's own body can still reach it.
   */
  #withResponse<E extends Error>(
    error: E,
    status: number,
    headers: unknown,
    data: unknown,
  ): E {
    (error as unknown as { response?: unknown }).response = { status, headers, data };
    return error;
  }

  /**
   * Current rate-limit budget per resource, straight from GitHub's headers.
   *
   * Complements the per-response `rateLimit` metadata this client already
   * returns: that reports the response you just made, this reports the budget
   * as it stands, for every resource, without issuing a request (R10).
   */
  getRateLimitStatus(resource = 'core'): ReturnType<GitHubRateLimiter['getStatus']> {
    return this.rateLimiter.getStatus(resource);
  }

  /**
   * Make GET request
   */
  async get<T = unknown>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<PageResult<T>> {
    const response = await this.client.get<T[]>(path, { params });
    const meta = this.buildMeta(response);
    return {
      data: response.data,
      pagination: meta.pagination,
      rateLimit: meta.rateLimit,
      ...(meta.pollInterval === undefined ? {} : { pollInterval: meta.pollInterval })
    };
  }

  /**
   * Make POST request
   */
  async post<T = unknown>(
    path: string,
    data: Record<string, unknown> = {},
    params: Record<string, unknown> = {}
  ): Promise<{ data: T; rateLimit: RateLimit }> {
    const response = await this.client.post<T>(path, data, { params });
    const meta = this.buildMeta(response);
    return {
      data: response.data,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * Make PUT request
   */
  async put<T = unknown>(
    path: string,
    data: Record<string, unknown> = {},
    params: Record<string, unknown> = {}
  ): Promise<{ data: T; rateLimit: RateLimit }> {
    const response = await this.client.put<T>(path, data, { params });
    const meta = this.buildMeta(response);
    return {
      data: response.data,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * Make PATCH request
   */
  async patch<T = unknown>(
    path: string,
    data: Record<string, unknown> = {},
    params: Record<string, unknown> = {}
  ): Promise<{ data: T; rateLimit: RateLimit }> {
    const response = await this.client.patch<T>(path, data, { params });
    const meta = this.buildMeta(response);
    return {
      data: response.data,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * Make DELETE request
   */
  async delete<T = unknown>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<{ data: T; rateLimit: RateLimit }> {
    const response = await this.client.delete<T>(path, { params });
    const meta = this.buildMeta(response);
    return {
      data: response.data,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * Get all pages of a paginated endpoint.
   *
   * Follows the `next` URL GitHub returned rather than incrementing a page
   * counter. Rebuilding `?page=N` is what this method used to do, and GitHub's
   * cursor endpoints do not accept a reconstructed one (PRD 0002, R6).
   */
  async *getAllPages<T = unknown>(
    path: string,
    params: Record<string, unknown> = {},
    maxPages: number = Infinity
  ): AsyncGenerator<T> {
    let pagesRetrieved = 0;
    let nextPath: string | null = path;
    let nextParams: Record<string, unknown> = params;

    while (pagesRetrieved < maxPages && nextPath !== null) {
      const response: PageResult<T> = await this.get<T>(nextPath, nextParams);

      // Yield items from current page
      for (const item of response.data) {
        yield item;
      }

      pagesRetrieved++;

      // Check if there are more pages
      const next = response.pagination?.['next'];
      if (typeof next !== 'string' || pagesRetrieved >= maxPages) {
        break;
      }

      // The URL GitHub returned already carries the query it wants replayed.
      nextPath = next;
      nextParams = {};
    }
  }

  /**
   * Fetch all items from a paginated endpoint
   */
  async fetchAllPages<T = unknown>(
    path: string,
    params: Record<string, unknown> = {},
    maxPages: number = Infinity
  ): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this.getAllPages<T>(path, params, maxPages)) {
      items.push(item);
    }
    return items;
  }
}

export default HttpClient;
