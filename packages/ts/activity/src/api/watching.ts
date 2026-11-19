/**
 * GitHub Watching API
 * @module api/watching
 */

import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import { buildPaginationParams, Paginator } from '../utils/pagination.js';
import type { PaginationOptions, PageResult } from '../utils/pagination.js';
import type { HttpClient } from '../client/http.js';
import { APIError } from '../utils/errors.js';
import type {
  RepositorySubscription,
  MinimalRepository,
  SimpleUser,
  RateLimit
} from '../models/types.js';

/**
 * Options for setting a repository subscription.
 */
export interface RepoSubscriptionOptions {
  subscribed?: boolean;
  ignored?: boolean;
}

/**
 * A repo identifier pair.
 */
export interface RepoRef {
  owner: string;
  repo: string;
}

/**
 * Result entry for bulk watch/unwatch operations.
 */
export interface BulkWatchResult {
  owner: string;
  repo: string;
  success: boolean;
  result?: unknown;
  error?: unknown;
}

/**
 * A per-repository detail in watch statistics.
 */
export interface WatchDetail {
  repository: string;
  subscribed?: boolean;
  ignored?: boolean;
  reason?: string | null;
  created_at?: string | null;
  error?: string;
}

/**
 * Watch statistics shape.
 */
export interface WatchStatistics {
  total: number;
  watched: number;
  ignored: number;
  notWatching: number;
  details: WatchDetail[];
}

/**
 * Watching API endpoints
 */
export class WatchingAPI {
  http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * List watchers for a repository
   */
  async listWatchers(
    owner: string,
    repo: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<SimpleUser>> {
    const params = buildPaginationParams(options);
    return this.http.get<SimpleUser>(`/repos/${owner}/${repo}/subscribers`, params);
  }

  /**
   * List repositories watched by a user
   */
  async listWatchedByUser(
    username: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<MinimalRepository>> {
    const params = buildPaginationParams(options);
    return this.http.get<MinimalRepository>(`/users/${username}/subscriptions`, params);
  }

  /**
   * List repositories watched by authenticated user
   */
  async listWatchedByAuthUser(
    options: PaginationOptions = {}
  ): Promise<PageResult<MinimalRepository>> {
    const params = buildPaginationParams(options);
    return this.http.get<MinimalRepository>('/user/subscriptions', params);
  }

  /**
   * Get repository subscription for authenticated user
   */
  async getRepoSubscription(owner: string, repo: string): Promise<RepositorySubscription> {
    try {
      const response = await this.http.get<RepositorySubscription>(
        `/repos/${owner}/${repo}/subscription`
      );
      return response.data as unknown as RepositorySubscription;
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 404) {
        return {
          subscribed: false,
          ignored: false,
          reason: null,
          created_at: null,
          url: null,
          repository_url: `${DEFAULT_BASE_URL}/repos/${owner}/${repo}`
        };
      }
      throw error;
    }
  }

  /**
   * Set repository subscription
   */
  async setRepoSubscription(
    owner: string,
    repo: string,
    options: RepoSubscriptionOptions = {}
  ): Promise<RepositorySubscription> {
    const response = await this.http.put<RepositorySubscription>(
      `/repos/${owner}/${repo}/subscription`,
      {
        subscribed: options.subscribed !== false,
        ignored: options.ignored || false
      }
    );
    return response.data;
  }

  /**
   * Delete repository subscription
   */
  async deleteRepoSubscription(
    owner: string,
    repo: string
  ): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.delete(`/repos/${owner}/${repo}/subscription`);
  }

  /**
   * Watch a repository (subscribe)
   */
  async watchRepo(owner: string, repo: string): Promise<RepositorySubscription> {
    return this.setRepoSubscription(owner, repo, { subscribed: true, ignored: false });
  }

  /**
   * Unwatch a repository (unsubscribe)
   */
  async unwatchRepo(
    owner: string,
    repo: string
  ): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.deleteRepoSubscription(owner, repo);
  }

  /**
   * Ignore a repository
   */
  async ignoreRepo(owner: string, repo: string): Promise<RepositorySubscription> {
    return this.setRepoSubscription(owner, repo, { subscribed: false, ignored: true });
  }

  /**
   * Check if watching a repository
   */
  async isWatching(owner: string, repo: string): Promise<boolean> {
    const subscription = await this.getRepoSubscription(owner, repo);
    return subscription.subscribed === true;
  }

  /**
   * Check if ignoring a repository
   */
  async isIgnoring(owner: string, repo: string): Promise<boolean> {
    const subscription = await this.getRepoSubscription(owner, repo);
    return subscription.ignored === true;
  }

  /**
   * Get paginator for watchers
   */
  getWatchersPaginator(
    owner: string,
    repo: string,
    options: PaginationOptions = {}
  ): Paginator<SimpleUser> {
    return new Paginator<SimpleUser>((params) => this.listWatchers(owner, repo, params), options);
  }

  /**
   * Get paginator for watched repositories by user
   */
  getWatchedPaginator(
    username: string,
    options: PaginationOptions = {}
  ): Paginator<MinimalRepository> {
    return new Paginator<MinimalRepository>(
      (params) => this.listWatchedByUser(username, params),
      options
    );
  }

  /**
   * Get paginator for watched repositories by authenticated user
   */
  getAuthWatchedPaginator(options: PaginationOptions = {}): Paginator<MinimalRepository> {
    return new Paginator<MinimalRepository>(
      (params) => this.listWatchedByAuthUser(params),
      options
    );
  }

  /**
   * Watch multiple repositories
   */
  async watchMultiple(repos: RepoRef[]): Promise<BulkWatchResult[]> {
    const promises = repos.map(({ owner, repo }) =>
      this.watchRepo(owner, repo)
        .then((result) => ({ owner, repo, success: true, result }))
        .catch((error: unknown) => ({ owner, repo, success: false, error }))
    );
    return Promise.all(promises);
  }

  /**
   * Unwatch multiple repositories
   */
  async unwatchMultiple(repos: RepoRef[]): Promise<BulkWatchResult[]> {
    const promises = repos.map(({ owner, repo }) =>
      this.unwatchRepo(owner, repo)
        .then(() => ({ owner, repo, success: true }))
        .catch((error: unknown) => ({ owner, repo, success: false, error }))
    );
    return Promise.all(promises);
  }

  /**
   * Get watcher count for a repository
   */
  async getWatcherCount(owner: string, repo: string): Promise<number> {
    const response = await this.http.get<{ subscribers_count: number }>(`/repos/${owner}/${repo}`);
    return (response.data as unknown as { subscribers_count: number }).subscribers_count;
  }

  /**
   * Get all watchers for a repository
   */
  async getAllWatchers(
    owner: string,
    repo: string,
    options: PaginationOptions = {}
  ): Promise<SimpleUser[]> {
    return this.http.fetchAllPages<SimpleUser>(`/repos/${owner}/${repo}/subscribers`, options);
  }

  /**
   * Get all watched repositories for authenticated user
   */
  async getAllWatched(options: PaginationOptions = {}): Promise<MinimalRepository[]> {
    return this.http.fetchAllPages<MinimalRepository>('/user/subscriptions', options);
  }

  /**
   * Get watch statistics for repositories
   */
  async getWatchStatistics(repos: RepoRef[]): Promise<WatchStatistics> {
    const stats: WatchStatistics = {
      total: repos.length,
      watched: 0,
      ignored: 0,
      notWatching: 0,
      details: []
    };

    const promises = repos.map(async ({ owner, repo }): Promise<WatchDetail> => {
      try {
        const subscription = await this.getRepoSubscription(owner, repo);
        const detail: WatchDetail = {
          repository: `${owner}/${repo}`,
          subscribed: subscription.subscribed,
          ignored: subscription.ignored,
          reason: subscription.reason,
          created_at: subscription.created_at
        };

        if (subscription.subscribed) stats.watched++;
        else if (subscription.ignored) stats.ignored++;
        else stats.notWatching++;

        return detail;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          repository: `${owner}/${repo}`,
          error: message
        };
      }
    });

    stats.details = await Promise.all(promises);
    return stats;
  }

  /**
   * Find mutual watchers between repositories
   */
  async findMutualWatchers(repo1: RepoRef, repo2: RepoRef): Promise<SimpleUser[]> {
    const [watchers1, watchers2] = await Promise.all([
      this.getAllWatchers(repo1.owner, repo1.repo),
      this.getAllWatchers(repo2.owner, repo2.repo)
    ]);

    const users1 = new Set(watchers1.map((w) => w.login));
    const mutual = watchers2.filter((w) => users1.has(w.login));

    return mutual;
  }
}

export default WatchingAPI;
