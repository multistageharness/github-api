/**
 * @fileoverview Rate-limit-aware variant of {@link IssuesClient}.
 * @module lib/rateLimitedClient
 */

import { createRateLimiter, type GitHubRateLimiter } from '@internal/github-sdk-ratelimit';

import { IssuesClient, type IssuesClientOptions, type RequestOptions } from './client.js';

/** Default minimum spacing between requests, in milliseconds. */
export const DEFAULT_RATE_LIMIT_PADDING = 100;

export interface RateLimitedIssuesClientOptions extends IssuesClientOptions {
  /** Minimum spacing between requests, in milliseconds. Defaults to `100`. */
  rateLimitPadding?: number | undefined;
}

/**
 * {@link IssuesClient} with every request paced through a shared limiter.
 *
 * The limiter is constructed once per client rather than per request — a limiter
 * with no memory across calls paces nothing.
 */
export class RateLimitedIssuesClient extends IssuesClient {
  private readonly limiter: GitHubRateLimiter;
  /** Minimum spacing between requests, in milliseconds. */
  readonly rateLimitPadding: number;

  constructor(options: RateLimitedIssuesClientOptions = {}) {
    super(options);
    this.rateLimitPadding = options.rateLimitPadding ?? DEFAULT_RATE_LIMIT_PADDING;
    this.limiter = createRateLimiter();
  }

  /**
   * Every request, paced.
   *
   * The limiter receives a thunk so it controls *when* the call happens, not
   * merely when its result is handled — awaiting an already-started request
   * would pace nothing.
   */
  override async request(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    return this.limiter.execute(() => super.request(endpoint, options));
  }

  /** Release the limiter's timers, so a short-lived process can exit. */
  close(): void {
    this.limiter.close();
  }
}

export default RateLimitedIssuesClient;
