/**
 * @fileoverview GitHub Users Discovery API
 * @module DiscoveryAPI
 */

import { validateUsername, validateUserId, validatePagination } from '../utils/validation.js';
import { NotFoundError, ValidationError, UsersError } from '../utils/errors.js';
import { buildPaginationParams } from '../utils/pagination.js';
import type { HttpClient, RequestOptions } from '../client/http.js';

// Error objects from the HTTP layer carry a dynamic `.status`; narrowed at call sites.
type ErrorWithStatus = { status?: number };

/**
 * Options accepted by {@link DiscoveryAPI.list}.
 */
export interface ListUsersOptions extends RequestOptions {
  since?: number;
  per_page?: number;
  page?: number;
}

/**
 * Search criteria accepted by {@link DiscoveryAPI.search}.
 */
export interface UserSearchCriteria {
  type?: string;
  minId?: number;
  maxId?: number;
}

/**
 * A single failed multi-lookup entry.
 */
export interface UserLookupFailure {
  username: string;
  error: string;
}

/**
 * Result of {@link DiscoveryAPI.getMultipleByUsername}.
 */
export interface MultipleUsersResult {
  successful: any[];
  failed: UserLookupFailure[];
}

/**
 * User statistics returned by {@link DiscoveryAPI.getStats}.
 */
export interface UserStats {
  username: string;
  name: string;
  id: number;
  type: string;
  siteAdmin: boolean;
  publicRepos: number;
  publicGists: number;
  followers: number;
  following: number;
  accountAge: number | null;
  lastActivity: string;
  hasCompany: boolean;
  hasLocation: boolean;
  hasBlog: boolean;
  hasBio: boolean;
  hireable: boolean;
}

/**
 * Discovery API for public user operations
 */
export class DiscoveryAPI {
  http: HttpClient;

  /**
   * Create DiscoveryAPI instance
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * List users
   */
  async list(options: ListUsersOptions = {}): Promise<any[]> {
    const params = buildPaginationParams(validatePagination(options)) as Record<string, unknown>;

    try {
      const response = await this.http.get('/users', { params, ...options });
      return Array.isArray(response) ? response : [response];
    } catch (error) {
      throw new UsersError(`Failed to list users: ${(error as Error).message}`);
    }
  }

  /**
   * Get a user by username
   */
  async getByUsername(username: string, options: RequestOptions = {}): Promise<any> {
    if (!validateUsername(username)) {
      throw new ValidationError('Invalid username format');
    }

    try {
      const response = await this.http.get(`/users/${username}`, options);
      return response;
    } catch (error) {
      if ((error as ErrorWithStatus).status === 404) {
        throw new NotFoundError(`User '${username}' not found`);
      }
      throw error;
    }
  }

  /**
   * Get a user by ID
   */
  async getById(accountId: number, options: RequestOptions = {}): Promise<any> {
    if (!validateUserId(accountId)) {
      throw new ValidationError('Invalid user ID. Must be a positive integer.');
    }

    try {
      const response = await this.http.get(`/user/${accountId}`, options);
      return response;
    } catch (error) {
      if ((error as ErrorWithStatus).status === 404) {
        throw new NotFoundError(`User with ID '${accountId}' not found`);
      }
      throw error;
    }
  }

  /**
   * Search for users by various criteria
   */
  async search(criteria: UserSearchCriteria = {}, options: RequestOptions = {}): Promise<any[]> {
    const searchOptions: ListUsersOptions = { ...options };

    if (criteria.minId) {
      searchOptions.since = criteria.minId - 1;
    }

    let users = await this.list(searchOptions);

    // Apply client-side filtering
    if (criteria.type) {
      users = users.filter((user) => user.type === criteria.type);
    }

    if (criteria.maxId) {
      users = users.filter((user) => user.id <= criteria.maxId!);
    }

    return users;
  }

  /**
   * Check if a username exists
   */
  async exists(username: string, options: RequestOptions = {}): Promise<boolean> {
    try {
      await this.getByUsername(username, options);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get user's public repositories count
   */
  async getPublicReposCount(username: string, options: RequestOptions = {}): Promise<number> {
    const user = await this.getByUsername(username, options);
    return user.public_repos || 0;
  }

  /**
   * Get user's follower count
   */
  async getFollowerCount(username: string, options: RequestOptions = {}): Promise<number> {
    const user = await this.getByUsername(username, options);
    return user.followers || 0;
  }

  /**
   * Get user's following count
   */
  async getFollowingCount(username: string, options: RequestOptions = {}): Promise<number> {
    const user = await this.getByUsername(username, options);
    return user.following || 0;
  }

  /**
   * Get multiple users by usernames
   */
  async getMultipleByUsername(
    usernames: string[],
    options: { continueOnError?: boolean } & RequestOptions = {}
  ): Promise<MultipleUsersResult> {
    const successful: any[] = [];
    const failed: UserLookupFailure[] = [];

    for (const username of usernames) {
      try {
        const user = await this.getByUsername(username, options);
        successful.push(user);
      } catch (error) {
        if (options.continueOnError) {
          failed.push({
            username,
            error: (error as Error).message
          });
        } else {
          throw error;
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Get user statistics
   */
  async getStats(username: string, options: RequestOptions = {}): Promise<UserStats> {
    const user = await this.getByUsername(username, options);

    return {
      username: user.login,
      name: user.name,
      id: user.id,
      type: user.type,
      siteAdmin: user.site_admin,
      publicRepos: user.public_repos || 0,
      publicGists: user.public_gists || 0,
      followers: user.followers || 0,
      following: user.following || 0,
      accountAge: user.created_at ? this.calculateAccountAge(user.created_at) : null,
      lastActivity: user.updated_at,
      hasCompany: !!user.company,
      hasLocation: !!user.location,
      hasBlog: !!user.blog,
      hasBio: !!user.bio,
      hireable: user.hireable
    };
  }

  /**
   * Calculate account age in days
   */
  calculateAccountAge(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get users by type (User or Organization)
   */
  async getByType(type: string, options: RequestOptions = {}): Promise<any[]> {
    if (!['User', 'Organization'].includes(type)) {
      throw new ValidationError('Type must be either "User" or "Organization"');
    }

    return this.search({ type }, options);
  }

  /**
   * Get users in ID range
   */
  async getByIdRange(minId: number, maxId: number, options: RequestOptions = {}): Promise<any[]> {
    if (!validateUserId(minId) || !validateUserId(maxId)) {
      throw new ValidationError('Both minId and maxId must be positive integers');
    }

    if (minId > maxId) {
      throw new ValidationError('minId must be less than or equal to maxId');
    }

    return this.search({ minId, maxId }, options);
  }
}

/**
 * List users
 */
export async function list(http: HttpClient, options: ListUsersOptions = {}): Promise<any[]> {
  const api = new DiscoveryAPI(http);
  return api.list(options);
}

/**
 * Get a user by username
 */
export async function getByUsername(
  http: HttpClient,
  username: string,
  options: RequestOptions = {}
): Promise<any> {
  const api = new DiscoveryAPI(http);
  return api.getByUsername(username, options);
}

/**
 * Get a user by ID
 */
export async function getById(
  http: HttpClient,
  accountId: number,
  options: RequestOptions = {}
): Promise<any> {
  const api = new DiscoveryAPI(http);
  return api.getById(accountId, options);
}
