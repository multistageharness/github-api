/**
 * GitHub Events API
 * @module api/events
 */

import { buildPaginationParams, Paginator } from '../utils/pagination.js';
import type { PaginationOptions, PageResult } from '../utils/pagination.js';
import type { HttpClient } from '../client/http.js';
import type { Event } from '../models/types.js';
import { APIError, RateLimitError } from '../utils/errors.js';

/**
 * Options for streaming public events.
 */
export interface StreamOptions {
  /** Poll interval in ms (default 60000). GitHub's `X-Poll-Interval` raises it. */
  interval?: number;
  onEvent?: (event: Event) => void;
  /** Stops the stream: the generator returns at the next poll or wait. */
  signal?: AbortSignal;
  /**
   * Called with a transient error (rate limit, 5xx, network) before the next
   * poll. Defaults to a one-line message on stderr. A definitive 4xx — 401,
   * 404, validation — ends the stream by being thrown.
   */
  onError?: (error: unknown) => void;
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function waitOrAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Event statistics shape returned by getStatistics.
 */
export interface EventStatistics {
  total: number;
  types: Record<string, number>;
  actors: Record<string, number>;
  repos: Record<string, number>;
  publicEvents: number;
  privateEvents: number;
  topTypes?: [string, number][];
  topActors?: [string, number][];
  topRepos?: [string, number][];
}

/**
 * Events API endpoints
 */
export class EventsAPI {
  http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * List public events
   */
  async listPublic(options: PaginationOptions = {}): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>('/events', params);
  }

  /**
   * List repository events
   */
  async listForRepo(
    owner: string,
    repo: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/repos/${owner}/${repo}/events`, params);
  }

  /**
   * List public events for a network of repositories
   */
  async listForRepoNetwork(
    owner: string,
    repo: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/networks/${owner}/${repo}/events`, params);
  }

  /**
   * List organization events
   */
  async listForOrg(org: string, options: PaginationOptions = {}): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/orgs/${org}/events`, params);
  }

  /**
   * List events for a user
   */
  async listForUser(
    username: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/users/${username}/events`, params);
  }

  /**
   * List public events for a user
   */
  async listPublicForUser(
    username: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/users/${username}/events/public`, params);
  }

  /**
   * List events for a user's organization
   */
  async listForUserOrg(
    username: string,
    org: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/users/${username}/events/orgs/${org}`, params);
  }

  /**
   * List events received by a user
   */
  async listReceivedByUser(
    username: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/users/${username}/received_events`, params);
  }

  /**
   * List public events received by a user
   */
  async listPublicReceivedByUser(
    username: string,
    options: PaginationOptions = {}
  ): Promise<PageResult<Event>> {
    const params = buildPaginationParams(options);
    return this.http.get<Event>(`/users/${username}/received_events/public`, params);
  }

  /**
   * Get paginator for public events
   */
  getPublicPaginator(options: PaginationOptions = {}): Paginator<Event> {
    return new Paginator<Event>((params) => this.listPublic(params), options);
  }

  /**
   * Get paginator for repository events
   */
  getRepoPaginator(owner: string, repo: string, options: PaginationOptions = {}): Paginator<Event> {
    return new Paginator<Event>((params) => this.listForRepo(owner, repo, params), options);
  }

  /**
   * Get paginator for user events
   */
  getUserPaginator(username: string, options: PaginationOptions = {}): Paginator<Event> {
    return new Paginator<Event>((params) => this.listForUser(username, params), options);
  }

  /**
   * Stream public events
   *
   * Polls until `options.signal` aborts. Transient failures (rate limit, 5xx,
   * network) are reported through `options.onError` and polling continues;
   * anything else (401, 404, …) is thrown, ending the stream. The wait between
   * polls honours GitHub's `X-Poll-Interval` when it is longer than `interval`.
   */
  async *streamPublic(options: StreamOptions = {}): AsyncGenerator<Event> {
    const interval = options.interval || 60000; // Default 1 minute
    const { signal } = options;
    const onError =
      options.onError ??
      ((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error streaming events:', message);
      });
    const seenIds = new Set<string>();
    let pollInterval = 0;

    while (!signal?.aborted) {
      try {
        const response = await this.listPublic({ per_page: 100 });
        const events = response.data;
        pollInterval = response.pollInterval ?? pollInterval;

        // Process new events
        for (const event of events) {
          if (signal?.aborted) return;
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);

            if (options.onEvent) {
              options.onEvent(event);
            }

            yield event;
          }
        }

        // Clean up old IDs to prevent memory leak
        if (seenIds.size > 1000) {
          const idsArray = Array.from(seenIds);
          const toRemove = idsArray.slice(0, idsArray.length - 500);
          toRemove.forEach((id) => seenIds.delete(id));
        }
      } catch (error) {
        // GitHub answered with a definitive 4xx (bad token, unknown resource,
        // validation): polling again cannot fix it.
        if (
          error instanceof APIError &&
          !(error instanceof RateLimitError) &&
          error.statusCode < 500
        ) {
          throw error;
        }
        onError(error);
      }

      // Wait before next poll
      await waitOrAbort(Math.max(interval, pollInterval), signal);
    }
  }

  /**
   * Filter events by type
   */
  filterByType(events: Event[], types: string | string[]): Event[] {
    const typeArray = Array.isArray(types) ? types : [types];
    return events.filter((event) => typeArray.includes(event.type as string));
  }

  /**
   * Filter events by repository
   */
  filterByRepo(events: Event[], repoFullName: string): Event[] {
    return events.filter((event) => event.repo.name === repoFullName);
  }

  /**
   * Filter events by actor
   */
  filterByActor(events: Event[], username: string): Event[] {
    return events.filter((event) => event.actor.login === username);
  }

  /**
   * Group events by type
   */
  groupByType(events: Event[]): Record<string, Event[]> {
    return events.reduce<Record<string, Event[]>>((groups, event) => {
      const type = event.type as string;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(event);
      return groups;
    }, {});
  }

  /**
   * Get event statistics
   */
  getStatistics(events: Event[]): EventStatistics {
    const stats: EventStatistics = {
      total: events.length,
      types: {},
      actors: {},
      repos: {},
      publicEvents: 0,
      privateEvents: 0
    };

    for (const event of events) {
      const type = event.type as string;
      // Count by type
      stats.types[type] = (stats.types[type] || 0) + 1;

      // Count by actor
      stats.actors[event.actor.login] = (stats.actors[event.actor.login] || 0) + 1;

      // Count by repo
      stats.repos[event.repo.name] = (stats.repos[event.repo.name] || 0) + 1;

      // Count public/private
      if (event.public) {
        stats.publicEvents++;
      } else {
        stats.privateEvents++;
      }
    }

    // Sort and limit top items
    stats.topTypes = Object.entries(stats.types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    stats.topActors = Object.entries(stats.actors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    stats.topRepos = Object.entries(stats.repos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return stats;
  }
}

export default EventsAPI;
