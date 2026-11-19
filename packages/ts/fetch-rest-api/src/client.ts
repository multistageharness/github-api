/**
 * @fileoverview The REST transport — the one place a GitHub request is issued
 * from (R1–R11).
 *
 * Everything above the socket that a GitHub call needs lives here once: the
 * request contract, authentication, the three defaults every request carries,
 * body handling, cancellation, the response contract, the error contract, and
 * pagination. Rate limiting lives in `@internal/github-sdk-ratelimit` and is
 * plugged in; this module contains zero lines of it (R10).
 * @module client
 */

import { GitHubRateLimiter, isAbortError as isRateLimiterAbortError } from '@internal/github-sdk-ratelimit';

import { encodeBody, readBody } from './body.js';
// The four settings `resolveConfig` owns take their defaults there, so the
// resolution order is applied in one place rather than half here (R4, R7).
import { DEFAULT_ACCEPT, DEFAULT_AUTH_SCHEME } from './defaults.js';
import { buildRequest } from './endpoint.js';
import { resolveConfig, type GitHubConfigSources, type GitHubProxyReport } from './env.js';
import {
  GitHubAbortError,
  GitHubFetchError,
  GitHubHttpError,
  GitHubNetworkError,
  GitHubProxyError,
  GitHubTimeoutError,
  messageForStatus,
} from './errors.js';
import { mergeHeaders, readRateLimitHeaders } from './headers.js';
import { defaultItemsOf, followableNext, parseLinks } from './pagination.js';
import { createProxyTransport, type ProxyTransport } from './proxy.js';
import { composeSignal, isAbortLike } from './signal.js';
import type {
  FetchLike,
  GitHubResponse,
  GitHubRestClientOptions,
  PaginateOptions,
  RequestOptions,
  RequestParameters,
  ResponseType,
} from './types.js';

/**
 * Resolve the transport at **call time**, never at module load (R2, D2).
 *
 * Capturing `globalThis.fetch` in a module-level constant would ignore a test
 * double installed after this module was imported — subtle enough that D2 made
 * it an acceptance criterion of its own.
 */
function resolveFetch(injected: FetchLike | undefined): FetchLike {
  if (injected !== undefined) return injected;
  const global = (globalThis as { fetch?: FetchLike }).fetch;
  if (global === undefined) {
    throw new Error(
      'No global fetch is available. Node 18 or newer supplies one; on an older runtime, ' +
        'pass a `fetch` implementation to the client (R2).',
    );
  }
  return global;
}

/** Signature of the paginate helper, which is callable and carries sub-methods. */
export interface Paginate {
  /** Collect every item across every page, honoring `maxPages` / `maxItems`. */
  <T = unknown>(route: string, parameters?: RequestParameters, options?: PaginateOptions): Promise<
    T[]
  >;
  /** Async-iterate whole pages, each a full {@link GitHubResponse} (R6). */
  iterator<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: PaginateOptions,
  ): AsyncGenerator<GitHubResponse<T>, void, undefined>;
  /** Async-iterate individual items across pages (R6). */
  each<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: PaginateOptions,
  ): AsyncGenerator<T, void, undefined>;
}

/**
 * The GitHub REST client.
 *
 * Construct one per token. It holds the defaults, the transport and the
 * limiter; every request it issues is governed, and every page of every
 * paginated iteration is a separate governed request (R10).
 */
export class GitHubRestClient {
  #token: string | undefined;

  readonly #authScheme: string;
  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #apiVersion: string;
  readonly #accept: string;
  readonly #extraHeaders: Record<string, string | undefined>;
  readonly #timeoutMs: number;
  readonly #fetch: FetchLike | undefined;
  readonly #limiter: GitHubRateLimiter;
  readonly #transportInit: Record<string, unknown> | undefined;
  readonly #sources: GitHubConfigSources;
  readonly #proxy: GitHubProxyReport;
  readonly #proxyTransport: ProxyTransport | undefined;

  constructor(options: GitHubRestClientOptions = {}) {
    // Explicit option > environment > package default, applied once, in the one
    // module that reads `process.env` (PRD 0001, R4, R7). Construction is where
    // it happens, so a variable set after this module was imported is honored
    // (R6) — the same rule `resolveFetch` applies to the transport.
    const resolved = resolveConfig(options);
    this.#token = resolved.token;
    this.#baseUrl = resolved.baseUrl;
    this.#userAgent = resolved.userAgent;
    this.#apiVersion = resolved.apiVersion;
    this.#timeoutMs = resolved.timeoutMs;
    this.#sources = resolved.sources;
    this.#proxy = resolved.proxy;

    // Built here, at construction, so a configured-but-unusable proxy fails
    // before a single request is issued (PRD 0002, R9, R11). Building it opens
    // no socket, so this stays within N2's "no I/O at construction";
    // `createProxyTransport` throws when nothing has opted in, and never falls
    // back to a direct connection (RK2).
    this.#proxyTransport =
      resolved.proxyUrl === undefined
        ? undefined
        : createProxyTransport({
            url: resolved.proxyUrl,
            // The factory is the one place the password is needed — it issues
            // the `CONNECT`. Everything else in this client sees the redacted
            // form and only the redacted form (R10).
            redactedUrl: resolved.proxy.url ?? '',
            baseUrl: resolved.baseUrl,
          });

    // Neither of these describes *which instance you are talking to*, so
    // neither is environment-resolvable (PRD 0001, D2).
    this.#authScheme = options.authScheme ?? DEFAULT_AUTH_SCHEME;
    this.#accept = options.accept ?? DEFAULT_ACCEPT;

    this.#extraHeaders = options.headers ?? {};
    this.#fetch = options.fetch;
    this.#transportInit = options.transportInit;
    // One limiter per client unless the caller shares one. Two limiters over the
    // same token double-count the same budget, which is why this never layers.
    this.#limiter = options.limiter ?? new GitHubRateLimiter();
  }

  /** The limiter governing this client, for a consumer that must observe or configure it (R10). */
  get limiter(): GitHubRateLimiter {
    return this.#limiter;
  }

  /** The resolved base URL, so a consumer can report it without re-deriving it. */
  get baseUrl(): string {
    return this.#baseUrl;
  }

  /**
   * Where each effective value came from (PRD 0001, R8).
   *
   * `'option'`, `'default'`, or `'env:GITHUB_TOKEN'` — the exact variable, so
   * "which token is this client about to send, and where did it come from" is
   * answerable without issuing a request. It carries the token's **source**,
   * never the token's **value** (R10).
   *
   * A fresh object each time, so a caller cannot mutate the client's record of
   * its own configuration.
   */
  get configSources(): GitHubConfigSources {
    return { ...this.#sources };
  }

  /**
   * Whether this client is about to proxy, through what, and who decided
   * (PRD 0002, R12).
   *
   * Answerable **without issuing a request**, which is the point: behind a
   * corporate proxy the alternative diagnostic is a connection error that names
   * DNS. It distinguishes the two states an operator otherwise conflates — no
   * proxy configured (`source: 'default'`) versus a proxy configured and this
   * host bypassed (`bypassed: true`, `effective: 'direct'`).
   *
   * The URL it carries has its password replaced by `***` (R10); the real one
   * is not readable back out of this client at all. A fresh object each time,
   * bypass list included, so a caller cannot mutate the client's record of its
   * own configuration.
   */
  get proxyConfig(): GitHubProxyReport {
    return { ...this.#proxy, bypass: [...this.#proxy.bypass] };
  }

  /**
   * Replace the token without rebuilding the client (R4).
   *
   * Pass `undefined` or `null` to drop authentication entirely — no
   * `Authorization` header is sent at all, which is not the same as sending an
   * empty one, and the environment is **not** re-consulted. A caller who has
   * said "no token" means it.
   */
  setToken(token: string | null | undefined): void {
    this.#token = token ?? undefined;
    this.#sources.token = 'option';
  }

  /** Whether a token is currently configured. The token itself is never readable back out (N8). */
  hasToken(): boolean {
    return this.#token !== undefined && this.#token !== '';
  }

  /** Release the limiter's resources, and the proxy's connection pool when there is one. */
  close(): void {
    this.#limiter.close();
    // A proxy agent holds open sockets; leaving them would keep the process
    // alive after `close()`, which is the one thing `close()` exists to prevent.
    this.#proxyTransport?.close?.();
  }

  /** The headers this client sends by default, before any per-request override. */
  #defaultHeaders(): Record<string, string | undefined> {
    const headers: Record<string, string | undefined> = {
      accept: this.#accept,
      'user-agent': this.#userAgent,
      'x-github-api-version': this.#apiVersion,
      ...this.#extraHeaders,
    };
    // Omitted entirely when there is no token: unauthenticated requests must
    // work, and an empty `Authorization` is a 401 rather than an anonymous call.
    if (this.#token !== undefined && this.#token !== '') {
      headers['authorization'] = `${this.#authScheme} ${this.#token}`;
    }
    return headers;
  }

  /**
   * Issue one request (R3, R7, R8, R9, R10, R11).
   *
   * @param route - `"GET /repos/{owner}/{repo}"`, a bare path, or an absolute
   *   URL — a `Link`-header URL is followed verbatim rather than rebuilt.
   * @param parameters - Path parameters are substituted and URL-encoded; the
   *   rest become query parameters or a JSON body. `undefined` and `null` are
   *   dropped, never serialized.
   * @param options - Per-request headers, media type, body, timeout, signal and
   *   response type. A per-request header wins over the client's default.
   */
  async request<T = unknown>(
    route: string,
    parameters: RequestParameters = {},
    options: RequestOptions = {},
  ): Promise<GitHubResponse<T>> {
    const built = buildRequest(route, parameters, this.#baseUrl, options.body !== undefined);
    const method = built.method;
    const url = built.url;

    const explicitBody = options.body !== undefined ? options.body : built.bodyParameters;
    const encoded = encodeBody(explicitBody);

    const headers = mergeHeaders(
      this.#defaultHeaders(),
      // Set beneath the caller's headers so an explicit `content-type` wins.
      encoded.contentType === undefined ? undefined : { 'content-type': encoded.contentType },
      options.headers,
      options.accept === undefined ? undefined : { accept: options.accept },
      options.contentType === undefined ? undefined : { 'content-type': options.contentType },
    );

    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;
    const responseType: ResponseType = options.responseType ?? 'auto';
    // An injected `fetch` wins over the proxy's own, because it is the more
    // explicit and lower-level seam — a test double or a host's instrumented
    // transport. The proxy's `dispatcher` is still spread into the init below,
    // so an injected undici-based transport proxies anyway (PRD 0002, R6).
    const transport = resolveFetch(this.#fetch ?? this.#proxyTransport?.fetch);

    // The governed task returns the layer's own response contract, which is
    // *exactly* the shape the limiter's default extractor reads: `status`,
    // `headers` and the parsed `data`. That is what makes GitHub's
    // secondary-limit signal — which appears only in the body — available to a
    // caller-supplied limiter with no per-consumer extractor (R10).
    const send = async (): Promise<GitHubResponse<T>> => {
      const composed = composeSignal(timeoutMs, options.signal);
      let response: Response;
      try {
        response = await transport(url, {
          // The proxy's dispatcher goes in first, beneath both `transportInit`
          // layers: the `proxy` option is configuration, and an explicitly
          // injected dispatcher is a deliberate override of it (PRD 0002, R6).
          ...(this.#proxyTransport === undefined
            ? {}
            : { dispatcher: this.#proxyTransport.dispatcher }),
          // Spread next, so a `dispatcher` or another host-specific field is
          // carried through while the request contract itself stays ours — a
          // pass-through must not be able to clobber the method or the signal.
          ...this.#transportInit,
          ...options.transportInit,
          method,
          headers,
          ...(encoded.body === undefined ? {} : { body: encoded.body }),
          signal: composed.signal,
        } as RequestInit);
      } catch (error) {
        // Ordered: a timeout and a cancellation both surface as an abort from
        // the transport, and only this layer knows which fired (R8, R9).
        if (composed.timedOut()) throw new GitHubTimeoutError(method, url, timeoutMs, error);
        if (composed.cancelled() || isAbortLike(error)) {
          throw new GitHubAbortError(method, url, error);
        }
        const reason = (error as Error)?.message ?? String(error);
        // With a proxy in the path the socket was opened to the **proxy**, not
        // to GitHub, so "failed to reach api.github.com" is the wrong
        // diagnosis and the wrong thing to escalate (PRD 0002, N9, RK8). The
        // proxy host is named; its password is not (R10).
        if (this.#proxyTransport !== undefined) {
          const proxy = this.#proxy.url ?? 'the configured proxy';
          throw new GitHubProxyError(
            `Request to ${url} through proxy ${proxy} failed: ${reason}`,
            method,
            url,
            proxy,
            error,
          );
        }
        throw new GitHubNetworkError(`Request to ${url} failed: ${reason}`, method, url, error);
      } finally {
        // Cleared on every path, so a settled request never holds the process
        // open on a pending timer (R9).
        composed.cleanup();
      }

      const data = (await readBody(response, responseType)) as T;
      return {
        status: response.status,
        url: response.url === '' ? url : response.url,
        headers: response.headers,
        data,
        response,
        rateLimit: readRateLimitHeaders(response.headers, Date.now()),
        links: parseLinks(response.headers.get('link')),
      };
    };

    // Errors are raised *after* the limiter has seen the response, never inside
    // the task: throwing early would hide the very response the limiter needs to
    // read the budget off — and error responses are where it matters most.
    let result: GitHubResponse<T>;
    try {
      result = await this.#limiter.execute(send, {
        url,
        method,
        ...(options.resource === undefined ? {} : { resource: options.resource }),
        ...(options.idempotent === undefined ? {} : { idempotent: options.idempotent }),
        // The caller's signal also reaches the limiter, so it cancels a pacing
        // delay or a rate-limit wait — not only the socket.
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      // The limiter raises its own `AbortError` when the caller's signal fires
      // before or between attempts. That is still a caller cancellation, and a
      // consumer must not have to know which layer noticed it first (R8, R9).
      // A rate-limit error is deliberately passed through untouched — it is the
      // limiter's contract, not ours to re-classify (R8, R10).
      if (isLimiterAbort(error)) throw new GitHubAbortError(method, url, error);
      throw error;
    }

    if (result.status >= 200 && result.status < 300) return result;
    if (result.status === 304) return result;

    throw new GitHubHttpError({
      message: messageForStatus(result.status, result.response.statusText, result.data),
      status: result.status,
      method,
      url: result.url,
      data: result.data,
      response: result.response,
      rateLimit: result.rateLimit,
    });
  }

  /** `GET`, for callers that would rather not spell the verb into the route. */
  get<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.request<T>(withMethod('GET', route), parameters, options);
  }

  /** `POST`. */
  post<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.request<T>(withMethod('POST', route), parameters, options);
  }

  /** `PATCH`. */
  patch<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.request<T>(withMethod('PATCH', route), parameters, options);
  }

  /** `PUT`. */
  put<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.request<T>(withMethod('PUT', route), parameters, options);
  }

  /** `DELETE`. */
  delete<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.request<T>(withMethod('DELETE', route), parameters, options);
  }

  /** `HEAD`. */
  head<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.request<T>(withMethod('HEAD', route), parameters, options);
  }

  /**
   * Pagination (R6).
   *
   * Callable — `await client.paginate(route, params)` collects every item — and
   * carries `iterator()` for whole pages and `each()` for one item at a time.
   */
  readonly paginate: Paginate = Object.assign(
    async <T = unknown>(
      route: string,
      parameters: RequestParameters = {},
      options: PaginateOptions = {},
    ): Promise<T[]> => {
      const items: T[] = [];
      for await (const item of this.paginate.each<T>(route, parameters, options)) {
        items.push(item);
      }
      return items;
    },
    {
      iterator: <T = unknown>(
        route: string,
        parameters: RequestParameters = {},
        options: PaginateOptions = {},
      ): AsyncGenerator<GitHubResponse<T>, void, undefined> =>
        this.#iteratePages<T>(route, parameters, options),
      each: <T = unknown>(
        route: string,
        parameters: RequestParameters = {},
        options: PaginateOptions = {},
      ): AsyncGenerator<T, void, undefined> => this.#iterateItems<T>(route, parameters, options),
    },
  );

  /**
   * Yield whole pages, following the `next` URL GitHub returned (R6).
   *
   * The `next` URL is used verbatim rather than rebuilt from an incremented
   * `?page=` — GitHub's cursor endpoints do not accept a reconstructed one, and
   * rebuilding it is the bug `activity/src/client/http.ts:334` shipped.
   */
  async *#iteratePages<T>(
    route: string,
    parameters: RequestParameters,
    options: PaginateOptions,
  ): AsyncGenerator<GitHubResponse<T>, void, undefined> {
    const { maxPages, maxItems, itemsOf, ...requestOptions } = options;
    void maxItems;
    void itemsOf;

    let nextRoute: string | null = route;
    let nextParameters: RequestParameters = parameters;
    let pages = 0;

    while (nextRoute !== null) {
      // Checked before each page so a cancelled iteration stops without issuing
      // another request, rather than only failing inside one (R9).
      if (options.signal?.aborted === true) {
        throw new GitHubAbortError('GET', nextRoute, options.signal.reason);
      }
      if (maxPages !== undefined && pages >= maxPages) return;

      const page: GitHubResponse<T> = await this.request<T>(
        nextRoute,
        nextParameters,
        requestOptions,
      );
      pages += 1;
      yield page;

      // Parameters were consumed by the first request; the `next` URL already
      // carries the query GitHub wants replayed. A `next` past `last` is ignored.
      nextRoute = followableNext(page.links);
      nextParameters = {};
    }
  }

  /** Yield individual items across pages, honoring the item cap exactly (R6). */
  async *#iterateItems<T>(
    route: string,
    parameters: RequestParameters,
    options: PaginateOptions,
  ): AsyncGenerator<T, void, undefined> {
    const select = options.itemsOf ?? defaultItemsOf;
    const maxItems = options.maxItems;
    let emitted = 0;

    for await (const page of this.#iteratePages<unknown>(route, parameters, options)) {
      for (const item of select(page.data)) {
        if (maxItems !== undefined && emitted >= maxItems) return;
        emitted += 1;
        yield item as T;
      }
      if (maxItems !== undefined && emitted >= maxItems) return;
    }
  }
}

/**
 * Whether the limiter aborted rather than this layer.
 *
 * Errors this layer already raised are excluded: a `GitHubTimeoutError` is not
 * a cancellation, and re-wrapping a `GitHubAbortError` would lose its cause.
 */
function isLimiterAbort(error: unknown): boolean {
  if (error instanceof GitHubFetchError) return false;
  return isRateLimiterAbortError(error) || isAbortLike(error);
}

/** Apply a verb to a route that may or may not already carry one. */
function withMethod(method: string, route: string): string {
  return /^[A-Za-z]+\s+\S/.test(route.trim()) ? route : `${method} ${route}`;
}

/** Construct a REST client. The functional twin of `new GitHubRestClient(...)`. */
export function createRestClient(options: GitHubRestClientOptions = {}): GitHubRestClient {
  return new GitHubRestClient(options);
}
