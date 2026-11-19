/**
 * @fileoverview GitHub Repository SDK - Main entry point for library usage
 * @module @internal/github-sdk-repos
 * @version 1.0.0
 */

import { RepoClient } from './client/RepoClient.js';
import type { RepoClientOptions } from './client/RepoClient.js';
import * as repositories from './api/repositories.js';
import * as collaborators from './api/collaborators.js';
import * as branches from './api/branches.js';
import * as tags from './api/tags.js';
import * as webhooks from './api/webhooks.js';
import * as security from './api/security.js';
import * as rules from './api/rules.js';
import { RepoError, AuthError, ValidationError, RateLimitError } from './utils/errors.js';
import { paginate, paginateAll } from './utils/pagination.js';
import { validateInput, validateRepository } from './utils/validation.js';
import type { RepositoryData } from './utils/validation.js';
import type { RepoListOptions } from './api/repositories.js';
import { PACKAGE_NAME, VERSION } from './version.js';

/**
 * Create a new GitHub Repository API client
 *
 * @example
 * ```javascript
 * import { createClient } from '@internal/github-sdk-repos';
 *
 * const client = createClient({
 *   token: process.env.GITHUB_TOKEN,
 *   rateLimiting: { enabled: true }
 * });
 *
 * // Get repository information
 * const repo = await client.repositories.get('octocat', 'Hello-World');
 * console.log(`Repository: ${repo.full_name}`);
 * ```
 */
export function createClient(options: RepoClientOptions = {}): RepoClient {
  return new RepoClient(options);
}

/**
 * Default export - RepoClient class
 */
export default RepoClient;

/**
 * Named exports for direct API usage
 */
export {
  // Client
  RepoClient,
  // API modules
  repositories,
  collaborators,
  branches,
  tags,
  webhooks,
  security,
  rules,
  // Error classes
  RepoError,
  AuthError,
  ValidationError,
  RateLimitError,
  // Utility functions
  paginate,
  paginateAll,
  validateInput,
  validateRepository
};

/**
 * Convenience method to quickly get a repository
 *
 * @example
 * ```javascript
 * import { getRepository } from '@internal/github-sdk-repos';
 *
 * const repo = await getRepository('octocat', 'Hello-World', {
 *   token: process.env.GITHUB_TOKEN
 * });
 * ```
 */
export async function getRepository(
  owner: string,
  repo: string,
  options: RepoClientOptions = {}
): Promise<unknown> {
  const client = createClient(options);
  return await client.repositories.get(owner, repo);
}

/**
 * Convenience method to list user repositories
 *
 * @example
 * ```javascript
 * import { listRepositories } from '@internal/github-sdk-repos';
 *
 * const repos = await listRepositories('octocat', {
 *   token: process.env.GITHUB_TOKEN,
 *   type: 'public',
 *   sort: 'updated'
 * });
 * ```
 */
export async function listRepositories(
  username?: string,
  options: RepoClientOptions & RepoListOptions = {}
): Promise<unknown> {
  const client = createClient(options);
  if (username) {
    return await client.repositories.listForUser(username, options);
  }
  return await client.repositories.listForAuthenticatedUser(options);
}

/**
 * Convenience method to create a repository
 *
 * @example
 * ```javascript
 * import { createRepository } from '@internal/github-sdk-repos';
 *
 * const repo = await createRepository({
 *   name: 'my-new-repo',
 *   description: 'A test repository',
 *   private: false
 * }, {
 *   token: process.env.GITHUB_TOKEN
 * });
 * ```
 */
export async function createRepository(
  repoData: RepositoryData,
  options: RepoClientOptions = {}
): Promise<unknown> {
  const client = createClient(options);
  return await client.repositories.create(repoData);
}

/**
 * Package metadata
 */
export const packageInfo = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'GitHub Repository API client and CLI',
  homepage: 'https://github.com/multistageharness-com/RCM-github/tree/main/github-api/v100/packages/ts/repos'
};
