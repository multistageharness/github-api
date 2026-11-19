/**
 * @fileoverview The limiter itself — the one object every GitHub-calling path
 * in this repository routes through.
 *
 * It does five things, in this order, for every request it governs:
 * take a concurrency slot (R8), pace before sending (R7), run the task, record
 * what the response said about the budget (R1, R2), and decide whether the
 * response was a limit worth waiting out and replaying (R3–R6, R9).
 * @module limiter
 */

import { computeBackoff } from './backoff.js';
import { classifyResponse } from './classify.js';
import { AbortError, isAbortError, throwIfAborted } from './clock.js';
import { resolveConfig, type RateLimiterOptions, type ResolvedConfig } from './config.js';
import { EventBus } from './events.js';
import { defaultExtractResponse, isIdempotent } from './extract.js';
import { rateLimitErrorFrom, type GitHubRateLimitError } from './errors.js';
import {
  parseHttpDate,
  parseRateLimitHeaders,
  readHeader,
  resourceFromUrl,
  routeFromUrl,
} from './headers.js';
import { computePacing, PacingTracker, type PacingConfig } from './pacer.js';
import { Semaphore } from './semaphore.js';
import { isApproachingLimit, RateLimitStore } from './state.js';
import { computeWait } from './wait.js';
import type {
  Classification,
  ExecuteOptions,
  RateLimitStatus,
  RateLimiterEventName,
  RateLimiterListener,
  ResourceState,
  ResponseLike,
} from './types.js';

/**
 * Governs GitHub API requests: tracks every budget, paces against it, bounds
 * concurrency, and waits out limits without ever sleeping unboundedly.
 *
 * Construct one per token. Two limiters over the same token double-count the
 * same budget, which is why adoption swaps rather than layers.
 */
export class GitHubRateLimiter {
  readonly #config: ResolvedConfig;
  readonly #store = new RateLimitStore();
  readonly #pacing = new PacingTracker();
  readonly #events = new EventBus();
  readonly #semaphore: Semaphore;
  readonly #extract: (value: unknown) => ResponseLike | null;

  /** Consecutive secondary limits, for wait escalation and cap reduction (R5). */
  #secondaryStreak = 0;
  /** Clean responses since the last secondary limit, for cap recovery (R8). */
  #cleanSinceSecondary = 0;
  /**
   * Local time until which the current secondary-limit event is being waited
   * out. Every in-flight request that hits the same burst throttle reports it
   * separately; those arriving before this time join the one wait instead of
   * each escalating it and halving the cap again (R5, R8).
   */
  #secondaryCooldownUntil: number | undefined;
  /**
   * Estimated `GitHub time - local time`, in ms, from responses' `Date`
   * header. Reset-derived waits are computed against GitHub's clock, so a host
   * running ahead does not retry before the real reset (R6).
   */
  #clockSkewMs = 0;
  #skewSamples = 0;
  /**
   * Routes whose reported bucket differs from the one guessed from the URL —
   * `/repos/o/r/dependency-graph/snapshots` is metered as
   * `dependency_snapshots`, not `core`. Pacing reads the bucket it will be
   * metered under, so it must learn this from the first response (R2, R7).
   * Only mismatches are stored, and the map is capped, so memory stays bounded
   * by distinct mismatching routes rather than by request count (N2).
   */
  readonly #routeBuckets = new Map<string, string>();
  #closed = false;

  constructor(options: RateLimiterOptions = {}) {
    this.#config = resolveConfig(options);
    this.#semaphore = new Semaphore(this.#config.maxConcurrent);
    this.#extract = this.#config.extractResponse ?? defaultExtractResponse;
  }

  // ── observation surface (R10) ──────────────────────────────────────────────

  /** Budget for one resource, with derived reset fields. */
  getStatus(resource = 'core'): RateLimitStatus {
    return this.#store.status(resource, this.#config.clock.now());
  }

  /** Budget for every tracked resource. */
  getAllStatuses(): RateLimitStatus[] {
    return this.#store.allStatuses(this.#config.clock.now());
  }

  /**
   * Whether a resource's remaining budget has fallen below `threshold`.
   *
   * A resource no response has described yet is not "approaching" anything, so
   * this stays `false` rather than treating unknown as empty.
   */
  isApproachingLimit(threshold = this.#config.nearExhaustionThreshold, resource = 'core'): boolean {
    return isApproachingLimit(this.#store.get(resource), threshold);
  }

  /** In-flight and queued request counts (R8, R10). */
  getConcurrency(): { limit: number; inFlight: number; queued: number } {
    return {
      limit: this.#semaphore.limit,
      inFlight: this.#semaphore.inFlight,
      queued: this.#semaphore.queued,
    };
  }

  /** Resolved configuration, including every applied default. */
  getConfig(): Readonly<ResolvedConfig> {
    return this.#config;
  }

  /** Subscribe to a lifecycle event. Returns an unsubscribe function. */
  on<K extends RateLimiterEventName>(event: K, listener: RateLimiterListener<K>): () => void {
    return this.#events.on(event, listener);
  }

  /** Subscribe for a single delivery. */
  once<K extends RateLimiterEventName>(event: K, listener: RateLimiterListener<K>): () => void {
    return this.#events.once(event, listener);
  }

  /** Unsubscribe. */
  off<K extends RateLimiterEventName>(event: K, listener: RateLimiterListener<K>): void {
    this.#events.off(event, listener);
  }

  // ── state tracking (R1, R2) ───────────────────────────────────────────────

  /**
   * Record what a response said about the budget.
   *
   * Called automatically by {@link execute}, and exposed so a consumer that
   * makes a request outside the limiter — a `HEAD` probe, a paginated follow-up
   * — can still keep the budget current.
   *
   * Runs even when the limiter is disabled: an off switch removes waiting, not
   * bookkeeping (R12).
   */
  observe(response: ResponseLike, hint?: { resource?: string; url?: string }): ResourceState | null {
    const nowMs = this.#config.clock.now();
    this.#observeClockSkew(response, nowMs);

    const fallback = this.#bucketFor(hint);
    const parsed = parseRateLimitHeaders(response.headers, fallback);
    const resource = parsed.resource ?? fallback;
    this.#learnRouteBucket(hint, parsed.resource);

    const next = this.#store.update(resource, parsed, nowMs);
    if (next === null) {
      // No rate-limit headers at all, or a late response from a window that
      // has already rolled over: prior state stands untouched (R1).
      return null;
    }

    this.#events.emit('state', () => ({ ...next }));

    if (
      next.remaining !== undefined &&
      next.remaining < this.#config.nearExhaustionThreshold
    ) {
      this.#events.emit('exhaustion', () => ({
        resource: next.resource,
        remaining: next.remaining as number,
        limit: next.limit,
        threshold: this.#config.nearExhaustionThreshold,
      }));
    }

    return next;
  }

  /**
   * Classify a response without acting on it.
   *
   * The pure decision behind {@link execute}, exposed so a consumer converting
   * its own error taxonomy can ask "was this a rate limit?" without routing the
   * request through the limiter.
   */
  classify(response: ResponseLike, hint?: { resource?: string; url?: string }): Classification {
    return classifyResponse(response, this.#serverNow(), this.#bucketFor(hint));
  }

  /**
   * Estimated offset of GitHub's clock from the injected clock, in ms
   * (`GitHub - local`), learned from responses' `Date` header. `0` until a
   * response has carried one.
   */
  getClockSkewMs(): number {
    return this.#clockSkewMs;
  }

  // ── the governed path ─────────────────────────────────────────────────────

  /**
   * Run a request under the limiter.
   *
   * `task` should perform exactly one HTTP round-trip and return its response.
   * It may return anything — the limiter reads a status and headers off it
   * through the configured extractor, and hands the value back untouched. A
   * task that throws an error carrying a response (as Axios does) is observed
   * and classified just the same, because state must be recorded even when the
   * response is an error (R1).
   *
   * @throws {GitHubRateLimitError} when a limit cannot be waited out — retries
   *         exhausted, the request is not replayable, or the honest wait exceeds
   *         `maxWaitMs` (R6).
   */
  async execute<T>(task: () => Promise<T>, options: ExecuteOptions = {}): Promise<T> {
    if (this.#closed) {
      throw new Error('GitHubRateLimiter has been closed');
    }

    const { signal } = options;
    throwIfAborted(signal);

    // Disabled: no slot, no pacing, no waiting. State tracking still runs (R12).
    if (!this.#config.enabled) {
      return this.#runAndObserve(task, options);
    }

    const release = await this.#semaphore.acquire(signal);
    this.#emitConcurrency('acquire');

    try {
      return await this.#executeGoverned(task, options);
    } finally {
      release();
      this.#emitConcurrency('release');
    }
  }

  async #executeGoverned<T>(task: () => Promise<T>, options: ExecuteOptions): Promise<T> {
    const { signal } = options;
    const idempotent = isIdempotent(options.method, options.idempotent);

    let attempt = 0;
    let lastClassification: Classification | undefined;
    let lastResponse: ResponseLike | undefined;
    let lastError: unknown;
    let retried = false;

    // `maxRetries` counts replays *after* the first attempt.
    const maxAttempts = this.#config.maxRetries + 1;

    while (attempt < maxAttempts) {
      attempt++;
      throwIfAborted(signal);

      if (options.skipPacing !== true) {
        await this.#pace(options, signal);
      }

      const outcome = await this.#attempt(task, options);

      if (outcome.kind === 'value' && !outcome.classification.isRateLimit) {
        this.#onCleanResponse();
        return outcome.value;
      }

      if (outcome.kind === 'error' && !outcome.classification.isRateLimit) {
        // Not a limit — a permission failure, a 5xx, a network fault. Not ours.
        throw outcome.error;
      }

      const classification = outcome.classification;
      lastClassification = classification;
      lastResponse = outcome.response;
      lastError = outcome.kind === 'error' ? outcome.error : undefined;

      this.#events.emit('limit', () => ({ ...classification }));
      const decision = this.#decideWait(classification);

      const canRetry = attempt < maxAttempts && (idempotent || this.#config.retryNonIdempotent);

      // Refuse rather than sleep past the ceiling, and refuse rather than
      // replay something that must not be replayed.
      if (decision.exceedsCeiling || !canRetry) {
        throw this.#failure(classification, {
          retried,
          attempts: attempt,
          exceededWaitCeiling: decision.exceedsCeiling,
          response: lastResponse,
          cause: lastError,
        });
      }

      if (classification.kind === 'secondary') {
        // Only a wait actually performed opens a window for others to join.
        this.#extendSecondaryCooldown(decision.untilMs);
      }

      if (decision.waitMs > 0) {
        this.#events.emit('wait', () => ({
          resource: classification.resource,
          waitMs: decision.waitMs,
          kind: classification.kind,
          retryAfterUsed: decision.retryAfterUsed,
        }));
        await this.#sleep(decision.waitMs, signal);
      }

      // Backoff on top of the advised wait, jittered so concurrent waiters do
      // not all come back in the same millisecond (R9).
      const backoffMs = computeBackoff(attempt, this.#config.backoff, this.#config.random);
      const cappedBackoff = Math.min(backoffMs, this.#config.maxWaitMs);
      this.#events.emit('retry', () => ({
        resource: classification.resource,
        attempt: attempt + 1,
        delayMs: cappedBackoff,
        kind: classification.kind,
      }));
      if (cappedBackoff > 0) {
        await this.#sleep(cappedBackoff, signal);
      }

      retried = true;
    }

    // Retries exhausted.
    if (lastClassification !== undefined) {
      throw this.#failure(lastClassification, {
        retried,
        attempts: attempt,
        exceededWaitCeiling: false,
        response: lastResponse,
        cause: lastError,
      });
    }
    /* c8 ignore next 2 -- unreachable: the loop returns, throws, or sets lastClassification */
    throw lastError ?? new Error('GitHubRateLimiter.execute exhausted attempts without a result');
  }

  /**
   * React to a limit and decide how long to wait it out.
   *
   * A secondary limit that arrives while an earlier one is still being waited
   * out is the *same* event seen by another in-flight request: it joins that
   * wait — never shorter than its own advice, never escalated — and neither
   * raises the streak nor cuts the cap again (R5, R8).
   */
  #decideWait(classification: Classification): {
    waitMs: number;
    exceedsCeiling: boolean;
    retryAfterUsed: boolean;
    /** Local time the wait ends. */
    untilMs: number;
  } {
    const nowMs = this.#config.clock.now();
    const secondary = classification.kind === 'secondary';
    const cooldownUntil = this.#secondaryCooldownUntil;
    const joinsCooldown = secondary && cooldownUntil !== undefined && nowMs < cooldownUntil;

    if (!joinsCooldown) {
      this.#onLimit(classification);
    }

    const decision = computeWait({
      classification,
      nowMs: nowMs + this.#clockSkewMs,
      maxWaitMs: this.#config.maxWaitMs,
      paddingMs: this.#config.waitPaddingMs,
      fallbackMs: this.#config.fallbackWaitMs,
      secondaryFallbackMs: this.#config.secondaryFallbackWaitMs,
      secondaryStreak: Math.max(0, this.#secondaryStreak - 1),
      secondaryEscalationFactor: this.#config.secondaryEscalationFactor,
    });

    let requestedMs = decision.requestedMs;
    if (joinsCooldown) {
      requestedMs = Math.max(requestedMs, cooldownUntil - nowMs);
    }
    const exceedsCeiling = requestedMs > this.#config.maxWaitMs;
    const waitMs = Math.min(requestedMs, this.#config.maxWaitMs);

    return { waitMs, exceedsCeiling, retryAfterUsed: decision.retryAfterUsed, untilMs: nowMs + waitMs };
  }

  /** Open, or extend, the window a secondary-limit event is waited out in. */
  #extendSecondaryCooldown(untilMs: number): void {
    this.#secondaryCooldownUntil = Math.max(this.#secondaryCooldownUntil ?? untilMs, untilMs);
  }

  /** One attempt: run the task, observe whatever came back, classify it. */
  async #attempt<T>(
    task: () => Promise<T>,
    options: ExecuteOptions,
  ): Promise<
    | { kind: 'value'; value: T; classification: Classification; response?: ResponseLike }
    | { kind: 'error'; error: unknown; classification: Classification; response?: ResponseLike }
  > {
    const hint = { resource: options.resource, url: options.url };
    if (options.skipPacing === true) {
      // A paced request reserved its send slot in `#pace`. An unpaced one still
      // counts as a request to this bucket, without moving a later reservation.
      const resource = this.#resourceFor(options);
      const nowMs = this.#config.clock.now();
      const reserved = this.#pacing.get(resource);
      if (reserved === undefined || reserved < nowMs) {
        this.#pacing.mark(resource, nowMs);
      }
    }

    try {
      const value = await task();
      const response = this.#extract(value);
      if (response === null) {
        // Nothing HTTP-shaped came back — a parsed body, say. Nothing to track,
        // and by definition not a rate limit.
        return { kind: 'value', value, classification: notALimit(this.#resourceFor(options)) };
      }
      this.observe(response, hint);
      return { kind: 'value', value, classification: this.classify(response, hint), response };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const response = this.#extract(error);
      if (response === null) {
        return { kind: 'error', error, classification: notALimit(this.#resourceFor(options)) };
      }
      // State is recorded even when the response is an error (R1).
      this.observe(response, hint);
      return { kind: 'error', error, classification: this.classify(response, hint), response };
    }
  }

  /**
   * Pace before sending, and report it if anyone is listening (R7).
   *
   * The send slot is *reserved* synchronously, before sleeping: the tracker
   * holds the time the latest caller is scheduled to send, and the next caller
   * spaces itself from that rather than from the last request that actually
   * went out. Without the reservation every caller queued behind the same
   * request reads the same timestamp, sleeps the same delay, and sends in the
   * same millisecond — the burst pacing exists to prevent.
   */
  async #pace(options: ExecuteOptions, signal?: AbortSignal): Promise<void> {
    const resource = this.#resourceFor(options);
    const pacingConfig: PacingConfig = {
      minIntervalMs: this.#config.minIntervalMs,
      adaptive: this.#config.adaptivePacing,
      adaptiveThreshold: this.#config.adaptiveThreshold,
      reserve: this.#config.reserve,
      maxDelayMs: this.#config.maxPacingDelayMs,
    };

    const nowMs = this.#config.clock.now();
    let reserved = this.#pacing.get(resource);
    // No reservation is ever more than one pacing ceiling ahead of the clock;
    // one that is means the clock jumped backwards, so the history is void.
    if (reserved !== undefined && reserved - nowMs > pacingConfig.maxDelayMs) {
      reserved = undefined;
    }
    const baseMs = reserved !== undefined && reserved > nowMs ? reserved : nowMs;

    const decision = computePacing({
      state: this.#store.get(resource),
      lastRequestAtMs: reserved,
      nowMs: baseMs,
      config: pacingConfig,
    });

    const delayMs =
      decision.delayMs > 0 ? Math.min(baseMs - nowMs + decision.delayMs, pacingConfig.maxDelayMs) : 0;
    this.#pacing.mark(resource, nowMs + delayMs);

    if (delayMs <= 0) {
      return;
    }

    this.#events.emit('throttle', () => ({
      resource,
      delayMs,
      reason: decision.reason,
    }));
    await this.#sleep(delayMs, signal);
  }

  /** The bucket a request will be metered under, before any response says so. */
  #resourceFor(options: ExecuteOptions): string {
    return this.#bucketFor({ resource: options.resource, url: options.url });
  }

  /**
   * An explicit resource, else the bucket GitHub last reported for this route,
   * else the guess from the URL.
   */
  #bucketFor(hint?: { resource?: string; url?: string }): string {
    if (hint?.resource !== undefined) {
      return hint.resource;
    }
    if (hint?.url) {
      const learned = this.#routeBuckets.get(routeFromUrl(hint.url));
      if (learned !== undefined) {
        return learned;
      }
    }
    return resourceFromUrl(hint?.url);
  }

  /** Remember a route whose reported bucket differs from the URL guess. */
  #learnRouteBucket(hint: { resource?: string; url?: string } | undefined, reported: string | undefined): void {
    if (hint?.resource !== undefined || !hint?.url || reported === undefined || reported === '') {
      return;
    }
    const route = routeFromUrl(hint.url);
    this.#routeBuckets.delete(route);
    if (reported === resourceFromUrl(hint.url)) {
      return;
    }
    if (this.#routeBuckets.size >= ROUTE_MEMO_LIMIT) {
      // Evict the least recently learned route.
      const oldest = this.#routeBuckets.keys().next().value;
      if (oldest !== undefined) {
        this.#routeBuckets.delete(oldest);
      }
    }
    this.#routeBuckets.set(route, reported);
  }

  /** Fold a response's `Date` header into the clock-skew estimate. */
  #observeClockSkew(response: ResponseLike, nowMs: number): void {
    const value = readHeader(response.headers, 'date');
    if (value === undefined) {
      return;
    }
    const serverMs = parseHttpDate(value, nowMs);
    if (serverMs === undefined) {
      return;
    }
    const sample = serverMs - nowMs;
    this.#skewSamples++;
    // The first sample is taken as is; later ones are smoothed so one slow
    // response does not swing every wait.
    this.#clockSkewMs =
      this.#skewSamples === 1 ? sample : this.#clockSkewMs + (sample - this.#clockSkewMs) * SKEW_SMOOTHING;
  }

  /** The injected clock, corrected onto GitHub's. */
  #serverNow(): number {
    return this.#config.clock.now() + this.#clockSkewMs;
  }

  /** Every sleep in the package goes through here: bounded and cancellable (R6). */
  async #sleep(ms: number, signal?: AbortSignal): Promise<void> {
    const bounded = Math.min(Math.max(0, ms), this.#config.maxWaitMs);
    if (bounded <= 0) {
      return;
    }
    await this.#config.clock.sleep(bounded, signal);
  }

  /**
   * A secondary limit means too much parallelism, so cut the cap as well as
   * waiting — waiting alone does not fix what parallelism caused (R5, R8).
   */
  #onLimit(classification: Classification): void {
    if (classification.kind !== 'secondary') {
      return;
    }
    this.#secondaryStreak++;
    this.#cleanSinceSecondary = 0;

    const next = Math.max(
      this.#config.secondaryConcurrencyFloor,
      Math.floor(this.#semaphore.limit / 2),
    );
    if (next < this.#semaphore.limit) {
      this.#semaphore.setLimit(next);
      this.#emitConcurrency('secondary-limit');
    }
  }

  /** Step the cap back up once GitHub has stopped complaining (R8). */
  #onCleanResponse(): void {
    this.#secondaryStreak = 0;
    if (this.#semaphore.limit >= this.#config.maxConcurrent) {
      return;
    }
    this.#cleanSinceSecondary++;
    if (this.#cleanSinceSecondary < this.#config.secondaryRecoveryAfter) {
      return;
    }
    this.#cleanSinceSecondary = 0;
    this.#semaphore.setLimit(Math.min(this.#config.maxConcurrent, this.#semaphore.limit * 2));
    this.#emitConcurrency('recovery');
  }

  #emitConcurrency(reason: string): void {
    this.#events.emit('concurrency', () => ({
      limit: this.#semaphore.limit,
      inFlight: this.#semaphore.inFlight,
      queued: this.#semaphore.queued,
      reason,
    }));
  }

  #failure(
    classification: Classification,
    detail: {
      retried: boolean;
      attempts: number;
      exceededWaitCeiling: boolean;
      response?: ResponseLike;
      cause?: unknown;
    },
  ): GitHubRateLimitError {
    return rateLimitErrorFrom(
      classification,
      {
        retried: detail.retried,
        attempts: detail.attempts,
        exceededWaitCeiling: detail.exceededWaitCeiling,
        response: detail.response,
      },
      detail.cause === undefined ? undefined : { cause: detail.cause },
    );
  }

  /** The disabled path: run the task, keep the books, never delay (R12). */
  async #runAndObserve<T>(task: () => Promise<T>, options: ExecuteOptions): Promise<T> {
    const hint = { resource: options.resource, url: options.url };
    try {
      const value = await task();
      const response = this.#extract(value);
      if (response !== null) {
        this.observe(response, hint);
      }
      return value;
    } catch (error) {
      const response = this.#extract(error);
      if (response !== null) {
        this.observe(response, hint);
      }
      throw error;
    }
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /** Forget all budget state and pacing history. Listeners stay subscribed. */
  reset(): void {
    this.#store.clear();
    this.#pacing.clear();
    this.#secondaryStreak = 0;
    this.#cleanSinceSecondary = 0;
    this.#secondaryCooldownUntil = undefined;
    this.#clockSkewMs = 0;
    this.#skewSamples = 0;
    this.#routeBuckets.clear();
    this.#semaphore.setLimit(this.#config.maxConcurrent);
  }

  /**
   * Release the limiter. Queued callers reject with an `AbortError`; requests
   * already in flight are left to finish.
   */
  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#semaphore.drainWithError(new AbortError('GitHubRateLimiter was closed'));
    this.#events.clear();
  }
}

/** Most mismatching routes remembered at once (N2). */
const ROUTE_MEMO_LIMIT = 256;

/** Weight of each new `Date` sample in the clock-skew estimate. */
const SKEW_SMOOTHING = 0.25;

function notALimit(resource: string): Classification {
  return {
    kind: 'none',
    isRateLimit: false,
    resource,
    status: 0,
    reason: 'no HTTP response was available to classify',
  };
}

/** Convenience factory, matching the `createX` shape the SDKs already use. */
export function createRateLimiter(options: RateLimiterOptions = {}): GitHubRateLimiter {
  return new GitHubRateLimiter(options);
}
