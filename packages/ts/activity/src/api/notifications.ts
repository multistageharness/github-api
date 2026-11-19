/**
 * GitHub Notifications API
 * @module api/notifications
 */

import { buildPaginationParams, Paginator } from '../utils/pagination.js';
import type { PaginationOptions, PageResult, PaginationParams } from '../utils/pagination.js';
import type { HttpClient } from '../client/http.js';
import type { Thread, ThreadSubscription, RateLimit } from '../models/types.js';

/**
 * Options for listing notifications.
 */
export interface NotificationListOptions extends PaginationOptions {
  all?: boolean;
  participating?: boolean;
}

/**
 * Options for marking notifications as read.
 */
export interface MarkAsReadOptions {
  last_read_at?: string;
  read?: boolean;
}

/**
 * Options for setting a thread subscription.
 */
export interface ThreadSubscriptionOptions {
  ignored?: boolean;
}

/**
 * A notification thread as returned by the list endpoints.
 */
export interface NotificationThread {
  id: string;
  repository: { full_name: string; [key: string]: unknown };
  subject: { type: string; title: string; [key: string]: unknown };
  reason: string;
  unread: boolean;
  updated_at: string;
  [key: string]: unknown;
}

/**
 * Notification statistics shape returned by getStatistics.
 */
export interface NotificationStatistics {
  total: number;
  unread: number;
  reasons: Record<string, number>;
  subjectTypes: Record<string, number>;
  repositories: Record<string, number>;
  topRepositories?: [string, number][];
}

/**
 * Result entry for bulk operations that may fail per-item.
 */
export interface BulkResult {
  id: number;
  error: unknown;
}

/**
 * Notifications API endpoints
 */
export class NotificationsAPI {
  http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * List notifications for authenticated user
   */
  async list(options: NotificationListOptions = {}): Promise<PageResult<NotificationThread>> {
    const params: PaginationParams & {
      all?: boolean;
      participating?: boolean;
      since?: string;
      before?: string;
    } = {
      ...buildPaginationParams(options),
      all: options.all,
      participating: options.participating,
      since: options.since,
      before: options.before
    };

    // Notifications API has max 50 per page
    if (params.per_page) {
      params.per_page = Math.min(50, params.per_page);
    }

    return this.http.get<NotificationThread>('/notifications', params);
  }

  /**
   * List repository notifications for authenticated user
   */
  async listForRepo(
    owner: string,
    repo: string,
    options: NotificationListOptions = {}
  ): Promise<PageResult<NotificationThread>> {
    const params = {
      ...buildPaginationParams(options),
      all: options.all,
      participating: options.participating,
      since: options.since,
      before: options.before
    };

    return this.http.get<NotificationThread>(`/repos/${owner}/${repo}/notifications`, params);
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(options: MarkAsReadOptions = {}): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.put('/notifications', {
      last_read_at: options.last_read_at || new Date().toISOString(),
      read: options.read !== false
    });
  }

  /**
   * Mark repository notifications as read
   */
  async markRepoAsRead(
    owner: string,
    repo: string,
    options: MarkAsReadOptions = {}
  ): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.put(`/repos/${owner}/${repo}/notifications`, {
      last_read_at: options.last_read_at || new Date().toISOString()
    });
  }

  /**
   * Get a thread
   */
  async getThread(threadId: number): Promise<Thread> {
    const response = await this.http.get<Thread>(`/notifications/threads/${threadId}`);
    return response.data as unknown as Thread;
  }

  /**
   * Mark a thread as read
   */
  async markThreadAsRead(threadId: number): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.patch(`/notifications/threads/${threadId}`);
  }

  /**
   * Mark a thread as done
   */
  async markThreadAsDone(threadId: number): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.delete(`/notifications/threads/${threadId}`);
  }

  /**
   * Get thread subscription
   */
  async getThreadSubscription(threadId: number): Promise<ThreadSubscription> {
    const response = await this.http.get<ThreadSubscription>(
      `/notifications/threads/${threadId}/subscription`
    );
    return response.data as unknown as ThreadSubscription;
  }

  /**
   * Set thread subscription
   */
  async setThreadSubscription(
    threadId: number,
    options: ThreadSubscriptionOptions = {}
  ): Promise<ThreadSubscription> {
    const response = await this.http.put<ThreadSubscription>(
      `/notifications/threads/${threadId}/subscription`,
      { ignored: options.ignored || false }
    );
    return response.data;
  }

  /**
   * Delete thread subscription
   */
  async deleteThreadSubscription(
    threadId: number
  ): Promise<{ data: unknown; rateLimit: RateLimit }> {
    return this.http.delete(`/notifications/threads/${threadId}/subscription`);
  }

  /**
   * Get paginator for notifications
   */
  getPaginator(options: NotificationListOptions = {}): Paginator<NotificationThread> {
    return new Paginator<NotificationThread>((params) => this.list(params), options);
  }

  /**
   * Get paginator for repository notifications
   */
  getRepoPaginator(
    owner: string,
    repo: string,
    options: NotificationListOptions = {}
  ): Paginator<NotificationThread> {
    return new Paginator<NotificationThread>(
      (params) => this.listForRepo(owner, repo, params),
      options
    );
  }

  /**
   * Get all unread notifications
   */
  async getAllUnread(options: NotificationListOptions = {}): Promise<NotificationThread[]> {
    const response = await this.list({
      ...options,
      all: false
    });
    return response.data;
  }

  /**
   * Get all participating notifications
   */
  async getAllParticipating(options: NotificationListOptions = {}): Promise<NotificationThread[]> {
    const response = await this.list({
      ...options,
      participating: true
    });
    return response.data;
  }

  /**
   * Group notifications by repository
   */
  groupByRepository(notifications: NotificationThread[]): Record<string, NotificationThread[]> {
    return notifications.reduce<Record<string, NotificationThread[]>>((groups, notification) => {
      const repoName = notification.repository.full_name;
      if (!groups[repoName]) {
        groups[repoName] = [];
      }
      groups[repoName].push(notification);
      return groups;
    }, {});
  }

  /**
   * Group notifications by reason
   */
  groupByReason(notifications: NotificationThread[]): Record<string, NotificationThread[]> {
    return notifications.reduce<Record<string, NotificationThread[]>>((groups, notification) => {
      const reason = notification.reason;
      if (!groups[reason]) {
        groups[reason] = [];
      }
      groups[reason].push(notification);
      return groups;
    }, {});
  }

  /**
   * Filter notifications by subject type
   */
  filterBySubjectType(
    notifications: NotificationThread[],
    types: string | string[]
  ): NotificationThread[] {
    const typeArray = Array.isArray(types) ? types : [types];
    return notifications.filter((notification) => typeArray.includes(notification.subject.type));
  }

  /**
   * Filter unread notifications
   */
  filterUnread(notifications: NotificationThread[]): NotificationThread[] {
    return notifications.filter((notification) => notification.unread);
  }

  /**
   * Get notification statistics
   */
  getStatistics(notifications: NotificationThread[]): NotificationStatistics {
    const stats: NotificationStatistics = {
      total: notifications.length,
      unread: 0,
      reasons: {},
      subjectTypes: {},
      repositories: {}
    };

    for (const notification of notifications) {
      // Count unread
      if (notification.unread) {
        stats.unread++;
      }

      // Count by reason
      stats.reasons[notification.reason] = (stats.reasons[notification.reason] || 0) + 1;

      // Count by subject type
      stats.subjectTypes[notification.subject.type] =
        (stats.subjectTypes[notification.subject.type] || 0) + 1;

      // Count by repository
      const repoName = notification.repository.full_name;
      stats.repositories[repoName] = (stats.repositories[repoName] || 0) + 1;
    }

    // Sort repositories by count
    stats.topRepositories = Object.entries(stats.repositories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return stats;
  }

  /**
   * Mark multiple threads as read
   */
  async markMultipleAsRead(threadIds: number[]): Promise<unknown[]> {
    const promises = threadIds.map((id) =>
      this.markThreadAsRead(id).catch((error: unknown) => ({ id, error }))
    );
    return Promise.all(promises);
  }

  /**
   * Subscribe to multiple threads
   */
  async subscribeToMultiple(
    threadIds: number[],
    options: ThreadSubscriptionOptions = {}
  ): Promise<unknown[]> {
    const promises = threadIds.map((id) =>
      this.setThreadSubscription(id, options).catch((error: unknown) => ({ id, error }))
    );
    return Promise.all(promises);
  }
}

export default NotificationsAPI;
