/**
 * GitHub Search API Module
 * Enterprise-grade search client with scalability features
 */

import type { SearchParams, SearchResult } from './lib/BaseSearchClient.js';
import type { SafeSearchClient } from './lib/SafeSearchClient.js';

export { BaseSearchClient } from './lib/BaseSearchClient.js';
export { RateLimitedSearchClient } from './lib/RateLimitedSearchClient.js';
export { CachedSearchClient } from './lib/CachedSearchClient.js';
export { BatchedSearchClient } from './lib/BatchedSearchClient.js';
export { SafeSearchClient, createSafeSearchClient } from './lib/SafeSearchClient.js';

// Default export is the safe production client
export { SafeSearchClient as default } from './lib/SafeSearchClient.js';

/**
 * Quick search functions using SafeSearchClient
 */
const defaultClient: SafeSearchClient | null = null;

async function getDefaultClient(): Promise<SafeSearchClient> {
  if (!defaultClient) {
    const { createSafeSearchClient } = await import('./lib/SafeSearchClient.js');
    return createSafeSearchClient();
  }
  return defaultClient;
}

export const search = {
  async repositories(query: string, options: SearchParams = {}): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchRepositories({ q: query, ...options });
  },

  async code(query: string, options: SearchParams = {}): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchCode({ q: query, ...options });
  },

  async commits(query: string, options: SearchParams = {}): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchCommits({ q: query, ...options });
  },

  async issues(query: string, options: SearchParams = {}): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchIssues({ q: query, ...options });
  },

  async users(query: string, options: SearchParams = {}): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchUsers({ q: query, ...options });
  },

  async labels(
    repositoryId: string | number,
    query: string,
    options: SearchParams = {}
  ): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchLabels({ repository_id: repositoryId, q: query, ...options });
  },

  async topics(query: string, options: SearchParams = {}): Promise<SearchResult> {
    const client = await getDefaultClient();
    return client.searchTopics({ q: query, ...options });
  }
};
