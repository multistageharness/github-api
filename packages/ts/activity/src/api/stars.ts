/**
 * GitHub Stars API
 * @module api/stars
 */

import { buildPaginationParams, Paginator } from '../utils/pagination.js';
import type { PaginationOptions, PageResult } from '../utils/pagination.js';
import type { HttpClient } from '../client/http.js';
import { APIError } from '../utils/errors.js';
import type { Stargazer, StarredRepository, SimpleUser, RateLimit } from '../models/types.js';

/**
 * Options for the star listing endpoints.
 */
export interface StarListOptions extends PaginationOptions {
  withTimestamps?: boolean;
}

/**
 * A repo identifier pair.
 */
export interface RepoRef {
  owner: string;
  repo: string;
}

/**
 * Result entry for bulk star/unstar operations.
 */
export interface BulkStarResult {
  owner: string;
  repo: string;
  success: boolean;
  error?: unknown;
}

/**
 * A single star history entry.
 */
export interface StarHistoryEntry {
  user: SimpleUser | null;
  starred_at: string;
}

/**
 * Star statistics shape.
 */
export interface StarStatistics {
  total: number;
  byMonth: Record<string, number>;
  byYear: Record<string, number>;
  recent: {
    lastDay: number;
    lastWeek: number;
    lastMonth: number;
  };
}

/**
 * Stars API endpoints
 */
export class StarsAPI {
  http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * List stargazers for a repository
   */
  async listStargazers(
    owner: string,
    repo: string,
    options: StarListOptions = {}
  ): Promise<PageResult<Stargazer | SimpleUser>> {
    const params = buildPaginationParams(options);
    const headers: Record<string, string> = {};

    // Request star creation timestamps
    if (options.withTimestamps) {
      headers['Accept'] = 'application/vnd.github.star+json';
    }

    const response = await this.http.client.get<(SimpleUser | Stargazer)[]>(
      `/repos/${owner}/${repo}/stargazers`,
      { params, headers }
    );

    const meta = this.http.buildMeta(response);
    return {
      data: response.data,
      pagination: meta.pagination,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * List repositories starred by a user
   */
  async listStarredByUser(
    username: string,
    options: StarListOptions = {}
  ): Promise<PageResult<StarredRepository>> {
    const params = buildPaginationParams(options);
    const headers: Record<string, string> = {};

    // Request star creation timestamps
    if (options.withTimestamps) {
      headers['Accept'] = 'application/vnd.github.star+json';
    }

    const response = await this.http.client.get<StarredRepository[]>(
      `/users/${username}/starred`,
      { params, headers }
    );

    const meta = this.http.buildMeta(response);
    return {
      data: response.data,
      pagination: meta.pagination,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * List repositories starred by authenticated user
   */
  async listStarredByAuthUser(
    options: StarListOptions = {}
  ): Promise<PageResult<StarredRepository>> {
    const params = buildPaginationParams(options);
    const headers: Record<string, string> = {};

    // Request star creation timestamps
    if (options.withTimestamps) {
      headers['Accept'] = 'application/vnd.github.star+json';
    }

    const response = await this.http.client.get<StarredRepository[]>('/user/starred', {
      params,
      headers
    });

    const meta = this.http.buildMeta(response);
    return {
      data: response.data,
      pagination: meta.pagination,
      rateLimit: meta.rateLimit
    };
  }

  /**
   * Check if a repository is starred by authenticated user
   */
  async checkIfStarred(owner: string, repo: string): Promise<boolean> {
    try {
      await this.http.get(`/user/starred/${owner}/${repo}`);
      return true;
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Star a repository for authenticated user
   */
  async starRepo(owner: string, repo: string): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.put(`/user/starred/${owner}/${repo}`);
  }

  /**
   * Unstar a repository for authenticated user
   */
  async unstarRepo(owner: string, repo: string): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.delete(`/user/starred/${owner}/${repo}`);
  }

  /**
   * Get paginator for stargazers
   */
  getStargazersPaginator(
    owner: string,
    repo: string,
    options: StarListOptions = {}
  ): Paginator<Stargazer | SimpleUser> {
    return new Paginator<Stargazer | SimpleUser>(
      (params) => this.listStargazers(owner, repo, params),
      options
    );
  }

  /**
   * Get paginator for starred repositories by user
   */
  getStarredPaginator(
    username: string,
    options: StarListOptions = {}
  ): Paginator<StarredRepository> {
    return new Paginator<StarredRepository>(
      (params) => this.listStarredByUser(username, params),
      options
    );
  }

  /**
   * Get paginator for starred repositories by authenticated user
   */
  getAuthStarredPaginator(options: StarListOptions = {}): Paginator<StarredRepository> {
    return new Paginator<StarredRepository>(
      (params) => this.listStarredByAuthUser(params),
      options
    );
  }

  /**
   * Star multiple repositories
   */
  async starMultiple(repos: RepoRef[]): Promise<BulkStarResult[]> {
    const promises = repos.map(({ owner, repo }) =>
      this.starRepo(owner, repo)
        .then(() => ({ owner, repo, success: true }))
        .catch((error: unknown) => ({ owner, repo, success: false, error }))
    );
    return Promise.all(promises);
  }

  /**
   * Unstar multiple repositories
   */
  async unstarMultiple(repos: RepoRef[]): Promise<BulkStarResult[]> {
    const promises = repos.map(({ owner, repo }) =>
      this.unstarRepo(owner, repo)
        .then(() => ({ owner, repo, success: true }))
        .catch((error: unknown) => ({ owner, repo, success: false, error }))
    );
    return Promise.all(promises);
  }

  /**
   * Get star count for a repository
   */
  async getStarCount(owner: string, repo: string): Promise<number> {
    const response = await this.http.get<{ stargazers_count: number }>(`/repos/${owner}/${repo}`);
    return (response.data as unknown as { stargazers_count: number }).stargazers_count;
  }

  /**
   * Get star history for a repository
   */
  async getStarHistory(
    owner: string,
    repo: string,
    options: StarListOptions = {}
  ): Promise<StarHistoryEntry[]> {
    const stargazers: StarHistoryEntry[] = [];
    const paginator = this.getStargazersPaginator(owner, repo, {
      ...options,
      withTimestamps: true
    });

    for await (const stargazer of paginator) {
      const sg = stargazer as Stargazer;
      if (sg.starred_at) {
        stargazers.push({
          user: sg.user,
          starred_at: sg.starred_at
        });
      }
    }

    return stargazers.sort(
      (a, b) => new Date(a.starred_at).getTime() - new Date(b.starred_at).getTime()
    );
  }

  /**
   * Get star statistics for a repository
   */
  async getStarStatistics(owner: string, repo: string): Promise<StarStatistics> {
    const stats: StarStatistics = {
      total: 0,
      byMonth: {},
      byYear: {},
      recent: {
        lastDay: 0,
        lastWeek: 0,
        lastMonth: 0
      }
    };

    // Get total count
    stats.total = await this.getStarCount(owner, repo);

    // Get star history with timestamps
    const history = await this.getStarHistory(owner, repo, {
      per_page: 100
    });

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const star of history) {
      const date = new Date(star.starred_at);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const year = String(date.getFullYear());

      // Count by month
      stats.byMonth[yearMonth] = (stats.byMonth[yearMonth] || 0) + 1;

      // Count by year
      stats.byYear[year] = (stats.byYear[year] || 0) + 1;

      // Count recent
      if (date > dayAgo) stats.recent.lastDay++;
      if (date > weekAgo) stats.recent.lastWeek++;
      if (date > monthAgo) stats.recent.lastMonth++;
    }

    return stats;
  }

  /**
   * Find mutual stargazers between repositories
   */
  async findMutualStargazers(repo1: RepoRef, repo2: RepoRef): Promise<SimpleUser[]> {
    const [stargazers1, stargazers2] = await Promise.all([
      this.http.fetchAllPages<SimpleUser>(`/repos/${repo1.owner}/${repo1.repo}/stargazers`),
      this.http.fetchAllPages<SimpleUser>(`/repos/${repo2.owner}/${repo2.repo}/stargazers`)
    ]);

    const users1 = new Set(stargazers1.map((s) => s.login));
    const mutual = stargazers2.filter((s) => users1.has(s.login));

    return mutual;
  }
}

export default StarsAPI;
