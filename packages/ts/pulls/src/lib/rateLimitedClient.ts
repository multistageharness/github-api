/**
 * @fileoverview Rate-limit-aware variant of {@link PullRequestClient}.
 * @module lib/rateLimitedClient
 *
 * INTERFACE.md §Client Construction specifies that this class "routes every
 * `request()` through `new API_Rate_Limiter('core', {})` (from
 * `@internal/npm-api-rate-limiter`)". That package does not exist: it is absent
 * from the local Verdaccio registry and 404s on the public npm registry, so it
 * cannot be depended on.
 *
 * This implements the same contract — one override, every request paced through
 * a single shared limiter for GitHub's primary REST bucket — using the in-repo
 * `@internal/github-sdk-ratelimit`, whose `execute(task)` has the same
 * thunk-scheduling semantics. No retry, backoff, or queue beyond what the
 * limiter itself provides; inventing behaviour the interface does not document
 * would leave callers wrong about what their requests do.
 */

import { createRateLimiter, type GitHubRateLimiter } from '@internal/github-sdk-ratelimit';

import { PullRequestClient } from './client.js';
import type { PullRequestClientOptions } from './types.js';

export class RateLimitedPullRequestClient extends PullRequestClient {
  /** Shared limiter — one per client, since a limiter with no memory paces nothing. */
  private readonly limiter: GitHubRateLimiter;

  constructor(options: PullRequestClientOptions = {}) {
    super(options);
    this.limiter = createRateLimiter();
  }

  /**
   * Every request, paced.
   *
   * The limiter receives a thunk so it controls *when* the call happens, not
   * merely when its result is handled — awaiting an already-started request
   * would pace nothing.
   */
  override async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    return this.limiter.execute(() => super.request(method, endpoint, body));
  }

  /** Release the limiter's timers, so a short-lived process can exit. */
  close(): void {
    this.limiter.close();
  }
}

export default RateLimitedPullRequestClient;
