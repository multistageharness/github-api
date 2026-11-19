/**
 * Endpoint → client-method lookup.
 *
 * `ENDPOINT_METHODS` already maps `repositories → searchRepositories` in the
 * SDK. Using it is what lets the wizard dispatch without a hand-written
 * `switch` — a second source of truth that would drift the moment the SDK gains
 * an endpoint.
 */

import { ENDPOINT_METHODS } from '@internal/github-sdk-search/endpoints';

/** The client methods that service a search endpoint. */
export type SearchMethod =
  | 'searchRepositories'
  | 'searchCode'
  | 'searchCommits'
  | 'searchIssues'
  | 'searchUsers'
  | 'searchLabels'
  | 'searchTopics';

/**
 * Resolve the client method name that services an endpoint.
 *
 * The guard matters for non-interactive mode, where `--endpoint` is arbitrary
 * user input rather than a value picked from a list.
 *
 * @returns e.g. `'searchRepositories'`
 * @throws {Error} when the endpoint is not one the SDK services.
 */
export function methodFor(endpoint: string): SearchMethod {
  // The SDK types the values as `string`; they are exactly the `SearchMethod` names.
  const method = (ENDPOINT_METHODS as Record<string, string | undefined>)[endpoint];
  if (!method) throw new Error(`Unknown endpoint: ${endpoint}`);
  return method as SearchMethod;
}
