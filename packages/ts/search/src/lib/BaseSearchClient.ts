/**
 * @fileoverview Root of the search client tier graph.
 *
 * `BaseSearchClient` owns the option surface, the public `token`/`timeout`
 * fields, the `request()` method (URL building, headers, timeout, error
 * mapping) and all seven `searchXxx()` methods. Every other tier extends it —
 * directly (`Cached`, `Batched`) or transitively (`Safe` via `RateLimited`).
 *
 * @module lib/BaseSearchClient
 */

import {
  GitHubHttpError,
  GitHubRestClient,
  DEFAULT_BASE_URL as LAYER_BASE_URL,
  type GitHubProxyOptions,
} from '@internal/github-sdk-fetch-rest-api';
import {
  GitHubRateLimiter,
  isRateLimitError,
  type GitHubRateLimitError,
  type RateLimiterOptions,
} from '@internal/github-sdk-ratelimit';
import { endpointPath } from '../endpoints/index.js';
import type { SearchEndpoint } from '../endpoints/index.js';
import { APIError, RateLimitError } from '../utils/errors.js';

/**
 * Default GitHub REST base URL.
 *
 * Re-exported from `@internal/github-sdk-fetch-rest-api` rather than restated:
 * the value has one home in the repository now (PRD 0002, R5). The export stays
 * because it is part of this package's public surface (R14).
 */
export const DEFAULT_BASE_URL = LAYER_BASE_URL;
/** Default per-request timeout, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Default `User-Agent` header. */
export const DEFAULT_USER_AGENT = 'GitHub-Search-SDK/1.0.0';

/**
 * Query parameters accepted by every `searchXxx()` method.
 *
 * The index signature is deliberate — GitHub accepts qualifiers this SDK does
 * not enumerate, and they are serialized into the query string verbatim.
 */
export interface SearchParams {
  q?: string;
  sort?: string;
  order?: string;
  per_page?: number;
  page?: number;
  /** Required by `searchLabels` only — the numeric repository id. */
  repository_id?: string | number;
  [key: string]: unknown;
}

/**
 * The shape every `GET /search/<type>` response shares.
 */
export interface SearchResult<T = unknown> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
  [key: string]: unknown;
}

/**
 * Options common to every client tier. Each tier's option interface extends
 * this one.
 */
export interface BaseSearchClientOptions extends GitHubProxyOptions {
  /** Personal access token; sent as `Authorization: Bearer <token>`. */
  token?: string;
  /** Token pool. When `token` is unset, the first element is used. */
  tokens?: string[];
  /** API base URL. Stored internally — never a public field. */
  baseURL?: string;
  /** Per-request timeout in ms, enforced with an `AbortController`. */
  timeout?: number;
  /** `User-Agent` header value. */
  userAgent?: string;
  /**
   * Limiter governing every request this client makes. Supply one to share a
   * budget across several clients holding the same token; omit it and the
   * client builds its own.
   */
  rateLimiter?: GitHubRateLimiter;
  /**
   * Options for the limiter this client builds when `rateLimiter` is omitted.
   * Ignored when `rateLimiter` is supplied — the caller's limiter is already
   * configured, and reconfiguring it here would silently override them.
   */
  rateLimiterOptions?: RateLimiterOptions;
}

/**
 * A usable `resetTime` for `RateLimitError`, which types it as a required
 * `number` (epoch ms).
 *
 * A secondary rate limit carries `Retry-After` and no reset window at all, so
 * the honest value is unknown. Passing `0` there would render as
 * `1970-01-01T00:00:00Z` in every consumer that formats it — including
 * `cli-github-api-search/src/render.mjs`, which prints
 * `new Date(err.resetTime).toISOString()` verbatim. Projecting the advised wait
 * onto a timestamp keeps that output truthful.
 */
function resetTimeFor(resetAt: Date | null, retryAfterMs: number): number {
  if (resetAt !== null) {
    return resetAt.getTime();
  }
  return Date.now() + Math.max(0, retryAfterMs);
}

/** The subset of a GitHub error body this client reads. */
interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
}

/**
 * The base GitHub Search API client.
 *
 * Public fields are `token` and `timeout` only. `baseURL` and `userAgent` are
 * held in JS private fields so they never appear on the instance — a property
 * `tests/module-structure.test.ts` relies on (`// baseURL is stored
 * internally, not exposed`).
 *
 * This class never reads the environment. The token arrives only through
 * constructor options; only the CLI layer reads `GITHUB_TOKEN`.
 */
export class BaseSearchClient {
  /** The resolved token. Empty string means "issue unauthenticated requests". */
  token: string;
  /** Per-request timeout in milliseconds. */
  timeout: number;

  readonly #baseURL: string;
  readonly #userAgent: string;
  readonly #rateLimiter: GitHubRateLimiter;

  /**
   * The transport (PRD 0002, R14).
   *
   * Private, like `baseURL` and `userAgent` — `token` and `timeout` remain the
   * only public fields on the instance, a property
   * `tests/module-structure.test.ts` asserts.
   *
   * Deliberately configured with **no** token and **no** timeout: both are
   * public, mutable fields a caller may change between calls, so they are
   * supplied per request and `this.token`/`this.timeout` stay authoritative.
   */
  readonly #rest: GitHubRestClient;

  constructor(options: BaseSearchClientOptions = {}) {
    this.token = options.token ?? options.tokens?.[0] ?? '';
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.#baseURL = options.baseURL ?? DEFAULT_BASE_URL;
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    // Private, like `baseURL` and `userAgent`: `token` and `timeout` remain the
    // only public fields on the instance.
    this.#rateLimiter =
      options.rateLimiter ?? new GitHubRateLimiter(options.rateLimiterOptions);
    this.#rest = new GitHubRestClient({
      baseUrl: this.#baseURL,
      userAgent: this.#userAgent,
      // This SDK has always sent the v3 media type, and R11 makes `Accept`
      // per-client overridable precisely so adoption need not change it.
      accept: 'application/vnd.github.v3+json',
      limiter: this.#rateLimiter,
      // Omitted keys rather than `undefined` values: an unset proxy is resolved
      // from the environment, an explicit `null` forces direct (PRD 0002, R4).
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });
  }

  /**
   * The limiter governing this client, for subclasses that need to configure or
   * inspect it. Deliberately not public — see the class docstring.
   */
  protected get rateLimiter(): GitHubRateLimiter {
    return this.#rateLimiter;
  }

  /**
   * Map the limiter's error contract onto this package's `RateLimitError`, so
   * callers keep catching what they always caught (R11, R15).
   */
  #asRateLimitError(error: GitHubRateLimitError): RateLimitError {
    const retryAfter =
      error.retryAfterMs ??
      (error.resetAt === null ? 0 : Math.max(0, error.resetAt.getTime() - Date.now()));
    return new RateLimitError(error.message, retryAfter, resetTimeFor(error.resetAt, retryAfter));
  }

  /**
   * GitHub's reported budget for the `search` resource.
   *
   * Distinct from `RateLimitedSearchClient.getRateLimitStatus()`, which reports
   * this client's *own* sliding window. This one reports what GitHub says, and
   * `search` is metered far more tightly than `core` — 30/minute against
   * 5000/hour — which is the budget this SDK never modelled before.
   */
  getSearchRateLimit(): ReturnType<GitHubRateLimiter['getStatus']> {
    return this.#rateLimiter.getStatus('search');
  }

  /**
   * Issue `GET <baseURL>/search/<endpoint>` and map failures onto the error
   * taxonomy in `utils/errors.ts`.
   *
   * Error precedence is load-bearing: the rate-limit check (`403` **and**
   * `x-ratelimit-remaining: 0`) runs **before** the generic `!res.ok` →
   * `APIError`. Inverting the two silently degrades every rate-limit response
   * into a bare `403`, and callers lose `retryAfter`/`resetTime`.
   */
  protected async request<T = unknown>(
    endpoint: SearchEndpoint,
    params: SearchParams = {}
  ): Promise<SearchResult<T>> {
    // `token` is a public, mutable field a caller may reassign between calls, so
    // it is pushed onto the transport here rather than captured at construction.
    // An empty token means unauthenticated: the layer then sends no
    // `Authorization` header at all, which is what this SDK has always done
    // (PRD 0002, R4).
    this.#rest.setToken(this.token === '' ? undefined : this.token);

    try {
      // The layer builds the URL — dropping `undefined`/`null` rather than
      // serializing them, the rule this file used to hold alone — applies the
      // defaults, bounds the request with `this.timeout`, and governs it under
      // the limiter's `search` budget rather than `core`'s (PRD 0002, R3–R10).
      const result = await this.#rest.request<SearchResult<T>>(
        `GET ${endpointPath(endpoint)}`,
        params as Record<string, unknown>,
        {
          timeoutMs: this.timeout,
          resource: 'search',
        },
      );
      return result.data;
    } catch (error) {
      // Precedence is load-bearing and unchanged: a rate limit is decided
      // *before* the generic `APIError`, because `RateLimitError extends
      // APIError` and inverting the two degrades every rate-limit response into
      // a bare 403, losing `retryAfter`/`resetTime`.
      if (isRateLimitError(error)) {
        throw this.#asRateLimitError(error as GitHubRateLimitError);
      }

      if (error instanceof GitHubHttpError) {
        // Classified from the response GitHub actually sent, covering 429 and
        // secondary limits, not just `403 + remaining: 0` (R3, R5).
        const verdict = this.#rateLimiter.classify(
          { status: error.status, headers: error.headers, data: error.data },
          { resource: 'search' },
        );
        if (verdict.isRateLimit) {
          const retryAfter =
            verdict.retryAfterMs ??
            (verdict.resetAtMs === undefined ? 0 : Math.max(0, verdict.resetAtMs - Date.now()));
          const reset = resetTimeFor(
            verdict.resetAtMs === undefined ? null : new Date(verdict.resetAtMs),
            retryAfter
          );
          throw new RateLimitError(
            `Rate limit exceeded; resets at ${new Date(reset).toISOString()}`,
            retryAfter,
            reset
          );
        }

        const body = (error.data ?? {}) as GitHubErrorBody;
        throw new APIError(
          body.message ?? `Request failed with status ${error.status}`,
          error.status,
          body.documentation_url ?? null
        );
      }

      throw error;
    }
  }

  /** `GET /search/repositories` */
  searchRepositories<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('repositories', params);
  }

  /** `GET /search/code` — GitHub requires a token for code search. */
  searchCode<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('code', params);
  }

  /** `GET /search/commits` */
  searchCommits<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('commits', params);
  }

  /** `GET /search/issues` — covers pull requests via the `is:pr` qualifier. */
  searchIssues<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('issues', params);
  }

  /** `GET /search/users` */
  searchUsers<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('users', params);
  }

  /**
   * `GET /search/labels` — `repository_id` travels **inside** `params`.
   * Only the `search.labels(repositoryId, query, options)` convenience helper
   * takes it positionally.
   */
  searchLabels<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('labels', params);
  }

  /** `GET /search/topics` */
  searchTopics<T = unknown>(params: SearchParams = {}): Promise<SearchResult<T>> {
    return this.request<T>('topics', params);
  }

  /** Release resources. A no-op on the base tier; overridden by `Batched`. */
  async close(): Promise<void> {
    // Nothing to release.
  }
}
