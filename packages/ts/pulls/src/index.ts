#!/usr/bin/env node

import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import PullRequestClient from './lib/client.js';
import RateLimitedPullRequestClient from './lib/rateLimitedClient.js';
import { getAuth } from './lib/auth.js';
import { loadConfig } from './lib/config.js';
import type { ListOptions, CreateData, UpdateData, MergeOptions, PullRequest, MergeResult } from './lib/types.js';

export { PullRequestClient };
export { RateLimitedPullRequestClient };
export { getAuth } from './lib/auth.js';
export { loadConfig } from './lib/config.js';
export * as types from './lib/types.js';
export * as utils from './utils/format.js';
export { paginate } from './utils/pagination.js';
export { ApiError, AuthError, ValidationError, RateLimitError } from './utils/errors.js';

/** Options accepted by {@link createClient}. */
export interface CreateClientOptions {
  auth?: string | null;
  baseUrl?: string;
  owner?: string;
  repo?: string;
  enableRateLimiting?: boolean;
  [key: string]: unknown;
}

/**
 * Create a new GitHub Pull Request client
 */
export function createClient(options: CreateClientOptions = {}): PullRequestClient {
  const config = loadConfig();
  const auth = 'auth' in options ? options.auth : getAuth();

  const clientOptions = {
    auth,
    baseUrl: options.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    owner: options.owner || config.owner,
    repo: options.repo || config.repo,
    enableRateLimiting: options.enableRateLimiting
  };

  // Use rate-limited client by default unless explicitly disabled
  if (options.enableRateLimiting !== false && process.env.NODE_ENV !== 'test') {
    return new RateLimitedPullRequestClient(clientOptions);
  }

  return new PullRequestClient(clientOptions);
}

/**
 * Quick access methods for common operations
 */

/**
 * List pull requests
 */
export async function listPullRequests(
  owner: string,
  repo: string,
  options: ListOptions = {}
): Promise<PullRequest[]> {
  const client = createClient({ owner, repo });
  return client.list(options);
}

/**
 * Get a specific pull request
 */
export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequest> {
  const client = createClient({ owner, repo });
  return client.get(pullNumber);
}

/**
 * Create a new pull request
 */
export async function createPullRequest(
  owner: string,
  repo: string,
  data: CreateData
): Promise<PullRequest> {
  const client = createClient({ owner, repo });
  return client.create(data);
}

/**
 * Update a pull request
 */
export async function updatePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  data: UpdateData
): Promise<PullRequest> {
  const client = createClient({ owner, repo });
  return client.update(pullNumber, data);
}

/**
 * Merge a pull request
 */
export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  options: MergeOptions = {}
): Promise<MergeResult> {
  const client = createClient({ owner, repo });
  return client.merge(pullNumber, options);
}

/**
 * Close a pull request
 */
export async function closePullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequest> {
  const client = createClient({ owner, repo });
  return client.update(pullNumber, { state: 'closed' });
}

/**
 * Reopen a pull request
 */
export async function reopenPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequest> {
  const client = createClient({ owner, repo });
  return client.update(pullNumber, { state: 'open' });
}

export default {
  createClient,
  listPullRequests,
  getPullRequest,
  createPullRequest,
  updatePullRequest,
  mergePullRequest,
  closePullRequest,
  reopenPullRequest
};
