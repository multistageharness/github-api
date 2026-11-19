/**
 * @fileoverview The SDK facade (R13) — the role `@octokit/core` plays in
 * `octokit.js`.
 *
 * One object a consumer constructs, holding the token, the limiter and the
 * transport, exposing both APIs. It **composes and configures**; it adds no
 * capability the underlying units lack. Anything it could do that they cannot
 * would be a capability hidden behind a facade, which is how the REST unit
 * stops being usable on its own.
 * @module sdk
 */

import {
  GitHubGraphQLClient,
  type GraphQLPaginateOptions,
  type GraphQLRequestOptions,
  type GraphQLVariables,
} from '@internal/github-sdk-fetch-graphql-api';
import {
  DEFAULT_ACCEPT,
  DEFAULT_API_VERSION,
  DEFAULT_AUTH_SCHEME,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  GitHubRestClient,
  type FetchLike,
  type GitHubConfigSources,
  type GitHubProxyReport,
  type GitHubResponse,
  type RequestOptions,
  type RequestParameters,
} from '@internal/github-sdk-fetch-rest-api';
import { GitHubRateLimiter, type RateLimiterOptions } from '@internal/github-sdk-ratelimit';

/**
 * Options for the facade.
 *
 * Every option marked with an environment variable resolves in the order
 * **explicit option > environment > default** (PRD 0001, R4). `env: false`
 * turns the middle step off for the whole client.
 *
 * | Option | Unit | Environment | Default | Effect |
 * | --- | --- | --- | --- | --- |
 * | `token` | — | `GITHUB_TOKEN`, `GH_TOKEN` | none | Sent as `Authorization: <scheme> <token>`. `null` forces anonymous; GitHub's GraphQL API requires a token |
 * | `authScheme` | — | — | `Bearer` | The `Authorization` scheme |
 * | `baseUrl` | URL | `GITHUB_API_URL`, `GH_HOST` | `DEFAULT_BASE_URL` | REST base and the host `/graphql` is appended to |
 * | `userAgent` | — | `GITHUB_USER_AGENT` | `github-sdk-fetch-rest-api/0.0.1` | `User-Agent`. GitHub rejects requests without one |
 * | `apiVersion` | — | `GITHUB_API_VERSION` | `DEFAULT_API_VERSION` | `X-GitHub-Api-Version`, REST only |
 * | `accept` | — | — | `application/vnd.github+json` | Default REST `Accept`, overridable per request |
 * | `headers` | — | — | none | Added to every request, beneath any per-request override |
 * | `timeoutMs` | ms | `GITHUB_API_TIMEOUT` (ms) | `30000` | Per-request timeout; aborts the request |
 * | `env` | — | — | `true` | `false` disables every environment read for this SDK |
 * | `fetch` | — | — | platform global | The transport, resolved at call time |
 * | `limiter` | — | — | one built here | Governs every request from both units |
 * | `limiterOptions` | — | — | none | Configures the limiter built here. Ignored when `limiter` is supplied |
 * | `transportInit` | — | — | none | Passed to the transport's `init`; the undici `Dispatcher` seam for pooling, mTLS and CA bundles |
 * | `proxy` | URL | `GITHUB_PROXY`, `https_proxy`/`HTTPS_PROXY`, `http_proxy`/`HTTP_PROXY` | none | HTTP proxy for both units. `null` forces direct. Needs `@internal/github-sdk-fetch-proxy` |
 * | `proxyBypass` | list | `GITHUB_NO_PROXY`, `no_proxy`/`NO_PROXY` | none | Hosts reached directly, curl's `NO_PROXY` rules |
 */
export interface GitHubSdkOptions {
  /** `null` forces an anonymous client without disabling the other environment defaults (R4). */
  token?: string | null;
  authScheme?: string;
  baseUrl?: string;
  userAgent?: string;
  apiVersion?: string;
  accept?: string;
  headers?: Record<string, string | undefined>;
  timeoutMs?: number;
  /**
   * Whether unset options may be resolved from the environment. Default `true`
   * (PRD 0001, R5).
   *
   * One switch, not one per setting. It reaches both units, because they share
   * one REST client — which is the point of the facade.
   */
  env?: boolean;
  fetch?: FetchLike;
  /** Supply a limiter to share one budget across several SDKs holding the same token. */
  limiter?: GitHubRateLimiter;
  /**
   * Options for the limiter this facade builds when `limiter` is omitted.
   *
   * Ignored when `limiter` is supplied — a caller's limiter is already
   * configured, and reconfiguring it here would silently override them. The
   * same rule `search` applies to its own `rateLimiterOptions`.
   */
  limiterOptions?: RateLimiterOptions;
  transportInit?: Record<string, unknown>;
  /**
   * HTTP proxy both units route through (PRD 0002, R6).
   *
   * One setting, not one per unit: `sdk.rest` and `sdk.graphql` share one REST
   * client, which is the point of the facade. `null` forces a direct
   * connection. Needs the opt-in `@internal/github-sdk-fetch-proxy` package —
   * configure a proxy without it and construction throws rather than sending
   * supposedly-proxied traffic straight out (R11).
   */
  proxy?: string | null;
  /** Hosts reached directly even when a proxy is configured, by curl's `NO_PROXY` rules (R2). */
  proxyBypass?: string | readonly string[] | null;
}

/**
 * The composed GitHub SDK.
 *
 * `sdk.rest` and `sdk.graphql` share one token, one limiter and one transport.
 * Both units remain usable **directly**, without this facade — a consumer
 * needing only REST does not pay for GraphQL, which is the criterion that keeps
 * the GraphQL unit's zero-consumer status from taxing every REST caller (R13,
 * D3).
 */
export class GitHubSdk {
  /** The REST transport. */
  readonly rest: GitHubRestClient;
  /** The GraphQL transport. Issues through the same REST client, so through the same seams. */
  readonly graphql: GitHubGraphQLClient;
  /** The one limiter both units are governed by (R10). */
  readonly limiter: GitHubRateLimiter;

  constructor(options: GitHubSdkOptions = {}) {
    this.limiter = options.limiter ?? new GitHubRateLimiter(options.limiterOptions);

    this.rest = new GitHubRestClient({
      ...(options.token === undefined ? {} : { token: options.token }),
      ...(options.authScheme === undefined ? {} : { authScheme: options.authScheme }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
      ...(options.apiVersion === undefined ? {} : { apiVersion: options.apiVersion }),
      ...(options.accept === undefined ? {} : { accept: options.accept }),
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.transportInit === undefined ? {} : { transportInit: options.transportInit }),
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
      limiter: this.limiter,
    });

    // Constructed *from* the REST client rather than from the options again:
    // one configuration, applied once. Building it from the options a second
    // time is how two halves of one SDK end up with two tokens.
    this.graphql = new GitHubGraphQLClient({ rest: this.rest });
  }

  /** Issue one REST request. Shorthand for `sdk.rest.request(...)`. */
  request<T = unknown>(
    route: string,
    parameters?: RequestParameters,
    options?: RequestOptions,
  ): Promise<GitHubResponse<T>> {
    return this.rest.request<T>(route, parameters, options);
  }

  /** Issue one GraphQL query. Shorthand for `sdk.graphql.graphql(...)`. */
  query<T = unknown>(
    query: string,
    variables?: GraphQLVariables,
    options?: GraphQLRequestOptions,
  ): Promise<T> {
    return this.graphql.graphql<T>(query, variables, options);
  }

  /** Iterate a cursor-paginated GraphQL query. Shorthand for `sdk.graphql.paginateEach(...)`. */
  queryEach<T = unknown, N = unknown>(
    query: string,
    variables?: GraphQLVariables,
    options?: GraphQLPaginateOptions,
  ): AsyncGenerator<N, void, undefined> {
    return this.graphql.paginateEach<T, N>(query, variables, options);
  }

  /** Collect every item of a paginated REST route. Shorthand for `sdk.rest.paginate(...)`. */
  get paginate(): GitHubRestClient['paginate'] {
    return this.rest.paginate;
  }

  /**
   * Where each effective value came from (PRD 0001, R8).
   *
   * One record, because both units share one REST client. Carries the token's
   * source — `'option'`, `'default'`, or the exact variable such as
   * `'env:GH_TOKEN'` — never its value (R10).
   */
  get configSources(): GitHubConfigSources {
    return this.rest.configSources;
  }

  /**
   * Whether this SDK is about to proxy, through what, and who decided
   * (PRD 0002, R12).
   *
   * One record, because both units share one REST client. It distinguishes "no
   * proxy configured" from "proxy configured, this host bypassed" — different
   * states that a single boolean would conflate. The URL it carries has its
   * password replaced by `***` (R10).
   */
  get proxyConfig(): GitHubProxyReport {
    return this.rest.proxyConfig;
  }

  /**
   * Replace the token on both units at once (R4).
   *
   * They share one REST client, so this is one assignment — which is the point
   * of the facade. The environment is not re-consulted.
   */
  setToken(token: string | null | undefined): void {
    this.rest.setToken(token);
  }

  /** Release the shared limiter. */
  close(): void {
    this.rest.close();
  }
}

/** Construct the SDK. The functional twin of `new GitHubSdk(...)`. */
export function createGitHubSdk(options: GitHubSdkOptions = {}): GitHubSdk {
  return new GitHubSdk(options);
}

/** The defaults both units apply, re-exported so a consumer reads them from one place (R5). */
export const DEFAULTS = Object.freeze({
  baseUrl: DEFAULT_BASE_URL,
  apiVersion: DEFAULT_API_VERSION,
  accept: DEFAULT_ACCEPT,
  userAgent: DEFAULT_USER_AGENT,
  authScheme: DEFAULT_AUTH_SCHEME,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});
