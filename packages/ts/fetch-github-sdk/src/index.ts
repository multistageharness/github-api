/**
 * @fileoverview `@internal/github-sdk-fetch-github-sdk` — the facade composing
 * the REST and GraphQL transports (PRD 0002, R13).
 *
 * The role `@octokit/core` plays in `octokit.js`: one object holding the token,
 * the limiter and the transport, exposing both APIs. It composes and
 * configures, and adds no capability the underlying units lack — which is what
 * keeps `@internal/github-sdk-fetch-rest-api` usable on its own.
 * @module @internal/github-sdk-fetch-github-sdk
 */

export { DEFAULTS, GitHubSdk, createGitHubSdk, type GitHubSdkOptions } from './sdk.js';

// Re-exported so a consumer using the facade catches the layer's errors and
// names its types without depending on both units by hand. The units remain
// directly importable — this is a convenience, not the only path (R13).
export {
  API_VERSION_VARIABLE,
  BASE_URL_VARIABLES,
  ENVIRONMENT_VARIABLES,
  GitHubAbortError,
  GitHubEnvironmentError,
  GitHubFetchError,
  GitHubHttpError,
  GitHubNetworkError,
  GitHubRestClient,
  GitHubTimeoutError,
  TIMEOUT_VARIABLE,
  TOKEN_VARIABLES,
  USER_AGENT_VARIABLE,
  isGitHubEnvironmentError,
  isGitHubFetchError,
  isGitHubHttpError,
  resolveConfig,
  type ConfigSource,
  type FetchLike,
  type GitHubConfigSources,
  type GitHubResponse,
  type GitHubRestClientOptions,
  type PaginateOptions,
  type PaginationLinks,
  type RateLimitHeaders,
  type RequestOptions,
  type RequestParameters,
  type ResponseType,
} from '@internal/github-sdk-fetch-rest-api';

export {
  GitHubGraphQLClient,
  GitHubGraphQLError,
  isGraphQLError,
  type GraphQLEnvelope,
  type GraphQLErrorDetail,
  type GraphQLPage,
  type GraphQLPaginateOptions,
  type GraphQLRequestOptions,
  type GraphQLVariables,
} from '@internal/github-sdk-fetch-graphql-api';
