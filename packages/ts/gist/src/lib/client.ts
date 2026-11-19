/**
 * @fileoverview HTTP client for the GitHub Gist API.
 * @module lib/client
 */

import {
  GitHubFetchError,
  GitHubHttpError,
  GitHubRestClient,
} from '@internal/github-sdk-fetch-rest-api';

import { isRateLimitError } from '@internal/github-sdk-ratelimit';

import { AuthManager } from './utils/auth.js';
import { handleAPIError, RateLimitError } from './utils/errors.js';
import type { ClientOptions, RequestOptions, GistResponse } from './utils/types.js';

/** Query parameter values that survive serialization; `null`/`undefined` are dropped. */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Transport for the Gist API: URL building, authenticated requests, content
 * negotiation, and retry of transient failures.
 */
export class GistClient {
  readonly auth: AuthManager;
  readonly baseURL: string;
  /** Per-request timeout in milliseconds. */
  timeout: number;
  /** Total attempts for a transient failure, including the first. */
  retryAttempts: number;
  /** Milliseconds between retries. */
  retryDelay: number;
  /**
   * The transport (PRD 0002, R13).
   *
   * Every outbound request in this package goes through the one fetch layer, so
   * a `--proxy` flag or a `HTTPS_PROXY` reaches it. Before this it called the
   * global `fetch` directly, which no proxy setting could reach.
   *
   * Retry, media-type negotiation and body decoding stay here: they are this
   * package's contract, and the layer is the transport underneath them.
   */
  private readonly http: GitHubRestClient;

  constructor(options: ClientOptions = {}) {
    this.auth = new AuthManager({ token: options.token, baseURL: options.baseURL });
    this.baseURL = this.auth.baseURL;
    this.timeout = options.timeout ?? 30000;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.http = new GitHubRestClient({
      // `AuthManager` composes this package's own headers, `Authorization`
      // included. `token: null` stops the layer resolving a second one from the
      // environment and sending it under a different scheme.
      token: null,
      baseUrl: this.baseURL,
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });
  }

  /** Append query parameters to a URL, omitting `null` and `undefined`. */
  buildURL(url: string, params: QueryParams = {}): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) search.append(key, String(value));
    }
    const query = search.toString();
    return query ? `${url}?${query}` : url;
  }

  /** Resolve after `ms` milliseconds. */
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Perform an authenticated request.
   *
   * Retries transport failures and 5xx responses up to `retryAttempts`; a 4xx is
   * a definitive answer and is never retried.
   *
   * @param endpoint path appended to `baseURL`, or an absolute URL
   * @throws {GistAPIError} on any non-2xx response
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<GistResponse<T>> {
    const { method = 'GET', body, mediaType, params } = options;

    const base = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    const url = params ? this.buildURL(base, params) : base;

    const extra: Record<string, string> = {};
    if (mediaType) extra['Accept'] = mediaType;
    if (body !== undefined) extra['Content-Type'] = 'application/json';

    const requestOptions = {
      headers: this.auth.getHeaders(extra),
      timeoutMs: this.timeout,
      ...(body === undefined ? {} : { body }),
      // The layer is told **not** to read the body. Decoding is this package's
      // own — a `mediaType` request wants raw text where the layer would return
      // bytes — and handing the body over twice is how a stream gets consumed
      // before its owner reads it.
      responseType: 'stream' as const,
    };

    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        const response = await this.http.request<unknown>(
          `${method.toUpperCase()} ${url}`,
          {},
          requestOptions,
        );
        return {
          data: await this.readBody<T>(response.response),
          status: response.status,
          headers: response.headers,
        };
      } catch (error) {
        // The limiter classifies an exhausted budget and raises before the
        // HTTP-error path is reached. Same condition, same error class as
        // `handleAPIError` would have produced from the headers — and, like a
        // 4xx, never worth retrying.
        if (isRateLimitError(error)) {
          throw new RateLimitError(
            error.resetAt === null ? 0 : error.resetAt.getTime(),
            0,
            0,
          );
        }
        if (error instanceof GitHubHttpError) {
          // 4xx is definitive; only server-side failures are worth another
          // attempt.
          if (error.status >= 500 && attempt < this.retryAttempts) {
            lastError = new Error(`HTTP ${error.status}`);
            await this.delay(this.retryDelay);
            continue;
          }
          handleAPIError(error.response, await this.readBody<T>(error.response));
          // `handleAPIError` always throws; this keeps the compiler informed.
          throw error;
        }

        // A transport failure — a refused socket, a timeout, a dead proxy —
        // never reached GitHub, so it is retried until the budget is spent.
        lastError = error;
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay);
          continue;
        }
        throw error instanceof GitHubFetchError ? error : (error as Error);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Request failed');
  }

  /** Release the transport's limiter and any proxy connection pool. */
  close(): void {
    this.http.close();
  }

  /**
   * Decode a response body. A 204 carries nothing; otherwise the content type
   * decides between JSON and text.
   */
  private async readBody<T>(response: {
    status: number;
    headers: { get(name: string): string | null | undefined };
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  }): Promise<T> {
    if (response.status === 204) return null as T;

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('json') && response.json) {
      return (await response.json()) as T;
    }
    if (response.text) {
      return (await response.text()) as T;
    }
    return null as T;
  }

  /** `GET {endpoint}` */
  async get<T = unknown>(
    endpoint: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<GistResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', ...options });
  }

  /** `POST {endpoint}` — `body` is omitted entirely when not supplied. */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<GistResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }

  /** `PATCH {endpoint}` */
  async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<GistResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }

  /** `PUT {endpoint}` */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<GistResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }

  /** `DELETE {endpoint}` */
  async delete<T = unknown>(
    endpoint: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<GistResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', ...options });
  }
}

export default GistClient;
