/**
 * @fileoverview `@internal/github-sdk-fetch-graphql-api` — the GitHub GraphQL
 * transport (PRD 0002, R12).
 *
 * **This package has no consumer.** Nothing in this repository issues a GraphQL
 * query, and that is stated here rather than only in a decision record: a
 * package that looks used but is not is worse than one that says so. It exists
 * because GraphQL's `200`-with-`errors` envelope is not a parameter you add to
 * a REST-shaped layer later — it is a different success test, a different error
 * contract and a different pagination model. See D3.
 *
 * It shares the transport, auth, defaults, cancellation and rate-limit seams
 * with `@internal/github-sdk-fetch-rest-api` rather than re-implementing them,
 * and adding it required zero changes to that package (G5).
 * @module @internal/github-sdk-fetch-graphql-api
 */

export {
  GRAPHQL_PATH,
  GitHubGraphQLClient,
  createGraphQLClient,
  type GitHubGraphQLClientOptions,
  type GraphQLPage,
  type GraphQLPaginateOptions,
  type GraphQLRequestOptions,
  type GraphQLVariables,
} from './client.js';

export {
  GitHubGraphQLError,
  isGraphQLError,
  type GraphQLEnvelope,
  type GraphQLErrorDetail,
} from './errors.js';

export { findConnection, type LocatedConnection, type PageInfo } from './pagination.js';
