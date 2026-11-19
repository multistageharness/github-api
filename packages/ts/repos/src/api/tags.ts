/**
 * @fileoverview Tags API endpoints
 * @module api/tags
 */

import {
  validateRepositoryName,
  validateUsername,
  validateTagName,
  validatePagination
} from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import type { HTTPClient } from '../client/http.js';

/**
 * Listing options for tags/releases.
 */
export interface TagListOptions {
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/**
 * Data accepted by create (annotated tag).
 */
export interface TagData {
  tag: string;
  message?: string;
  object?: string;
  type?: string;
  tagger?: unknown;
}

/**
 * Data accepted by createRelease.
 */
export interface ReleaseData {
  tag_name: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  generate_release_notes?: boolean;
}

/**
 * Options accepted by createSemanticTag.
 */
export interface SemanticTagOptions {
  annotated?: boolean;
  message?: string;
  tagger?: unknown;
}

/**
 * List repository tags
 */
export async function list(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: TagListOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validatePagination(options);

  const params = new URLSearchParams({
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/repos/${owner}/${repo}/tags?${params.toString()}`);
}

/**
 * Get a specific tag
 */
export async function get(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tag: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(tag);

  return await httpClient.get(`/repos/${owner}/${repo}/git/refs/tags/${encodeURIComponent(tag)}`);
}

/**
 * Create a tag
 */
export async function create(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tagData: TagData
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(tagData.tag);

  if (!tagData.object) {
    throw new ValidationError('Tag object (SHA) is required', 'object');
  }

  if (!tagData.type) {
    throw new ValidationError('Tag type is required', 'type');
  }

  const validTypes = ['commit', 'tree', 'blob'];
  if (!validTypes.includes(tagData.type)) {
    throw new ValidationError(`Tag type must be one of: ${validTypes.join(', ')}`, 'type', tagData.type);
  }

  const payload = {
    tag: tagData.tag,
    message: tagData.message || `Release ${tagData.tag}`,
    object: tagData.object,
    type: tagData.type,
    tagger: tagData.tagger || undefined
  };

  return await httpClient.post(`/repos/${owner}/${repo}/git/tags`, payload);
}

/**
 * Create a lightweight tag (reference)
 */
export async function createRef(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tag: string,
  sha: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(tag);

  if (!sha) {
    throw new ValidationError('SHA is required', 'sha');
  }

  const payload = {
    ref: `refs/tags/${tag}`,
    sha
  };

  return await httpClient.post(`/repos/${owner}/${repo}/git/refs`, payload);
}

/**
 * Delete a tag
 */
export async function deleteTag(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tag: string
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(tag);

  await httpClient.delete(`/repos/${owner}/${repo}/git/refs/tags/${encodeURIComponent(tag)}`);
  return { message: `Tag ${tag} deleted successfully` };
}

/**
 * Get tag protection rules
 */
export async function getProtection(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/tags/protection`);
}

/**
 * Create tag protection rule
 */
export async function createProtection(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  pattern: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  if (!pattern) {
    throw new ValidationError('Tag pattern is required', 'pattern');
  }

  const payload = { pattern };

  return await httpClient.post(`/repos/${owner}/${repo}/tags/protection`, payload);
}

/**
 * Delete tag protection rule
 */
export async function deleteProtection(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tagProtectionId: string | number
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  if (!tagProtectionId) {
    throw new ValidationError('Tag protection ID is required', 'tagProtectionId');
  }

  await httpClient.delete(`/repos/${owner}/${repo}/tags/protection/${tagProtectionId}`);
  return { message: 'Tag protection rule deleted successfully' };
}

/**
 * List releases (which are typically associated with tags)
 */
export async function listReleases(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: TagListOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validatePagination(options);

  const params = new URLSearchParams({
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/repos/${owner}/${repo}/releases?${params.toString()}`);
}

/**
 * Get a release by tag
 */
export async function getReleaseByTag(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tag: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(tag);

  return await httpClient.get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
}

/**
 * Create a release from a tag
 */
export async function createRelease(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  releaseData: ReleaseData
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(releaseData.tag_name);

  const payload = {
    tag_name: releaseData.tag_name,
    target_commitish: releaseData.target_commitish || 'main',
    name: releaseData.name || releaseData.tag_name,
    body: releaseData.body || '',
    draft: releaseData.draft === true,
    prerelease: releaseData.prerelease === true,
    generate_release_notes: releaseData.generate_release_notes === true
  };

  return await httpClient.post(`/repos/${owner}/${repo}/releases`, payload);
}

/**
 * Compare two tags
 */
export async function compare(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/compare/${base}...${head}`);
}

/**
 * Get tag commit information
 */
export async function getCommit(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tag: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateTagName(tag);

  // First get the tag reference
  const tagRef = (await get(httpClient, owner, repo, tag)) as {
    object?: { type?: string; sha?: string };
  };

  // Then get the commit information
  if (tagRef.object && tagRef.object.type === 'commit') {
    return await httpClient.get(`/repos/${owner}/${repo}/git/commits/${tagRef.object.sha}`);
  } else if (tagRef.object && tagRef.object.type === 'tag') {
    // Annotated tag - get the tag object first
    const tagObject = (await httpClient.get(
      `/repos/${owner}/${repo}/git/tags/${tagRef.object.sha}`
    )) as { object: { sha: string } };
    return await httpClient.get(`/repos/${owner}/${repo}/git/commits/${tagObject.object.sha}`);
  }

  throw new Error('Unable to resolve tag to commit');
}

/**
 * Get latest tag
 */
export async function getLatest(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  const tags = (await list(httpClient, owner, repo, { per_page: 1 })) as unknown[];
  return tags.length > 0 ? tags[0] : null;
}

/**
 * Check if tag exists
 */
export async function exists(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  tag: string
): Promise<boolean> {
  try {
    await get(httpClient, owner, repo, tag);
    return true;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Get tags with pagination support
 */
export async function getAllTags(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown[]> {
  validateUsername(owner);
  validateRepositoryName(repo);

  let allTags: unknown[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const tags = (await list(httpClient, owner, repo, { page, per_page: 100 })) as unknown[];
    allTags = allTags.concat(tags);
    hasMore = tags.length === 100;
    page++;

    // Safety check
    if (page > 100) break;
  }

  return allTags;
}

/**
 * Create semantic version tag
 */
export async function createSemanticTag(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  version: string,
  sha: string,
  options: SemanticTagOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  // Validate semantic version format
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\-.]+))?(?:\+([a-zA-Z0-9\-.]+))?$/;
  if (!semverRegex.test(version)) {
    throw new ValidationError('Invalid semantic version format', 'version', version);
  }

  const tagName = version.startsWith('v') ? version : `v${version}`;

  if (options.annotated) {
    // Create annotated tag
    const tagData: TagData = {
      tag: tagName,
      message: options.message || `Release ${tagName}`,
      object: sha,
      type: 'commit',
      tagger: options.tagger
    };

    const tag = (await create(httpClient, owner, repo, tagData)) as { sha: string };
    await createRef(httpClient, owner, repo, tagName, tag.sha);

    return tag;
  } else {
    // Create lightweight tag
    return await createRef(httpClient, owner, repo, tagName, sha);
  }
}

/**
 * Get next semantic version
 */
export function getNextSemanticVersion(currentVersion: string, increment = 'patch'): string {
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\-.]+))?(?:\+([a-zA-Z0-9\-.]+))?$/;
  const match = currentVersion.match(semverRegex);

  if (!match) {
    throw new ValidationError('Invalid semantic version format', 'version', currentVersion);
  }

  const major = parseInt(match[1] as string);
  const minor = parseInt(match[2] as string);
  const patch = parseInt(match[3] as string);

  switch (increment) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new ValidationError('Increment must be major, minor, or patch', 'increment', increment);
  }
}

/**
 * Sort tags by semantic version
 */
export function sortTagsBySemanticVersion<T extends { name: string }>(
  tags: T[],
  descending = true
): T[] {
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\-.]+))?(?:\+([a-zA-Z0-9\-.]+))?$/;

  return tags.sort((a, b) => {
    const aMatch = a.name.match(semverRegex);
    const bMatch = b.name.match(semverRegex);

    // Non-semver tags go to the end
    if (!aMatch && !bMatch) return 0;
    if (!aMatch) return 1;
    if (!bMatch) return -1;

    const aVersion = [
      parseInt(aMatch[1] as string),
      parseInt(aMatch[2] as string),
      parseInt(aMatch[3] as string)
    ];
    const bVersion = [
      parseInt(bMatch[1] as string),
      parseInt(bMatch[2] as string),
      parseInt(bMatch[3] as string)
    ];

    for (let i = 0; i < 3; i++) {
      if (aVersion[i] !== bVersion[i]) {
        return descending
          ? (bVersion[i] as number) - (aVersion[i] as number)
          : (aVersion[i] as number) - (bVersion[i] as number);
      }
    }

    return 0;
  });
}
