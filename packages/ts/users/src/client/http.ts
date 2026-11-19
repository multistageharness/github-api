/**
 * @fileoverview HTTP Client with GitHub API integration
 * @module HttpClient
 */

import {
  GitHubHttpError,
  GitHubRestClient,
  GitHubTimeoutError,
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  parseLinkHeader as parseLinkHeaderOnce,
  type GitHubProxyOptions,
} from '@internal/github-sdk-fetch-rest-api';
import {
  GitHubRateLimiter,
  isRateLimitError,
  type GitHubRateLimitError,
} from '@internal/github-sdk-ratelimit';
import {
  UsersError,
  AuthError,
  ValidationError,
  RateLimitError,
  type ErrorBodyLike,
} from '../utils/errors.js';

/**
 * Rate limiting configuration for the HTTP client.
 *
 * `maxRequests`/`window` described a fixed local quota. They are still accepted
 * and still honoured — as a derived minimum interval — but the real budget now
 * comes from GitHub's own headers rather than a hardcoded 5000/hour, which was
 * wrong for GitHub Enterprise and for unauthenticated use alike.
 */
export interface RateLimitingConfig {
  enabled?: boolean;
  maxRequests?: number;
  window?: number;
}

/**
 * Options accepted by the {@link HttpClient} constructor.
 */
export interface HttpClientOptions extends GitHubProxyOptions {
  baseUrl?: string;
  token?: string;
  timeout?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  rateLimiting?: RateLimitingConfig;
}

/**
 * Per-request options.
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  // request bodies are dynamic — object (JSON), string, or array payloads
  body?: any;
  [key: string]: unknown;
}

/**
 * HTTP Client for GitHub API requests
 */
export class HttpClient {
  baseUrl: string;
  token: string | undefined;
  timeout: number;
  userAgent: string;
  headers: Record<string, string>;

  /**
   * The shared limiter. Always present — when rate limiting is disabled it is
   * constructed with `enabled: false`, which still tracks GitHub's reported
   * budget but adds no delay and performs no waits (R12).
   *
   * This replaces the previous `API_Rate_Limiter.schedule()` wrapper outright.
   * Running both would have counted the same budget twice, which is why
   * adoption swaps rather than layers.
   */
  rateLimiter: GitHubRateLimiter;

  /**
   * The transport (PRD 0002, R14).
   *
   * Built with no auth and no defaults of its own: `this.headers` is public,
   * mutable through `updateConfig`, and still composed by this class — it is
   * passed per request so `updateConfig` keeps working without rebuilding
   * anything.
   */
  readonly #rest: GitHubRestClient;

  /**
   * Create a new HttpClient instance
   */
  constructor(options: HttpClientOptions = {}) {
    // One home for this value now, in `@internal/github-sdk-fetch-rest-api`
    // (PRD 0002, R5). The public `baseUrl` field is unchanged.
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.token = options.token;
    this.timeout = options.timeout || 10000;
    this.userAgent = options.userAgent || '@github-api/users/1.0.0';

    // Default headers
    this.headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'User-Agent': this.userAgent,
      'X-GitHub-Api-Version': DEFAULT_API_VERSION,
      ...options.headers,
    };

    // The old client only limited when explicitly enabled, so that stays the
    // default. Disabled still means "track the budget, add no delay" (R12).
    const rateLimiting = options.rateLimiting;
    const enabled = rateLimiting?.enabled === true;
    const maxRequests = rateLimiting?.maxRequests;
    const windowMs = rateLimiting?.window;

    this.rateLimiter = new GitHubRateLimiter({
      enabled,
      // A caller-declared quota becomes a floor between requests, which is the
      // only part of `maxRequests`/`window` that was ever enforceable locally.
      minIntervalMs:
        enabled && maxRequests && maxRequests > 0 && windowMs && windowMs > 0
          ? windowMs / maxRequests
          : 0,
    });

    this.#rest = new GitHubRestClient({
      baseUrl: this.baseUrl,
      limiter: this.rateLimiter,
      // Omitted keys rather than `undefined` values, so an unset proxy option is
      // resolved from `GITHUB_PROXY`/`HTTPS_PROXY` while an explicit `null`
      // still forces a direct connection (PRD 0002, R4).
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });
  }

  /**
   * Make an HTTP request
   */
  // Endpoint responses are dynamically shaped per GitHub API endpoint.
  async request(method: string, path: string, options: RequestOptions = {}): Promise<any> {
    // `this.baseUrl` is public and `updateConfig` can move it, so the URL is
    // built here and handed to the layer absolute — the layer takes an absolute
    // URL verbatim (PRD 0002, R3).
    const url = `${this.baseUrl}${path}`;

    try {
      // The layer governs the round-trip and, because it parses the body, the
      // limiter sees GitHub's own `message` too — the secondary-limit signal
      // that appears nowhere else (R10). Decorating the result stays here.
      const result = await this.#rest.request(
        `${method} ${url}`,
        {},
        {
          headers: { ...this.headers, ...options.headers },
          // Body for POST/PUT/PATCH only, as before. The layer serializes it
          // and sets `Content-Type: application/json`.
          ...(options.body && ['POST', 'PUT', 'PATCH'].includes(method)
            ? { body: options.body }
            : {}),
          timeoutMs: this.timeout,
        },
      );

      return this.decorate(result.data, result.headers);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Attach this SDK's `_pagination` and `_rateLimit` metadata to a parsed body.
   *
   * Split out of {@link handleResponse} so `request` can apply it to a body the
   * fetch layer already parsed, without reading the response twice. The shape
   * is unchanged, including the long-standing caveat that attaching to a body
   * only works when the body is an object.
   */
  private decorate(data: any, headers: { get(name: string): string | null }): any {
    // Add pagination info if present
    const linkHeader = headers.get('link');
    if (linkHeader && data !== null && typeof data === 'object') {
      data._pagination = this.parseLinkHeader(linkHeader);
    }

    // Add rate limit info
    if (data !== null && typeof data === 'object') {
      data._rateLimit = {
        limit: parseInt(headers.get('x-ratelimit-limit') || '0'),
        remaining: parseInt(headers.get('x-ratelimit-remaining') || '0'),
        reset: new Date(parseInt(headers.get('x-ratelimit-reset') || '0') * 1000),
      };
    }

    return data;
  }

  /**
   * Make a GET request
   */
  async get(path: string, options: RequestOptions = {}): Promise<any> {
    // Convert query parameters to URL search params
    if (options.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, value.toString());
        }
      });
      path += `?${searchParams.toString()}`;
    }

    return this.request('GET', path, options);
  }

  /**
   * Make a POST request
   */
  async post(path: string, body: any = {}, options: RequestOptions = {}): Promise<any> {
    return this.request('POST', path, { ...options, body });
  }

  /**
   * Make a PUT request
   */
  async put(path: string, body: any = {}, options: RequestOptions = {}): Promise<any> {
    return this.request('PUT', path, { ...options, body });
  }

  /**
   * Make a PATCH request
   */
  async patch(path: string, body: any = {}, options: RequestOptions = {}): Promise<any> {
    return this.request('PATCH', path, { ...options, body });
  }

  /**
   * Make a DELETE request
   */
  async delete(path: string, options: RequestOptions = {}): Promise<any> {
    return this.request('DELETE', path, options);
  }

  /**
   * Handle HTTP response
   */
  // Parsed body shape is endpoint-dependent (JSON object/array, or string).
  async handleResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');

    // Handle different content types
    let data: any;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Handle error responses
    if (!response.ok) {
      throw this.createError(response, data);
    }

    return this.decorate(data, response.headers);
  }

  /**
   * Create appropriate error from response
   */
  createError(response: Response, data: ErrorBodyLike): Error {
    const message = data.message || `HTTP ${response.status}: ${response.statusText}`;

    switch (response.status) {
      case 401:
        return new AuthError(message, response.status, data);
      case 403: {
        // Classified from the response GitHub actually sent — its headers and
        // its body — rather than by searching the message for "rate limit".
        // That string match reported a rate limit for any 403 whose message
        // happened to mention one, and missed every one that did not (R11).
        const verdict = this.rateLimiter.classify(
          { status: response.status, headers: response.headers, data },
          { url: response.url },
        );
        if (verdict.isRateLimit) {
          return new RateLimitError(message, response.status, data);
        }
        return new AuthError(message, response.status, data);
      }
      case 429:
        return new RateLimitError(message, response.status, data);
      case 422:
        return new ValidationError(message, response.status, data);
      default:
        return new UsersError(message, response.status, data);
    }
  }

  /**
   * Handle request errors
   */
  handleError(error: unknown): Error {
    if (error instanceof UsersError) {
      return error;
    }

    // GitHub answered with an error status. `createError` picks this package's
    // own class from the status and body, exactly as it did when this class
    // read the response itself (PRD 0002, R14).
    if (error instanceof GitHubHttpError) {
      return this.createError(error.response, (error.data ?? {}) as ErrorBodyLike);
    }

    if (error instanceof GitHubTimeoutError) {
      return new UsersError('Request timeout');
    }

    // Map the limiter's contract onto this package's own, so adopting it does
    // not change what callers catch (R11, R15).
    if (isRateLimitError(error)) {
      const limitError = error as GitHubRateLimitError;
      const mapped = new RateLimitError(limitError.message, limitError.status, {
        message: limitError.message,
      });
      (mapped as { cause?: unknown }).cause = limitError;
      return mapped;
    }

    const err = error as { code?: string; name?: string; message?: string };

    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return new UsersError(`Network error: ${err.message}`);
    }

    if (err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
      return new UsersError('Request timeout');
    }

    return new UsersError(`Request failed: ${err.message}`);
  }

  /**
   * Parse Link header for pagination
   */
  parseLinkHeader(linkHeader: string): Record<string, string> {
    // Delegates to the fetch layer's parser rather than keeping a ninth copy
    // of it (PRD 0002, R6). Signature and return shape are unchanged.
    return parseLinkHeaderOnce(linkHeader);
  }

  /**
   * Update client configuration
   */
  updateConfig(options: HttpClientOptions = {}): void {
    if (options.token) {
      this.token = options.token;
      this.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.baseUrl) {
      this.baseUrl = options.baseUrl;
    }

    if (options.timeout) {
      this.timeout = options.timeout;
    }

    if (options.headers) {
      this.headers = { ...this.headers, ...options.headers };
    }
  }

  /**
   * Close the client and cleanup resources
   */
  close(): void {
    this.rateLimiter.close();
  }

  /**
   * Current GitHub rate-limit budget for a resource, straight from the headers
   * GitHub last sent. Replaces the hardcoded 5000/hour this client used to
   * assume, which was wrong for GitHub Enterprise and for unauthenticated use.
   */
  getRateLimitStatus(resource = 'core'): ReturnType<GitHubRateLimiter['getStatus']> {
    return this.rateLimiter.getStatus(resource);
  }
}
