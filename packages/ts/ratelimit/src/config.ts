/**
 * @fileoverview Configuration, defaults, and validation.
 *
 * Two rules govern this file (R12). Every option has a documented default and a
 * stated unit. And every option *does something* — an option that is accepted
 * and stored but drives nothing is a bug, not a placeholder. That is the exact
 * defect recorded at `search/src/lib/RateLimitedSearchClient.ts:26-34`, where
 * `adaptiveRateLimit` and `rateLimitBuffer` are documented as unenforced.
 * @module config
 */

import type { BackoffConfig, JitterMode } from './backoff.js';
import { SystemClock } from './clock.js';
import type { Clock, ResponseLike } from './types.js';

/** Options accepted by the limiter. Every field is optional; see the defaults below. */
export interface RateLimiterOptions {
  /**
   * Master switch. When `false` the limiter still tracks state from every
   * response (R1) but adds no delay and performs no waits — the rollback path
   * R12 requires, and the way `search`'s deliberate track-but-do-not-throttle
   * contract is preserved.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Minimum gap between two requests to the same resource, in **milliseconds**.
   * `0` means no floor, which is what keeps the healthy path free of measurable
   * delay. `repos` and `python.v3` currently hardcode the equivalent of `100`.
   *
   * @default 0
   */
  minIntervalMs?: number;

  /**
   * Stretch a nearly-exhausted budget across the rest of its window instead of
   * spending it immediately (R7).
   *
   * @default true
   */
  adaptivePacing?: boolean;

  /**
   * Fraction of a resource's limit, `0`–`1`, below which adaptive pacing
   * engages. Above it, pacing adds nothing.
   *
   * @default 0.2
   */
  adaptiveThreshold?: number;

  /**
   * Requests withheld from the budget so a burst cannot spend the very last
   * one. Unit: **requests**.
   *
   * @default 1
   */
  reserve?: number;

  /**
   * Ceiling on any single *pacing* delay, in **milliseconds**. Distinct from
   * `maxWaitMs`, which bounds waits GitHub asked for.
   *
   * @default 5000
   */
  maxPacingDelayMs?: number;

  /**
   * Maximum requests in flight at once (R8). Exceeding callers queue. An integer.
   *
   * @default 8
   */
  maxConcurrent?: number;

  /**
   * Hard ceiling on any wait the limiter performs, in **milliseconds**. A
   * computed wait above this surfaces a `GitHubRateLimitError` instead of
   * sleeping past it — a reset an hour out never becomes an hour-long sleep (R6).
   *
   * This bounds each *individual* sleep, not a whole `execute` call. One call
   * can sleep up to `maxRetries` times for a limit (each `<= maxWaitMs`), plus
   * a backoff after each (each `<= min(backoff.maxMs, maxWaitMs)`), plus a
   * pacing delay before every attempt (each `<= maxPacingDelayMs`): with the
   * defaults, `3 × (60s + 30s) + 4 × 5s` ≈ 4.8 minutes in the worst case. Pass
   * an `AbortSignal` to bound a call's total duration.
   *
   * @default 60000
   */
  maxWaitMs?: number;

  /**
   * Slack added to a reset-derived wait, in **milliseconds**, so the retry does
   * not race GitHub's clock to the boundary.
   *
   * @default 1000
   */
  waitPaddingMs?: number;

  /**
   * Wait used when a *primary* limit carries neither `Retry-After` nor a usable
   * reset, in **milliseconds**.
   *
   * @default 1000
   */
  fallbackWaitMs?: number;

  /**
   * Wait used when a *secondary* limit carries neither `Retry-After` nor a
   * usable reset, in **milliseconds**. GitHub's guidance for this case is to
   * wait at least one minute; retrying a second later into an active burst
   * throttle risks the integration being flagged (R5).
   *
   * Interaction with `maxWaitMs`: with both at their default of 60s, the first
   * such limit waits the full minute, and a second consecutive one escalates
   * to 120s, which exceeds the ceiling and surfaces a `GitHubRateLimitError`
   * instead of sleeping. Raise `maxWaitMs` to let the escalation be waited out.
   *
   * @default 60000
   */
  secondaryFallbackWaitMs?: number;

  /**
   * Retries after a rate limit. `0` disables retrying and surfaces the limit
   * immediately. Unit: **attempts beyond the first**.
   *
   * @default 3
   */
  maxRetries?: number;

  /** Backoff schedule for retries (R9). See {@link DEFAULT_BACKOFF}. */
  backoff?: Partial<BackoffConfig>;

  /**
   * Replay non-idempotent requests (POST, PATCH, …) after a rate limit.
   * Off by default: a limit can arrive after the write already landed (R9).
   *
   * @default false
   */
  retryNonIdempotent?: boolean;

  /**
   * Budget below which `isApproachingLimit()` reports true and an `exhaustion`
   * event fires. Unit: **requests remaining**. Matches the existing default at
   * `repos/src/client/http.ts:378`.
   *
   * @default 100
   */
  nearExhaustionThreshold?: number;

  /**
   * Floor the concurrency cap drops to after repeated secondary limits (R5, R8).
   * Unit: **concurrent requests**.
   *
   * @default 1
   */
  secondaryConcurrencyFloor?: number;

  /**
   * Multiplier applied to the advised wait per consecutive secondary limit, so
   * repeats escalate rather than repeating the same delay (R5). Must be `>= 1`:
   * a factor below one would make repeated limits wait *less*.
   *
   * @default 2
   */
  secondaryEscalationFactor?: number;

  /**
   * Consecutive clean responses before the concurrency cap steps back up
   * after a secondary limit. Unit: **responses**.
   *
   * @default 10
   */
  secondaryRecoveryAfter?: number;

  /**
   * Time and sleeping. Injected by tests so hour-long waits are exercised in
   * microseconds (R13).
   *
   * @default a real-time `SystemClock`
   */
  clock?: Clock;

  /**
   * Source of randomness for backoff jitter, returning `[0, 1)`. Injected by
   * tests so a jittered schedule is still deterministic (R13).
   *
   * @default Math.random
   */
  random?: () => number;

  /**
   * Map whatever a governed task returned — or threw — onto something with a
   * `status` and `headers`. The default understands `fetch`/`node-fetch`
   * responses, Axios responses and `AxiosError`s, and any object carrying
   * `status`/`statusCode` plus `headers`.
   *
   * Supply one only for a transport none of those describe (R13).
   */
  extractResponse?: (value: unknown) => ResponseLike | null;
}

/** Resolved configuration: every field present, every default applied. */
export interface ResolvedConfig {
  enabled: boolean;
  minIntervalMs: number;
  adaptivePacing: boolean;
  adaptiveThreshold: number;
  reserve: number;
  maxPacingDelayMs: number;
  maxConcurrent: number;
  maxWaitMs: number;
  waitPaddingMs: number;
  fallbackWaitMs: number;
  secondaryFallbackWaitMs: number;
  maxRetries: number;
  backoff: BackoffConfig;
  retryNonIdempotent: boolean;
  nearExhaustionThreshold: number;
  secondaryConcurrencyFloor: number;
  secondaryEscalationFactor: number;
  secondaryRecoveryAfter: number;
  clock: Clock;
  random: () => number;
  extractResponse: ((value: unknown) => ResponseLike | null) | undefined;
}

/** Default retry schedule: 1s, 2s, 4s … capped at 30s, with equal jitter. */
export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 1000,
  factor: 2,
  maxMs: 30_000,
  jitter: 'equal',
};

/** Every default in one place, so the documentation and the code cannot drift. */
export const DEFAULTS = {
  enabled: true,
  minIntervalMs: 0,
  adaptivePacing: true,
  adaptiveThreshold: 0.2,
  reserve: 1,
  maxPacingDelayMs: 5_000,
  maxConcurrent: 8,
  maxWaitMs: 60_000,
  waitPaddingMs: 1_000,
  fallbackWaitMs: 1_000,
  secondaryFallbackWaitMs: 60_000,
  maxRetries: 3,
  retryNonIdempotent: false,
  nearExhaustionThreshold: 100,
  secondaryConcurrencyFloor: 1,
  secondaryEscalationFactor: 2,
  secondaryRecoveryAfter: 10,
} as const;

/** Thrown by {@link resolveConfig} when an option is unusable (R12). */
export class RateLimiterConfigError extends Error {
  override readonly name = 'RateLimiterConfigError';
}

const JITTER_MODES: readonly JitterMode[] = ['none', 'full', 'equal'];

/** Every option name {@link resolveConfig} accepts. Anything else is rejected. */
const KNOWN_OPTIONS: ReadonlySet<string> = new Set([
  ...Object.keys(DEFAULTS),
  'backoff',
  'clock',
  'random',
  'extractResponse',
]);

const KNOWN_BACKOFF_OPTIONS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_BACKOFF));

/**
 * Apply defaults and reject nonsense.
 *
 * Validation happens here, at construction, rather than at the first request —
 * a limiter built with `maxConcurrent: 0` should fail while the stack trace
 * still points at the code that configured it.
 */
export function resolveConfig(options: RateLimiterOptions = {}): ResolvedConfig {
  // An option that is accepted but drives nothing is the exact defect at
  // `search/src/lib/RateLimitedSearchClient.ts:26-34`. A misspelt one —
  // `maxWaitMS` — would silently fall back to the default. Refuse both.
  const unknown = Object.keys(options).filter((key) => !KNOWN_OPTIONS.has(key));
  if (unknown.length > 0) {
    throw new RateLimiterConfigError(`unknown option(s): ${unknown.sort().join(', ')}`);
  }
  if (options.backoff !== undefined && (options.backoff === null || typeof options.backoff !== 'object')) {
    throw new RateLimiterConfigError('backoff must be an object');
  }
  const unknownBackoff = Object.keys(options.backoff ?? {}).filter((key) => !KNOWN_BACKOFF_OPTIONS.has(key));
  if (unknownBackoff.length > 0) {
    throw new RateLimiterConfigError(`unknown backoff option(s): ${unknownBackoff.sort().join(', ')}`);
  }

  const backoff: BackoffConfig = { ...DEFAULT_BACKOFF, ...options.backoff };

  const resolved: ResolvedConfig = {
    enabled: options.enabled ?? DEFAULTS.enabled,
    minIntervalMs: options.minIntervalMs ?? DEFAULTS.minIntervalMs,
    adaptivePacing: options.adaptivePacing ?? DEFAULTS.adaptivePacing,
    adaptiveThreshold: options.adaptiveThreshold ?? DEFAULTS.adaptiveThreshold,
    reserve: options.reserve ?? DEFAULTS.reserve,
    maxPacingDelayMs: options.maxPacingDelayMs ?? DEFAULTS.maxPacingDelayMs,
    maxConcurrent: options.maxConcurrent ?? DEFAULTS.maxConcurrent,
    maxWaitMs: options.maxWaitMs ?? DEFAULTS.maxWaitMs,
    waitPaddingMs: options.waitPaddingMs ?? DEFAULTS.waitPaddingMs,
    fallbackWaitMs: options.fallbackWaitMs ?? DEFAULTS.fallbackWaitMs,
    secondaryFallbackWaitMs: options.secondaryFallbackWaitMs ?? DEFAULTS.secondaryFallbackWaitMs,
    maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
    backoff,
    retryNonIdempotent: options.retryNonIdempotent ?? DEFAULTS.retryNonIdempotent,
    nearExhaustionThreshold: options.nearExhaustionThreshold ?? DEFAULTS.nearExhaustionThreshold,
    secondaryConcurrencyFloor: options.secondaryConcurrencyFloor ?? DEFAULTS.secondaryConcurrencyFloor,
    secondaryEscalationFactor: options.secondaryEscalationFactor ?? DEFAULTS.secondaryEscalationFactor,
    secondaryRecoveryAfter: options.secondaryRecoveryAfter ?? DEFAULTS.secondaryRecoveryAfter,
    clock: options.clock ?? new SystemClock(),
    random: options.random ?? Math.random,
    extractResponse: options.extractResponse,
  };

  nonNegative('minIntervalMs', resolved.minIntervalMs);
  nonNegative('maxPacingDelayMs', resolved.maxPacingDelayMs);
  nonNegative('waitPaddingMs', resolved.waitPaddingMs);
  nonNegative('fallbackWaitMs', resolved.fallbackWaitMs);
  nonNegative('secondaryFallbackWaitMs', resolved.secondaryFallbackWaitMs);
  nonNegative('reserve', resolved.reserve);
  nonNegative('nearExhaustionThreshold', resolved.nearExhaustionThreshold);
  positive('maxWaitMs', resolved.maxWaitMs);
  positive('maxConcurrent', resolved.maxConcurrent);
  integer('maxConcurrent', resolved.maxConcurrent);
  positive('secondaryConcurrencyFloor', resolved.secondaryConcurrencyFloor);
  integer('secondaryConcurrencyFloor', resolved.secondaryConcurrencyFloor);
  atLeastOne('secondaryEscalationFactor', resolved.secondaryEscalationFactor);
  positive('secondaryRecoveryAfter', resolved.secondaryRecoveryAfter);
  integer('secondaryRecoveryAfter', resolved.secondaryRecoveryAfter);
  nonNegative('maxRetries', resolved.maxRetries);
  integer('maxRetries', resolved.maxRetries);
  nonNegative('backoff.baseMs', resolved.backoff.baseMs);
  positive('backoff.factor', resolved.backoff.factor);
  positive('backoff.maxMs', resolved.backoff.maxMs);

  if (
    typeof resolved.adaptiveThreshold !== 'number' ||
    !Number.isFinite(resolved.adaptiveThreshold) ||
    resolved.adaptiveThreshold < 0 ||
    resolved.adaptiveThreshold > 1
  ) {
    throw new RateLimiterConfigError(
      `adaptiveThreshold must be a fraction between 0 and 1, received ${String(resolved.adaptiveThreshold)}`,
    );
  }

  if (!JITTER_MODES.includes(resolved.backoff.jitter)) {
    throw new RateLimiterConfigError(
      `backoff.jitter must be one of ${JITTER_MODES.join(', ')}, received ${String(resolved.backoff.jitter)}`,
    );
  }

  if (resolved.secondaryConcurrencyFloor > resolved.maxConcurrent) {
    throw new RateLimiterConfigError(
      `secondaryConcurrencyFloor (${resolved.secondaryConcurrencyFloor}) cannot exceed maxConcurrent (${resolved.maxConcurrent})`,
    );
  }

  if (typeof resolved.clock.now !== 'function' || typeof resolved.clock.sleep !== 'function') {
    throw new RateLimiterConfigError('clock must provide now() and sleep()');
  }

  if (typeof resolved.random !== 'function') {
    throw new RateLimiterConfigError('random must be a function returning a number in [0, 1)');
  }

  if (resolved.extractResponse !== undefined && typeof resolved.extractResponse !== 'function') {
    throw new RateLimiterConfigError('extractResponse must be a function');
  }

  return resolved;
}

function nonNegative(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RateLimiterConfigError(`${name} must be a finite number >= 0, received ${String(value)}`);
  }
}

function integer(name: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new RateLimiterConfigError(`${name} must be an integer, received ${String(value)}`);
  }
}

function atLeastOne(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new RateLimiterConfigError(`${name} must be a finite number >= 1, received ${String(value)}`);
  }
}

function positive(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RateLimiterConfigError(`${name} must be a finite number > 0, received ${String(value)}`);
  }
}
