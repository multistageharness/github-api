/**
 * @fileoverview Repository API endpoints
 * @module api/repositories
 */

import {
  validateRepositoryName,
  validateUsername,
  validateRepository,
  validatePagination,
  validateSort
} from '../utils/validation.js';
import type { RepositoryData } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import type { HTTPClient } from '../client/http.js';

/**
 * Query options for repository listing endpoints.
 */
export interface RepoListOptions {
  type?: string;
  visibility?: string;
  affiliation?: string;
  sort?: string;
  direction?: string;
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/**
 * Options accepted by the fork endpoint.
 */
export interface ForkOptions {
  organization?: string;
  name?: string;
  default_branch_only?: boolean;
  [key: string]: unknown;
}

/**
 * Options accepted by getContributors.
 */
export interface ContributorsOptions {
  anon?: boolean;
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/**
 * Get a repository
 */
export async function get(httpClient: HTTPClient, owner: string, repo: string): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}`);
}

/**
 * List repositories for a user
 */
export async function listForUser(
  httpClient: HTTPClient,
  username: string,
  options: RepoListOptions = {}
): Promise<unknown> {
  validateUsername(username);
  validatePagination(options);
  validateSort(options, ['created', 'updated', 'pushed', 'full_name']);

  const params = new URLSearchParams({
    type: options.type || 'all',
    sort: options.sort || 'updated',
    direction: options.direction || 'desc',
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/users/${username}/repos?${params.toString()}`);
}

/**
 * List repositories for the authenticated user
 */
export async function listForAuthenticatedUser(
  httpClient: HTTPClient,
  options: RepoListOptions = {}
): Promise<unknown> {
  validatePagination(options);
  validateSort(options, ['created', 'updated', 'pushed', 'full_name']);

  const params = new URLSearchParams({
    visibility: options.visibility || 'all',
    affiliation: options.affiliation || 'owner,collaborator,organization_member',
    type: options.type || 'all',
    sort: options.sort || 'updated',
    direction: options.direction || 'desc',
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/user/repos?${params.toString()}`);
}

/**
 * List organization repositories
 */
export async function listForOrg(
  httpClient: HTTPClient,
  org: string,
  options: RepoListOptions = {}
): Promise<unknown> {
  validateUsername(org);
  validatePagination(options);
  validateSort(options, ['created', 'updated', 'pushed', 'full_name']);

  const params = new URLSearchParams({
    type: options.type || 'all',
    sort: options.sort || 'updated',
    direction: options.direction || 'desc',
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/orgs/${org}/repos?${params.toString()}`);
}

/**
 * Create a repository for the authenticated user
 */
export async function create(httpClient: HTTPClient, repoData: RepositoryData): Promise<unknown> {
  validateRepository(repoData);

  const payload = {
    name: repoData.name,
    description: repoData.description || null,
    homepage: repoData.homepage || null,
    private: repoData.private || false,
    has_issues: repoData.has_issues !== undefined ? repoData.has_issues : true,
    has_projects: repoData.has_projects !== undefined ? repoData.has_projects : true,
    has_wiki: repoData.has_wiki !== undefined ? repoData.has_wiki : true,
    has_discussions: repoData.has_discussions || false,
    is_template: repoData.is_template || false,
    auto_init: repoData.auto_init || false,
    gitignore_template: repoData.gitignore_template || null,
    license_template: repoData.license_template || null,
    allow_squash_merge: repoData.allow_squash_merge !== undefined ? repoData.allow_squash_merge : true,
    allow_merge_commit: repoData.allow_merge_commit !== undefined ? repoData.allow_merge_commit : true,
    allow_rebase_merge: repoData.allow_rebase_merge !== undefined ? repoData.allow_rebase_merge : true,
    allow_auto_merge: repoData.allow_auto_merge || false,
    delete_branch_on_merge: repoData.delete_branch_on_merge || false,
    allow_update_branch: repoData.allow_update_branch || false,
    squash_merge_commit_title: repoData.squash_merge_commit_title || null,
    squash_merge_commit_message: repoData.squash_merge_commit_message || null,
    merge_commit_title: repoData.merge_commit_title || null,
    merge_commit_message: repoData.merge_commit_message || null
  };

  // Add topics if provided
  if (repoData.topics && Array.isArray(repoData.topics)) {
    // Topics are set separately after creation
    // repository response is dynamically shaped
    const repository = (await httpClient.post('/user/repos', payload)) as {
      owner: { login: string };
      name: string;
    };
    await replaceAllTopics(httpClient, repository.owner.login, repository.name, repoData.topics);
    return repository;
  }

  return await httpClient.post('/user/repos', payload);
}

/**
 * Create a repository in an organization
 */
export async function createInOrg(
  httpClient: HTTPClient,
  org: string,
  repoData: RepositoryData
): Promise<unknown> {
  validateUsername(org);
  validateRepository(repoData);

  const payload = {
    name: repoData.name,
    description: repoData.description || null,
    homepage: repoData.homepage || null,
    private: repoData.private || false,
    visibility: repoData.visibility || (repoData.private ? 'private' : 'public'),
    has_issues: repoData.has_issues !== undefined ? repoData.has_issues : true,
    has_projects: repoData.has_projects !== undefined ? repoData.has_projects : true,
    has_wiki: repoData.has_wiki !== undefined ? repoData.has_wiki : true,
    has_discussions: repoData.has_discussions || false,
    is_template: repoData.is_template || false,
    team_id: repoData.team_id || null,
    auto_init: repoData.auto_init || false,
    gitignore_template: repoData.gitignore_template || null,
    license_template: repoData.license_template || null,
    allow_squash_merge: repoData.allow_squash_merge !== undefined ? repoData.allow_squash_merge : true,
    allow_merge_commit: repoData.allow_merge_commit !== undefined ? repoData.allow_merge_commit : true,
    allow_rebase_merge: repoData.allow_rebase_merge !== undefined ? repoData.allow_rebase_merge : true,
    allow_auto_merge: repoData.allow_auto_merge || false,
    delete_branch_on_merge: repoData.delete_branch_on_merge || false,
    allow_update_branch: repoData.allow_update_branch || false
  };

  // repository response is dynamically shaped
  const repository = (await httpClient.post(`/orgs/${org}/repos`, payload)) as { name: string };

  // Add topics if provided
  if (repoData.topics && Array.isArray(repoData.topics)) {
    await replaceAllTopics(httpClient, org, repository.name, repoData.topics);
  }

  return repository;
}

/**
 * Update a repository
 */
export async function update(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  updates: Record<string, unknown>
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  // Validate the updates
  if (updates['name']) {
    validateRepositoryName(updates['name']);
  }

  const payload: Record<string, unknown> = {
    ...updates
  };

  // Remove topics from payload as they need special handling
  if (payload['topics']) {
    const topics = payload['topics'] as string[];
    delete payload['topics'];

    const repository = await httpClient.patch(`/repos/${owner}/${repo}`, payload);
    await replaceAllTopics(httpClient, owner, repo, topics);
    return repository;
  }

  return await httpClient.patch(`/repos/${owner}/${repo}`, payload);
}

/**
 * Delete a repository
 */
export async function deleteRepo(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.delete(`/repos/${owner}/${repo}`);
  return { message: 'Repository deleted successfully' };
}

/**
 * Get repository topics
 */
export async function getAllTopics(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/topics`);
}

/**
 * Replace all repository topics
 */
export async function replaceAllTopics(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  topics: unknown
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  if (!Array.isArray(topics)) {
    throw new ValidationError('Topics must be an array', 'topics', topics);
  }

  if (topics.length > 20) {
    throw new ValidationError('Cannot have more than 20 topics', 'topics', topics.length);
  }

  // Validate each topic
  for (const topic of topics) {
    if (typeof topic !== 'string') {
      throw new ValidationError('All topics must be strings', 'topics', topic);
    }
    if (topic.length > 50) {
      throw new ValidationError(`Topic "${topic}" must be 50 characters or less`, 'topics', topic);
    }
    if (!/^[a-z0-9-]+$/.test(topic)) {
      throw new ValidationError(
        `Topic "${topic}" can only contain lowercase letters, numbers, and hyphens`,
        'topics',
        topic
      );
    }
  }

  return await httpClient.put(`/repos/${owner}/${repo}/topics`, { names: topics });
}

/**
 * Get repository languages
 */
export async function getLanguages(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/languages`);
}

/**
 * Get repository contributors
 */
export async function getContributors(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: ContributorsOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validatePagination(options);

  const params = new URLSearchParams({
    anon: options.anon ? '1' : '0',
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/repos/${owner}/${repo}/contributors?${params.toString()}`);
}

/**
 * Get repository statistics
 */
export async function getStats(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{
  languages: unknown;
  contributors: unknown;
  commits: unknown;
  participation: unknown;
}> {
  validateUsername(owner);
  validateRepositoryName(repo);

  const [languages, contributors, commits, participation] = await Promise.allSettled([
    getLanguages(httpClient, owner, repo),
    getContributors(httpClient, owner, repo),
    httpClient.get(`/repos/${owner}/${repo}/stats/commit_activity`),
    httpClient.get(`/repos/${owner}/${repo}/stats/participation`)
  ]);

  return {
    languages: languages.status === 'fulfilled' ? languages.value : null,
    contributors: contributors.status === 'fulfilled' ? contributors.value : null,
    commits: commits.status === 'fulfilled' ? commits.value : null,
    participation: participation.status === 'fulfilled' ? participation.value : null
  };
}

/**
 * Fork a repository
 */
export async function fork(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: ForkOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  const payload: Record<string, unknown> = {};

  if (options.organization) {
    validateUsername(options.organization);
    payload['organization'] = options.organization;
  }

  if (options.name) {
    validateRepositoryName(options.name);
    payload['name'] = options.name;
  }

  if (options.default_branch_only !== undefined) {
    payload['default_branch_only'] = options.default_branch_only;
  }

  return await httpClient.post(`/repos/${owner}/${repo}/forks`, payload);
}

/**
 * List forks of a repository
 */
export async function listForks(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: RepoListOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validatePagination(options);
  validateSort(options, ['newest', 'oldest', 'stargazers', 'watchers']);

  const params = new URLSearchParams({
    sort: options.sort || 'newest',
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/repos/${owner}/${repo}/forks?${params.toString()}`);
}

/**
 * Transfer repository ownership
 */
export async function transfer(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  newOwner: string,
  teamIds: number[] = []
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateUsername(newOwner);

  const payload: Record<string, unknown> = {
    new_owner: newOwner
  };

  if (Array.isArray(teamIds) && teamIds.length > 0) {
    payload['team_ids'] = teamIds;
  }

  return await httpClient.post(`/repos/${owner}/${repo}/transfer`, payload);
}

/**
 * Check if repository is starred by authenticated user
 */
export async function checkIfStarred(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<boolean> {
  validateUsername(owner);
  validateRepositoryName(repo);

  try {
    await httpClient.get(`/user/starred/${owner}/${repo}`);
    return true;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Star a repository
 */
export async function star(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.put(`/user/starred/${owner}/${repo}`);
  return { message: 'Repository starred successfully' };
}

/**
 * Unstar a repository
 */
export async function unstar(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.delete(`/user/starred/${owner}/${repo}`);
  return { message: 'Repository unstarred successfully' };
}

/**
 * Check if repository is watched by authenticated user
 */
export async function checkIfWatched(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<boolean> {
  validateUsername(owner);
  validateRepositoryName(repo);

  try {
    const response = (await httpClient.get(`/repos/${owner}/${repo}/subscription`)) as {
      subscribed?: boolean;
    };
    return response.subscribed === true;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Watch a repository
 */
export async function watch(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  subscribed = true,
  ignored = false
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  const payload = {
    subscribed,
    ignored
  };

  return await httpClient.put(`/repos/${owner}/${repo}/subscription`, payload);
}

/**
 * Unwatch a repository
 */
export async function unwatch(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.delete(`/repos/${owner}/${repo}/subscription`);
  return { message: 'Repository unwatched successfully' };
}

/**
 * Generate repository name suggestions
 */
export function generateNameSuggestions(baseName: string): string[] {
  const suggestions: string[] = [];
  const timestamp = Date.now().toString(36);

  // Basic variations
  suggestions.push(baseName);
  suggestions.push(`${baseName}-project`);
  suggestions.push(`${baseName}-app`);
  suggestions.push(`${baseName}-api`);
  suggestions.push(`${baseName}-cli`);

  // With timestamp/random
  suggestions.push(`${baseName}-${timestamp}`);
  suggestions.push(`${baseName}-${Math.random().toString(36).substr(2, 4)}`);

  // Common patterns
  suggestions.push(`my-${baseName}`);
  suggestions.push(`awesome-${baseName}`);
  suggestions.push(`${baseName}-toolkit`);
  suggestions.push(`${baseName}-utils`);

  return suggestions.filter((name) => {
    try {
      validateRepositoryName(name);
      return true;
    } catch {
      return false;
    }
  });
}
