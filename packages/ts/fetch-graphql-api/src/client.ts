/**
 * @fileoverview The GraphQL transport (R12).
 *
 * It issues one request — `POST /graphql` — and everything below that request
 * is the REST unit's: the transport seam (R2), authentication (R4), the
 * defaults (R5), cancellation (R9), the HTTP error contract (R8) and the rate
 * limiter (R10). What is *not* shared is the success test, because GraphQL's is
 * different: a `200` carrying an `errors` array is a failure.
 *
 * **This package has no consumer.** Nothing in this repository issues a GraphQL
 * query. It is built, tested and shipped ahead of one deliberately — see D3.
 * @module client
 */

import {
  GitHubRestClient,
  type FetchLike,
  type GitHubConfigSources,
  type GitHubProxyReport,
  type GitHubResponse,
  type RequestOptions,
} from '@internal/github-sdk-fetch-rest-api';
import type { GitHubRateLimiter } from '@internal/github-sdk-ratelimit';

import { GitHubGraphQLError, type GraphQLEnvelope, type GraphQLErrorDetail } from './errors.js';
import { findConnection, type LocatedConnection } from './pagination.js';

/** GitHub's GraphQL endpoint, relative to the REST base URL. */
export const GRAPHQL_PATH = '/graphql';

/** Variables for a query or mutation. */
export type GraphQLVariables = Record<string, unknown>;

/** Per-request knobs. A subset of the REST unit's, minus the ones GraphQL fixes. */
export interface GraphQLRequestOptions
  extends Omit<RequestOptions, 'body' | 'accept' | 'responseType' | 'resource'> {
  /** Operation name, when the document declares more than one. */
  operationName?: string;
}

/** Options for the GraphQL client's constructor. */
export interface GitHubGraphQLClientOptions {
  /**
   * Token. GitHub's GraphQL API rejects unauthenticated requests, unlike REST.
   *
   * Omit it and one is resolved from `GITHUB_TOKEN`, then `GH_TOKEN` — the REST
   * unit's resolution, reached through it rather than repeated here (PRD 0001,
   * R1, R7). Pass `null` to force an anonymous client.
   */
  token?: string | null;
  /** `Authorization` scheme. Default `Bearer`. Not environment-resolvable. */
  authScheme?: string;
  /**
   * API base URL; `/graphql` is appended. Resolved from `GITHUB_API_URL`, then
   * `GH_HOST`, then the REST unit's `DEFAULT_BASE_URL` (PRD 0001, R2).
   */
  baseUrl?: string;
  /** `User-Agent`. Resolved from `GITHUB_USER_AGENT` when omitted (PRD 0001, R3). */
  userAgent?: string;
  /** Default per-request timeout in ms. Resolved from `GITHUB_API_TIMEOUT` when omitted (PRD 0001, R3). */
  timeoutMs?: number;
  /**
   * HTTP proxy every request is routed through (PRD 0002, R1, R6).
   *
   * Resolved from `GITHUB_PROXY`, then the pair matching the resolved base
   * URL's scheme. `null` forces a direct connection. Needs the opt-in
   * `@internal/github-sdk-fetch-proxy` package; configure a proxy without it
   * and construction throws rather than connecting direct (R11).
   *
   * Ignored when `rest` is supplied — that client is already configured.
   */
  proxy?: string | null;
  /**
   * Hosts reached directly even when a proxy is configured (R2).
   *
   * Comma-separated string or array, curl's `NO_PROXY` rules. Resolved from
   * `GITHUB_NO_PROXY`, then `no_proxy`, then `NO_PROXY`.
   */
  proxyBypass?: string | readonly string[] | null;
  /**
   * Passed through to the transport's `init` on every request (PRD 0002, R7).
   *
   * The seam the REST unit and the SDK facade have always exposed and this
   * client did not — an undici `Dispatcher`/`Agent` for connection pooling,
   * mTLS or a custom CA bundle. Closing that gap is what makes "configure the
   * transport" mean the same thing across all three packages.
   *
   * For **proxying**, use `proxy` instead: it resolves from the environment,
   * honors `NO_PROXY`, validates at construction and redacts its credentials.
   */
  transportInit?: Record<string, unknown>;
  /**
   * Whether unset options may be resolved from the environment. Default `true`
   * (PRD 0001, R5). `false` disables every environment read for this client.
   *
   * Ignored when `rest` is supplied — that client's own `env` already decided.
   */
  env?: boolean;
  /** The transport (R2). Omit for the platform global, resolved at call time. */
  fetch?: FetchLike;
  /** The limiter (R10). Supply one to share a budget with a REST client on the same token. */
  limiter?: GitHubRateLimiter;
  /** Headers added to every request. */
  headers?: Record<string, string | undefined>;
  /**
   * An already-configured REST client to issue through.
   *
   * This is how the facade gives REST and GraphQL one token, one limiter and
   * one transport (R13). When supplied, every other option here is ignored —
   * the REST client is already configured, and reconfiguring it from these
   * would silently override the facade's own.
   */
  rest?: GitHubRestClient;
}

/** A page of a cursor-paginated query, with its connection already located. */
export interface GraphQLPage<T = unknown> {
  /** The `data` half of the envelope. */
  data: T;
  /** The connection this page was read from — its `pageInfo`, `nodes` and path. */
  connection: LocatedConnection;
  /** GitHub's `extensions`, which carries its point-cost accounting. */
  extensions: Record<string, unknown> | undefined;
  /** The transporting HTTP response, for a caller that needs its headers. */
  response: GitHubResponse<unknown>;
}

/** Options for a cursor-paginated iteration (R12). */
export interface GraphQLPaginateOptions extends GraphQLRequestOptions {
  /** The variable the query binds its cursor to. Default `cursor`. */
  cursorVariable?: string;
  /** Dotted path to the connection, when a query has more than one at the same depth. */
  connectionPath?: string;
  /** Stop after this many pages. */
  maxPages?: number;
  /** Stop after this many nodes. */
  maxItems?: number;
}

/**
 * The GitHub GraphQL client.
 *
 * Usable directly, without the SDK facade, so a REST-only consumer never pays
 * for it (R13).
 */
export class GitHubGraphQLClient {
  readonly #rest: GitHubRestClient;

  constructor(options: GitHubGraphQLClientOptions = {}) {
    this.#rest =
      options.rest ??
      new GitHubRestClient({
        ...(options.token === undefined ? {} : { token: options.token }),
        ...(options.authScheme === undefined ? {} : { authScheme: options.authScheme }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(options.limiter === undefined ? {} : { limiter: options.limiter }),
        ...(options.headers === undefined ? {} : { headers: options.headers }),
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
        ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
        ...(options.transportInit === undefined
          ? {}
          : { transportInit: options.transportInit }),
      });
  }

  /** The REST client underneath, and so the shared limiter and transport (R12, R13). */
  get rest(): GitHubRestClient {
    return this.#rest;
  }

  /**
   * Where each effective value came from (PRD 0001, R8).
   *
   * The REST client's record, since that is the client this one issues
   * through. Carries the token's source, never its value (R10).
   */
  get configSources(): GitHubConfigSources {
    return this.#rest.configSources;
  }

  /**
   * Whether this client is about to proxy, through what, and who decided
   * (PRD 0002, R12).
   *
   * The REST client's record, since that is the client this one issues
   * through. The proxy URL it carries is redacted (R10).
   */
  get proxyConfig(): GitHubProxyReport {
    return this.#rest.proxyConfig;
  }

  /** The limiter governing this client. Its GraphQL traffic is metered under `graphql` (R10, R12). */
  get limiter(): GitHubRateLimiter {
    return this.#rest.limiter;
  }

  /** Replace the token without rebuilding the client (R4). The environment is not re-consulted. */
  setToken(token: string | null | undefined): void {
    this.#rest.setToken(token);
  }

  /**
   * Issue a query or mutation and return its `data` (R12).
   *
   * Throws {@link GitHubGraphQLError} when GitHub reports errors — including on
   * a `200`, which is GraphQL's defining difference from REST. A partial
   * response is still an error, and the error carries the `data` GitHub did
   * resolve alongside the errors, so the caller decides which matters.
   *
   * Use {@link GitHubGraphQLClient.raw} to get the whole envelope instead.
   */
  async graphql<T = unknown>(
    query: string,
    variables: GraphQLVariables = {},
    options: GraphQLRequestOptions = {},
  ): Promise<T> {
    const { envelope, response } = await this.raw<T>(query, variables, options);
    return judge<T>(envelope, response, query);
  }

  /**
   * Issue a query and return the whole envelope, unjudged.
   *
   * The escape hatch for a caller that wants to inspect `errors` and
   * `extensions` without an exception — the mutation that partially succeeded,
   * the point-cost readout. HTTP-level failures still throw, because a `502`
   * carries no envelope to inspect (R8).
   */
  async raw<T = unknown>(
    query: string,
    variables: GraphQLVariables = {},
    options: GraphQLRequestOptions = {},
  ): Promise<{ envelope: GraphQLEnvelope<T>; response: GitHubResponse<GraphQLEnvelope<T>> }> {
    const { operationName, ...requestOptions } = options;

    const response = await this.#rest.request<GraphQLEnvelope<T>>(
      `POST ${GRAPHQL_PATH}`,
      {},
      {
        ...requestOptions,
        body: {
          query,
          variables,
          ...(operationName === undefined ? {} : { operationName }),
        },
        // Metered under `graphql`, not `core` — a separate budget with separate
        // exhaustion (R12). The limiter reserves the bucket already.
        resource: 'graphql',
        // A query is a read, but it travels as a POST. Without this every
        // GraphQL request would be treated as unreplayable after a rate-limit
        // wait, which is the opposite of the truth for a query.
        idempotent: options.idempotent ?? true,
      },
    );

    const envelope = (response.data ?? {}) as GraphQLEnvelope<T>;
    return { envelope, response };
  }

  /**
   * Iterate a cursor-paginated query, page by page (R12).
   *
   * The query must accept a cursor variable — `cursor` unless
   * `cursorVariable` says otherwise — and pass it as the connection's `after`
   * argument. Each page is a separate governed request, so the whole iteration
   * is rate-limited, not just its first page (R10).
   */
  async *paginateIterator<T = unknown>(
    query: string,
    variables: GraphQLVariables = {},
    options: GraphQLPaginateOptions = {},
  ): AsyncGenerator<GraphQLPage<T>, void, undefined> {
    const cursorVariable = options.cursorVariable ?? 'cursor';
    const { cursorVariable: _c, connectionPath, maxPages, maxItems, ...requestOptions } = options;
    void _c;
    void maxItems;

    let cursor: string | null = null;
    let pages = 0;

    for (;;) {
      if (maxPages !== undefined && pages >= maxPages) return;

      const { envelope, response } = await this.raw<T>(
        query,
        { ...variables, [cursorVariable]: cursor },
        requestOptions,
      );
      const data = judge<T>(envelope, response, query);
      const connection = findConnection(data, connectionPath);
      if (connection === null) {
        throw new TypeError(
          'No `pageInfo` found in the GraphQL response. A paginated query must select ' +
            '`pageInfo { hasNextPage endCursor }`; pass `connectionPath` when a query has ' +
            'more than one connection at the same depth.',
        );
      }

      yield {
        data,
        connection,
        extensions: envelope.extensions,
        response,
      };
      pages += 1;

      if (connection.pageInfo.hasNextPage !== true) return;
      const endCursor = connection.pageInfo.endCursor;
      // `hasNextPage: true` with no cursor is GitHub contradicting itself.
      // Stopping is the only safe reading — replaying with `null` would restart
      // from page one, forever.
      if (endCursor === undefined || endCursor === null || endCursor === '') return;
      cursor = endCursor;
    }
  }

  /** Iterate individual nodes of a cursor-paginated query, honoring `maxItems` (R12). */
  async *paginateEach<T = unknown, N = unknown>(
    query: string,
    variables: GraphQLVariables = {},
    options: GraphQLPaginateOptions = {},
  ): AsyncGenerator<N, void, undefined> {
    const maxItems = options.maxItems;
    let emitted = 0;

    for await (const page of this.paginateIterator<T>(query, variables, options)) {
      for (const node of page.connection.nodes) {
        if (maxItems !== undefined && emitted >= maxItems) return;
        emitted += 1;
        yield node as N;
      }
      if (maxItems !== undefined && emitted >= maxItems) return;
    }
  }

  /** Collect every node of a cursor-paginated query. */
  async paginate<T = unknown, N = unknown>(
    query: string,
    variables: GraphQLVariables = {},
    options: GraphQLPaginateOptions = {},
  ): Promise<N[]> {
    const nodes: N[] = [];
    for await (const node of this.paginateEach<T, N>(query, variables, options)) {
      nodes.push(node);
    }
    return nodes;
  }

  /** Release the underlying limiter. */
  close(): void {
    this.#rest.close();
  }
}

/**
 * Apply GraphQL's success test to an envelope (R12).
 *
 * A `200` carrying `errors` is a failure. A partial response — `data` and
 * `errors` together — is still a failure, but the error carries both halves so
 * the caller decides which matters.
 */
function judge<T>(
  envelope: GraphQLEnvelope<T>,
  response: GitHubResponse<GraphQLEnvelope<T>>,
  query: string,
): T {
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    throw new GitHubGraphQLError<T>({
      errors: envelope.errors as GraphQLErrorDetail[],
      data: (envelope.data ?? null) as T | null,
      ...(envelope.extensions === undefined ? {} : { extensions: envelope.extensions }),
      status: response.status,
      requestId: response.headers.get('x-github-request-id'),
      query,
    });
  }
  return (envelope.data ?? null) as T;
}

/** Construct a GraphQL client. The functional twin of `new GitHubGraphQLClient(...)`. */
export function createGraphQLClient(
  options: GitHubGraphQLClientOptions = {},
): GitHubGraphQLClient {
  return new GitHubGraphQLClient(options);
}
