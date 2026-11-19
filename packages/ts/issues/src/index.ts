/**
 * GitHub Issues SDK
 *
 * Main entry point for the GitHub Issues API module
 */

import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import IssuesClient from './lib/client.js';
import RateLimitedIssuesClient from './lib/rateLimitedClient.js';
import { getAuth } from './lib/auth.js';
import type { IssuesClientOptions } from './lib/client.js';

// Export main classes and utilities
export { IssuesClient };
export { RateLimitedIssuesClient };
export { getAuth } from './lib/auth.js';
export { loadConfig, saveConfig, initConfig, resolveRepository } from './lib/config.js';
export * from './utils/errors.js';
export { paginate, collectAllPages } from './utils/pagination.js';
export * as format from './utils/format.js';

/** Options accepted by createClient and the convenience helpers. */
export interface CreateClientOptions extends IssuesClientOptions {
  enableRateLimiting?: boolean;
}

/** Options shared by the list helpers. */
export interface ListIssuesOptions extends CreateClientOptions {
  org?: string;
  [key: string]: unknown;
}

/**
 * Create a new GitHub Issues client
 */
export function createClient(options: CreateClientOptions = {}): IssuesClient {
  const auth = options.auth || getAuth();

  const clientOptions: IssuesClientOptions = {
    auth,
    baseUrl: options.baseUrl || DEFAULT_BASE_URL,
    owner: options.owner,
    repo: options.repo,
    ...options
  };

  // Use rate-limited client by default unless explicitly disabled
  if (options.enableRateLimiting !== false && process.env['NODE_ENV'] !== 'test') {
    return new RateLimitedIssuesClient(clientOptions);
  }

  return new IssuesClient(clientOptions);
}

/**
 * Quick access methods for common operations
 */

/**
 * List issues
 */
export async function listIssues(options: ListIssuesOptions = {}): Promise<unknown> {
  const client = createClient(options);

  if (options.org) {
    return client.listForOrg(options.org, options);
  }

  if (options.owner && options.repo) {
    return client.listForRepo(options);
  }

  return client.list(options);
}

/**
 * Get a specific issue
 */
export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.get(issueNumber);
}

/**
 * Create a new issue
 */
export async function createIssue(
  owner: string,
  repo: string,
  data: unknown,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.create(data);
}

/**
 * Update an issue
 */
export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  data: unknown,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.update(issueNumber, data);
}

/**
 * Close an issue
 */
export async function closeIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  options: CreateClientOptions & { reason?: string } = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.update(issueNumber, { state: 'closed', state_reason: options.reason || 'completed' });
}

/**
 * Reopen an issue
 */
export async function reopenIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.update(issueNumber, { state: 'open' });
}

/**
 * Add a comment to an issue
 */
export async function addComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.createComment(issueNumber, body);
}

/**
 * Update a comment
 */
export async function updateComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.updateComment(commentId, body);
}

/**
 * Delete a comment
 */
export async function deleteComment(
  owner: string,
  repo: string,
  commentId: number,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.deleteComment(commentId);
}

/**
 * Add labels to an issue
 */
export async function addLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[],
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.addLabels(issueNumber, labels);
}

/**
 * Remove a label from an issue
 */
export async function removeLabel(
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.removeLabel(issueNumber, label);
}

/**
 * Add assignees to an issue
 */
export async function addAssignees(
  owner: string,
  repo: string,
  issueNumber: number,
  assignees: string[],
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.addAssignees(issueNumber, assignees);
}

/**
 * Remove assignees from an issue
 */
export async function removeAssignees(
  owner: string,
  repo: string,
  issueNumber: number,
  assignees: string[],
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.removeAssignees(issueNumber, assignees);
}

/**
 * Lock an issue
 */
export async function lockIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  lockReason: string | null = null,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.lock(issueNumber, lockReason);
}

/**
 * Unlock an issue
 */
export async function unlockIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  options: CreateClientOptions = {}
): Promise<unknown> {
  const client = createClient({ owner, repo, ...options });
  return client.unlock(issueNumber);
}

// Default export
export default {
  createClient,
  IssuesClient,
  RateLimitedIssuesClient,
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,
  reopenIssue,
  addComment,
  updateComment,
  deleteComment,
  addLabels,
  removeLabel,
  addAssignees,
  removeAssignees,
  lockIssue,
  unlockIssue
};
