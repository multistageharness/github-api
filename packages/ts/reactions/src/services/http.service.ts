/**
 * HTTP client service for GitHub API requests
 * @module services/http
 */

import type { Logger } from 'winston';
import {
  GitHubHttpError,
  GitHubRestClient,
  GitHubTimeoutError,
  parseLinkHeader,
} from '@internal/github-sdk-fetch-rest-api';
import {
  GitHubRateLimiter,
  isRateLimitError,
  type GitHubRateLimitError,
} from '@internal/github-sdk-ratelimit';
import { ErrorHandler, TimeoutError, RateLimitError } from '../core/errors.js';
import type { Config } from '../core/types.js';

/**
 * Options accepted by {@link HttpService.request}.
 */
export interface HttpRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  // request bodies are dynamic — object (JSON) payloads serialized by the caller
  body?: unknown;
  timeout?: number;
}

/**
 * Options accepted by the convenience verb helpers.
 */
export interface HttpVerbOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * Normalized response returned by {@link HttpService.request}.
 */
export interface HttpResponse {
  // response payloads are endpoint-dependent (JSON object/array or string)
  data: unknown;
  status: number;
  headers: Record<string, string>;
  url: string;
}

/**
 * Pagination info parsed from a Link header.
 */
export interface ParsedPagination {
  totalPages?: number;
  nextUrl?: string;
  prevUrl?: string;
  firstUrl?: string;
  lastUrl?: string;
  [key: string]: number | string | undefined;
}

export class HttpService {
  #config: Config;
  #logger: Logger;
  #baseHeaders: Record<string, string>;
  readonly #rateLimiter: GitHubRateLimiter;
  /** The transport (PRD 0002, R14). */
  readonly #rest: GitHubRestClient;

  constructor(config: Config, logger: Logger) {
    this.#config = config;
    this.#logger = logger;
    // `Authorization` is no longer built here: the layer applies it, from one
    // code path, with the `token` scheme this package has always used
    // (PRD 0002, R4).
    this.#baseHeaders = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': '@github-api/reactions',
    };

    this.#rateLimiter = new GitHubRateLimiter({
      maxRetries: config.retries ?? 0,
    });

    // Built with no auth or media-type defaults of its own: `#baseHeaders` is
    // still this class's, still sent on every request, and still carries the
    // `token` scheme this package has always used. Adoption changes the
    // transport, not the wire (R14).
    this.#rest = new GitHubRestClient({
      baseUrl: config.baseUrl,
      // This package has always sent `token`, not `Bearer`. The scheme is a
      // layer option precisely so adoption need not change the wire (R4).
      authScheme: 'token',
      ...(config.token ? { token: config.token } : {}),
      limiter: this.#rateLimiter,
      // Omitted keys rather than `undefined` values: an unset proxy is resolved
      // from the environment, an explicit `null` forces direct (PRD 0002, R4).
      ...(config.proxy === undefined ? {} : { proxy: config.proxy }),
      ...(config.proxyBypass === undefined ? {} : { proxyBypass: config.proxyBypass }),
    });

    // Reporting stays with the consumer; the package itself never prints (N9).
    this.#rateLimiter.on('wait', ({ resource, waitMs, kind }) => {
      this.#logger.warn(`${kind} rate limit on ${resource}, waiting ${waitMs}ms`);
    });
  }

  /**
   * Current rate-limit budget as GitHub last reported it, per resource.
   */
  getRateLimitStatus(resource = 'core'): ReturnType<GitHubRateLimiter['getStatus']> {
    return this.#rateLimiter.getStatus(resource);
  }

  /**
   * Make an HTTP request
   */
  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const { method, url, headers = {}, body, timeout = this.#config.timeout } = options;

    const fullUrl = url.startsWith('http') ? url : `${this.#config.baseUrl}${url}`;
    const upperMethod = method.toUpperCase();

    this.#logger.debug(`${upperMethod} ${fullUrl}`, { body });

    let attempt = 0;
    const maxAttempts = (this.#config.retries ?? 0) + 1;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        // The limiter owns rate limiting for both signals GitHub uses — 403
        // with `x-ratelimit-remaining: 0` as well as 429. This branch used to
        // check 429 only, so the far more common 403 case fell through to a
        // generic error and was never waited out (R3). Its wait is now bounded
        // and cancellable, where the old one slept the whole reset window (R6).
        //
        // The transport, the timeout and the body handling are the fetch
        // layer's now; what stays here is this package's retry for network
        // faults, which is deliberately not the layer's business (R14).
        const result = await this.#rest.request(
          `${upperMethod} ${fullUrl}`,
          {},
          {
            headers: { ...this.#baseHeaders, ...headers },
            ...(body ? { body } : {}),
            timeoutMs: timeout ?? 30000,
          },
        );

        const response: HttpResponse = {
          data: result.data,
          status: result.status,
          headers: Object.fromEntries(result.headers.entries()),
          url: fullUrl,
        };

        this.#logger.debug(`Response ${result.status}`, { url: fullUrl });

        return response;

      } catch (error) {
        // The limiter has already waited and replayed up to its own bound, so
        // this is terminal: retrying here would multiply the attempts and, with
        // `isRetryable` treating RATE_LIMIT_ERROR as retryable, re-enter the
        // very loop the limiter exists to replace.
        if (isRateLimitError(error)) {
          throw this.#toReactionsRateLimitError(error as GitHubRateLimitError);
        }

        if (error instanceof GitHubTimeoutError || (error as { name?: string }).name === 'AbortError') {
          const timeoutError = new TimeoutError(timeout ?? 30000);
          if (attempt < maxAttempts && ErrorHandler.isRetryable(timeoutError)) {
            this.#logger.warn(`Request timeout, retrying (${attempt}/${maxAttempts})`);
            continue;
          }
          throw timeoutError;
        }

        // Re-shaped into the `{ response: { status, data, headers } }` form
        // `ErrorHandler` reads, which is what this file used to build by hand.
        const handledError = ErrorHandler.handle(asLegacyHttpError(error));

        if (attempt < maxAttempts && ErrorHandler.isRetryable(handledError)) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
          this.#logger.warn(`Request failed, retrying in ${delay}ms (${attempt}/${maxAttempts}): ${handledError.message}`);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw handledError;
      }
    }

    // Unreachable: the loop always returns or throws, but TS needs a terminal.
    throw new TimeoutError(timeout ?? 30000);
  }

  /**
   * Map the limiter's error contract onto this package's own, so adopting it
   * does not change what callers catch (R11, R15).
   *
   * `RateLimitError` takes a reset time in epoch milliseconds. A secondary limit has
   * no reset window at all, so the advised wait is projected onto one rather
   * than reported as `NaN` the way `parseInt(… ?? '')` used to.
   */
  #toReactionsRateLimitError(error: GitHubRateLimitError): RateLimitError {
    const resetMs =
      error.resetAt !== null
        ? error.resetAt.getTime()
        : Date.now() + (error.retryAfterMs ?? 0);

    const mapped = new RateLimitError(resetMs);
    (mapped as { cause?: unknown }).cause = error;
    return mapped;
  }

  /**
   * Make a GET request
   */
  async get(url: string, options: HttpVerbOptions = {}): Promise<HttpResponse> {
    return this.request({ method: 'GET', url, ...options });
  }

  /**
   * Make a POST request
   */
  async post(url: string, body?: unknown, options: HttpVerbOptions = {}): Promise<HttpResponse> {
    return this.request({ method: 'POST', url, body, ...options });
  }

  /**
   * Make a DELETE request
   */
  async delete(url: string, options: HttpVerbOptions = {}): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', url, ...options });
  }

  /**
   * Parse pagination info from Link header.
   *
   * The `Link` parsing itself is the fetch layer's now (R6); what stays here is
   * this package's own output shape — `nextUrl`/`lastUrl` keys and the derived
   * `totalPages` — which is public API and unchanged.
   */
  parsePagination(linkHeader?: string | null): ParsedPagination {
    const pagination: ParsedPagination = {};

    for (const [rel, url] of Object.entries(parseLinkHeader(linkHeader))) {
      pagination[`${rel}Url`] = url;

      // Extract page number from URL
      const pageMatch = url.match(/[?&]page=(\d+)/);
      if (pageMatch && pageMatch[1] && rel === 'last') {
        pagination.totalPages = parseInt(pageMatch[1]);
      }
    }

    return pagination;
  }
}

/**
 * Re-shape the fetch layer's HTTP error into the `{ response: { status, data,
 * headers } }` form `ErrorHandler` reads.
 *
 * That shape is this package's internal contract with its own error handler and
 * is not worth changing during a transport swap — `ErrorHandler.handle` is
 * reached from more than this file (R14).
 */
function asLegacyHttpError(error: unknown): unknown {
  if (!(error instanceof GitHubHttpError)) return error;

  const legacy = new Error(
    `HTTP ${error.status}: ${error.response.statusText}`,
  ) as Error & { response: { status: number; data: unknown; headers: Headers } };
  legacy.response = { status: error.status, data: error.data, headers: error.headers };
  return legacy;
}
