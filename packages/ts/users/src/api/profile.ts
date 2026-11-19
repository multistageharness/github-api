/**
 * @fileoverview GitHub Users Profile API
 * @module ProfileAPI
 */

import { validateUserUpdate, type UserUpdateData } from '../utils/validation.js';
import { UsersError, AuthError } from '../utils/errors.js';
import type { HttpClient, RequestOptions } from '../client/http.js';

// Error objects from the HTTP layer carry a dynamic `.status`; narrowed at call sites.
type ErrorWithStatus = { status?: number };

/**
 * Disk usage information returned by {@link ProfileAPI.getDiskUsage}.
 */
export interface DiskUsageInfo {
  diskUsage: number;
  privateRepos: number;
  totalPrivateRepos: number;
  collaborators: number;
}

/**
 * Permission check result returned by {@link ProfileAPI.checkPermissions}.
 */
export interface PermissionCheckResult {
  hasPermissions: boolean;
  requiredScopes: string[];
  availableScopes: string[];
  missingScopes: string[];
}

/**
 * Profile API for authenticated user operations
 */
export class ProfileAPI {
  http: HttpClient;

  /**
   * Create ProfileAPI instance
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get the authenticated user
   */
  async getAuthenticated(options: RequestOptions = {}): Promise<any> {
    try {
      const response = await this.http.get('/user', options);
      return response;
    } catch (error) {
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Authentication required. Please provide a valid GitHub token.');
      }
      throw error;
    }
  }

  /**
   * Update the authenticated user
   */
  async updateAuthenticated(userData: UserUpdateData, options: RequestOptions = {}): Promise<any> {
    // Validate user data
    const validatedData = validateUserUpdate(userData);

    try {
      const response = await this.http.patch('/user', validatedData, options);
      return response;
    } catch (error) {
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Authentication required. Please provide a valid GitHub token.');
      }
      if ((error as ErrorWithStatus).status === 403) {
        throw new AuthError('Insufficient permissions. This operation requires the `user` scope.');
      }
      throw error;
    }
  }

  /**
   * Get authenticated user's public profile information
   */
  async getPublicProfile(options: RequestOptions = {}): Promise<Record<string, unknown>> {
    const user = await this.getAuthenticated(options);

    // Filter to public fields only
    const publicFields = [
      'login', 'id', 'node_id', 'avatar_url', 'gravatar_id', 'url', 'html_url',
      'followers_url', 'following_url', 'gists_url', 'starred_url', 'subscriptions_url',
      'organizations_url', 'repos_url', 'events_url', 'received_events_url', 'type',
      'site_admin', 'name', 'company', 'blog', 'location', 'email', 'hireable',
      'bio', 'twitter_username', 'public_repos', 'public_gists', 'followers',
      'following', 'created_at', 'updated_at'
    ];

    const publicUser: Record<string, unknown> = {};
    publicFields.forEach((field) => {
      if (user[field] !== undefined) {
        publicUser[field] = user[field];
      }
    });

    return publicUser;
  }

  /**
   * Check if the authenticated user has specific permissions
   */
  async checkPermissions(scopes: string[] = []): Promise<PermissionCheckResult> {
    try {
      // Make a request to get rate limit info which includes scope information
      const response = await this.http.get('/rate_limit');

      // Extract scopes from headers if available
      const headers = response.headers || {};
      const tokenScopes: string[] = (headers['x-oauth-scopes'] || '').split(',').map((s: string) => s.trim());

      const hasScopes = scopes.every((scope) => tokenScopes.includes(scope));

      return {
        hasPermissions: hasScopes,
        requiredScopes: scopes,
        availableScopes: tokenScopes,
        missingScopes: scopes.filter((scope) => !tokenScopes.includes(scope))
      };
    } catch (error) {
      throw new UsersError(`Failed to check permissions: ${(error as Error).message}`);
    }
  }

  /**
   * Get user's plan information (if available)
   */
  async getPlan(options: RequestOptions = {}): Promise<any> {
    try {
      const user = await this.getAuthenticated(options);
      return user.plan || null;
    } catch {
      // If we can't get the authenticated user, we can't get plan info
      return null;
    }
  }

  /**
   * Get user's disk usage information (if available)
   */
  async getDiskUsage(options: RequestOptions = {}): Promise<DiskUsageInfo> {
    try {
      const user = await this.getAuthenticated(options);
      return {
        diskUsage: user.disk_usage || 0,
        privateRepos: user.owned_private_repos || 0,
        totalPrivateRepos: user.total_private_repos || 0,
        collaborators: user.collaborators || 0
      };
    } catch (error) {
      throw new UsersError(`Failed to get disk usage: ${(error as Error).message}`);
    }
  }
}

/**
 * Get the authenticated user
 */
export async function getAuthenticated(http: HttpClient, options: RequestOptions = {}): Promise<any> {
  const api = new ProfileAPI(http);
  return api.getAuthenticated(options);
}

/**
 * Update the authenticated user
 */
export async function updateAuthenticated(
  http: HttpClient,
  userData: UserUpdateData,
  options: RequestOptions = {}
): Promise<any> {
  const api = new ProfileAPI(http);
  return api.updateAuthenticated(userData, options);
}
