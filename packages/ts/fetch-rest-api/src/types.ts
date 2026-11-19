/**
 * @fileoverview The contracts this layer is: what a request is (R3), what a
 * response is (R7), and what can be injected (R2).
 * @module types
 */

import type { GitHubRateLimiter, ResourceName } from '@internal/github-sdk-ratelimit';

/**
 * A `fetch`-compatible function (R2).
 *
 * Typed structurally rather than as `typeof globalThis.fetch` so a test double
 * — or a host's own dispatcher-bound wrapper — satisfies it without importing
 * DOM lib types or `undici`.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * How a response body is read (R11).
 *
 * - `auto` — JSON when the response says JSON, text for textual media types,
 *   bytes otherwise. The default.
 * - `json` — always parse as JSON, degrading to text when it does not parse.
 * - `text` — always read as text.
 * - `arrayBuffer` — always read as bytes.
 * - `stream` — do not read the body at all. `data` is `null` and
 *   {@link GitHubResponse.response} carries the unread stream.
 */
export type ResponseType = 'auto' | 'json' | 'text' | 'arrayBuffer' | 'stream';

/**
 * Path and query parameters for a route (R3).
 *
 * Names matching a `{placeholder}` in the route are substituted into the path,
 * URL-encoded. Whatever is left becomes query parameters for `GET`/`HEAD` and a
 * JSON body otherwise. `undefined` and `null` values are dropped entirely —
 * `sort=undefined` earns a `422` from GitHub.
 */
export type RequestParameters = Record<string, unknown>;

/** Per-request knobs. Separate from {@link RequestParameters} so no parameter name is reserved. */
export interface RequestOptions {
  /** Headers merged over the client's defaults. A per-request header always wins. */
  headers?: Record<string, string | undefined>;
  /** Shorthand for `headers.accept` — the media type (R11). */
  accept?: string;
  /** Shorthand for `headers['content-type']`. Set automatically for a JSON body. */
  contentType?: string;
  /**
   * An explicit body, overriding the parameters-become-a-body rule.
   *
   * A string, `URLSearchParams`, `ArrayBuffer`, typed array, `Blob` or stream is
   * sent verbatim with no `Content-Type` of our own (R11); anything else is
   * serialized as JSON.
   */
  body?: unknown;
  /** Per-request timeout in ms. Falls back to the client's, then to the package default. */
  timeoutMs?: number;
  /** Caller's cancellation signal. Composes with the timeout — first to fire wins (R9). */
  signal?: AbortSignal;
  /** How to read the body (R11). Defaults to `auto`. */
  responseType?: ResponseType;
  /**
   * Force the rate-limit bucket. Otherwise the limiter derives it from the URL
   * (`/search/*` → `search`, `/graphql` → `graphql`, and so on).
   */
  resource?: ResourceName;
  /**
   * Whether the request may be replayed after a rate-limit wait. Defaults to
   * `true` for `GET`/`HEAD`/`OPTIONS` and `false` otherwise.
   */
  idempotent?: boolean;
  /**
   * Passed through to the transport's `init` verbatim.
   *
   * The seam for an undici `Dispatcher`/`Agent` without this package depending
   * on `undici` (R2, D2) — connection pooling, mTLS, a custom CA bundle.
   *
   * **Proxying is no longer among the things this is for.** Use the `proxy`
   * option (PRD 0002, R6): it resolves from the environment, honors `NO_PROXY`,
   * validates at construction and redacts its credentials, none of which a
   * hand-built dispatcher does. A `dispatcher` supplied here still wins over
   * the one the `proxy` option builds, so the escape hatch stays an escape
   * hatch.
   */
  transportInit?: Record<string, unknown>;
}

/** GitHub's rate-limit headers, read once per response so no consumer re-parses them (R7, R10). */
export interface RateLimitHeaders {
  limit: number | undefined;
  remaining: number | undefined;
  used: number | undefined;
  /** Reset time as GitHub sends it: epoch **seconds**. */
  reset: number | undefined;
  /** Reset as a `Date`, or `null` when GitHub did not send one. */
  resetAt: Date | null;
  /** The bucket GitHub says it metered this request against. */
  resource: string | undefined;
  /** `Retry-After`, in milliseconds, when present. */
  retryAfterMs: number | undefined;
}

/**
 * The one response contract (R7).
 *
 * Carries status, headers and parsed body, and keeps the underlying `Response`
 * reachable for callers that need to stream or read an unparsed body.
 */
export interface GitHubResponse<T = unknown> {
  /** HTTP status. */
  status: number;
  /** The URL the request finally went to, including query string. */
  url: string;
  /** Response headers. */
  headers: Headers;
  /**
   * Parsed body.
   *
   * `null` for `204 No Content`, for an empty body, and for
   * `responseType: 'stream'` — never a parse error.
   */
  data: T;
  /** The underlying response. Its body is already consumed unless `responseType` was `stream`. */
  response: Response;
  /** Rate-limit headers, on success and on failure alike (R7, R10). */
  rateLimit: RateLimitHeaders;
  /** `Link` header cursors, parsed once (R6). */
  links: PaginationLinks;
}

/** The four cursors GitHub puts in a `Link` header (R6). */
export interface PaginationLinks {
  next: string | null;
  prev: string | null;
  first: string | null;
  last: string | null;
}

/**
 * The two proxy settings, as a mixin for a consumer's own options type
 * (PRD 0002, R6, R13).
 *
 * Every package in this repository that wraps this client exposes the same two
 * names with the same meanings by extending this, rather than by restating
 * them — eleven CLIs where `--proxy` means something subtly different is the
 * outcome [RK6] exists to prevent, and eleven hand-copied option declarations
 * is how that starts.
 */
export interface GitHubProxyOptions {
  /**
   * HTTP proxy every request is routed through.
   *
   * Resolved from `GITHUB_PROXY`, then the pair matching the resolved base
   * URL's scheme — `https_proxy`/`HTTPS_PROXY` or `http_proxy`/`HTTP_PROXY`.
   * `null` forces a direct connection.
   *
   * Needs the opt-in `@internal/github-sdk-fetch-proxy` package; configuring a
   * proxy without it throws at construction rather than connecting direct.
   */
  proxy?: string | null | undefined;
  /**
   * Hosts reached directly even when a proxy is configured.
   *
   * A comma-separated string or an array, matched by curl's `NO_PROXY` rules.
   * Resolved from `GITHUB_NO_PROXY`, then `no_proxy`, then `NO_PROXY`.
   */
  proxyBypass?: string | readonly string[] | null | undefined;
}

/** Options for the REST client's constructor. */
export interface GitHubRestClientOptions {
  /**
   * Personal access token or installation token.
   *
   * Omit it and one is resolved from `GITHUB_TOKEN`, then `GH_TOKEN` (PRD 0001,
   * R1). With neither set, requests go out unauthenticated — no `Authorization`
   * header at all, rather than an empty one.
   *
   * Pass `null` to force an anonymous client while leaving every other
   * environment default in place; pass `env: false` to disable resolution
   * wholesale. Replaceable at runtime with {@link GitHubRestClient.setToken}
   * (R4).
   */
  token?: string | null;
  /**
   * `Authorization` scheme. Default `Bearer` (R4).
   *
   * Not environment-resolvable: the scheme is a per-consumer compatibility
   * knob, not a statement about which instance you are talking to.
   */
  authScheme?: string;
  /**
   * API base URL. Resolved from `GITHUB_API_URL`, then `GH_HOST`, then
   * {@link DEFAULT_BASE_URL} (R2, R5).
   */
  baseUrl?: string;
  /** `User-Agent`. Resolved from `GITHUB_USER_AGENT`, then `github-sdk-fetch-rest-api/0.0.1` (R3, R5). */
  userAgent?: string;
  /** `X-GitHub-Api-Version`. Resolved from `GITHUB_API_VERSION`, then {@link DEFAULT_API_VERSION} (R3, R5). */
  apiVersion?: string;
  /**
   * Default `Accept`. Default `application/vnd.github+json` (R5, R11).
   *
   * Not environment-resolvable: `Accept` is a per-request media-type concern.
   */
  accept?: string;
  /** Headers added to every request, beneath any per-request override. */
  headers?: Record<string, string | undefined>;
  /** Default per-request timeout in ms. Resolved from `GITHUB_API_TIMEOUT`, then 30 000 (R3, R9). */
  timeoutMs?: number;
  /**
   * HTTP proxy every request is routed through (PRD 0002, R1, R4, R6).
   *
   * Resolved from `GITHUB_PROXY`, then the pair matching the **resolved** base
   * URL's scheme — `https_proxy`/`HTTPS_PROXY`, or `http_proxy`/`HTTP_PROXY` —
   * then no proxy at all (R3). Lowercase beats uppercase, following curl.
   *
   * Pass `null` to force a direct connection while leaving every other
   * environment default in place; pass `env: false` to disable resolution
   * wholesale.
   *
   * The dispatcher this needs lives in the opt-in
   * `@internal/github-sdk-fetch-proxy` package (R11, D1). Configure a proxy
   * without installing it and construction **throws**: a proxy that is silently
   * ignored sends traffic you believed was proxied straight out of the network.
   */
  proxy?: string | null;
  /**
   * Hosts reached directly even when a proxy is configured (R2).
   *
   * A comma-separated string or an array, matched by curl's `NO_PROXY` rules:
   * `*` bypasses everything, `example.test` covers its subdomains,
   * `example.test:8080` binds to that port only. Resolved from
   * `GITHUB_NO_PROXY`, then `no_proxy`, then `NO_PROXY`.
   *
   * `null` is an explicitly empty list — bypass nothing, whatever the
   * environment holds.
   */
  proxyBypass?: string | readonly string[] | null;
  /**
   * Whether unset options may be resolved from the environment. Default `true`
   * (PRD 0001, R5).
   *
   * One switch for all of them, not one per setting. `false` restores the
   * pre-PRD-0001 behavior exactly: no `Authorization`, {@link DEFAULT_BASE_URL},
   * and the package defaults for the rest, whatever the environment holds.
   *
   * Only `process.env` is ever consulted — no `.env` file, no
   * `~/.config/gh/hosts.yml`, no dependency (R11).
   */
  env?: boolean;
  /**
   * The transport (R2).
   *
   * Omit it and the platform global is used, **resolved at call time** — a test
   * double installed after this module was imported is still honored.
   *
   * Supplying one **replaces the transport wholesale, proxying included**. The
   * platform global `fetch` discards an init `dispatcher`, so a proxy has to
   * bring its own transport (PRD 0002); an injected `fetch` takes that slot.
   * The proxy's dispatcher is still passed in each request's `init`, so an
   * injected transport built on undici proxies anyway — one built on anything
   * else does not. Prefer `transportInit` over `fetch` when you want to
   * instrument requests *and* keep the `proxy` option working.
   */
  fetch?: FetchLike;
  /**
   * The rate limiter governing every request (R10).
   *
   * Supply one to share a budget across several clients holding the same token.
   * Omit it and this client builds its own. This package contains no rate-limit
   * logic of its own; it only plugs the limiter in.
   */
  limiter?: GitHubRateLimiter;
  /** Passed through to the transport's `init` on every request. See {@link RequestOptions.transportInit}. */
  transportInit?: Record<string, unknown>;
}

/** Caps and hooks for a paginated iteration (R6). */
export interface PaginateOptions extends RequestOptions {
  /** Stop after this many pages. */
  maxPages?: number;
  /** Stop after this many items. The final page is truncated to hit the cap exactly. */
  maxItems?: number;
  /**
   * How to read the item array out of a page.
   *
   * Defaults to: the body itself when it is an array; otherwise the first
   * array-valued property of a `total_count`-carrying search envelope or an
   * `items` array. Supply one for an endpoint that does neither.
   */
  itemsOf?: (data: unknown) => unknown[];
}
