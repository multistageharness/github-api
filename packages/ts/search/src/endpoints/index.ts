/**
 * Search endpoint registry — resolved by the `./endpoints` package export.
 *
 * Enumerates the GitHub Search API endpoints this SDK targets and the method
 * name on the client that services each one.
 *
 * @module endpoints
 */

/**
 * The set of supported GitHub search endpoints.
 */
export const SEARCH_ENDPOINTS = [
  'repositories',
  'code',
  'commits',
  'issues',
  'users',
  'labels',
  'topics'
] as const;

/**
 * Union of supported endpoint names.
 */
export type SearchEndpoint = (typeof SEARCH_ENDPOINTS)[number];

/**
 * Map each endpoint to the client method that services it.
 */
export const ENDPOINT_METHODS: Record<SearchEndpoint, string> = {
  repositories: 'searchRepositories',
  code: 'searchCode',
  commits: 'searchCommits',
  issues: 'searchIssues',
  users: 'searchUsers',
  labels: 'searchLabels',
  topics: 'searchTopics'
};

/**
 * Resolve the REST path for an endpoint (e.g. `repositories` -> `/search/repositories`).
 */
export function endpointPath(endpoint: SearchEndpoint): string {
  return `/search/${endpoint}`;
}
