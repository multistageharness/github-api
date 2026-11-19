/**
 * @fileoverview How long to wait, and the ceiling that keeps every wait bounded.
 * No sleep path in this package is unbounded, and none is uncancellable (R6).
 * @module wait
 */

import type { Classification } from './types.js';

/** Inputs to a wait decision. Pure — no clock reads, no I/O. */
export interface WaitInput {
  /** The verdict on the response that triggered this wait. */
  classification: Pick<Classification, 'kind' | 'retryAfterMs' | 'resetAtMs'>;
  /** Current time, epoch ms. */
  nowMs: number;
  /** Hard ceiling. A computed wait above this is refused, not truncated. */
  maxWaitMs: number;
  /** Slack added to a reset-derived wait so we do not race GitHub's clock. */
  paddingMs: number;
  /** Used when neither `Retry-After` nor a reset is available. */
  fallbackMs: number;
  /**
   * Used instead of `fallbackMs` when the limit is *secondary* and neither
   * `Retry-After` nor a reset is available. Defaults to `fallbackMs`.
   */
  secondaryFallbackMs?: number;
  /** How many secondary limits have been seen in a row, for escalation (R5). */
  secondaryStreak?: number;
  /** Multiplier applied per consecutive secondary limit. */
  secondaryEscalationFactor?: number;
}

/** The outcome of a wait decision. */
export interface WaitDecision {
  /** How long to sleep, in ms. Always `>= 0` and always `<= maxWaitMs`. */
  waitMs: number;
  /** True when the wait GitHub asked for is longer than we are willing to sleep. */
  exceedsCeiling: boolean;
  /** What the wait would have been without the ceiling. */
  requestedMs: number;
  /** True when `Retry-After` decided this, rather than `x-ratelimit-reset`. */
  retryAfterUsed: boolean;
}

/**
 * Decide how long to wait after a rate-limited response.
 *
 * Precedence is `Retry-After`, then the reset timestamp, then the configured
 * fallback (R4). Whatever the source, three invariants hold:
 *
 * - The result is never negative. A reset already in the past, or a client
 *   clock running ahead of GitHub's, yields `0` rather than a negative sleep.
 * - The result never exceeds `maxWaitMs`. When the honest wait is longer, the
 *   decision says so and the caller surfaces a failure instead of sleeping
 *   through it — a reset an hour out does not become an hour-long sleep.
 * - Consecutive secondary limits escalate. Repeating the same delay into a
 *   burst throttle is what keeps the throttle engaged (R5).
 */
export function computeWait(input: WaitInput): WaitDecision {
  const {
    classification,
    nowMs,
    maxWaitMs,
    paddingMs,
    fallbackMs,
    secondaryFallbackMs,
    secondaryStreak = 0,
    secondaryEscalationFactor = 2,
  } = input;

  const fallback =
    classification.kind === 'secondary' && secondaryFallbackMs !== undefined ? secondaryFallbackMs : fallbackMs;

  let requestedMs: number;
  let retryAfterUsed = false;

  if (classification.retryAfterMs !== undefined && Number.isFinite(classification.retryAfterMs)) {
    requestedMs = classification.retryAfterMs;
    retryAfterUsed = true;
  } else if (classification.resetAtMs !== undefined && Number.isFinite(classification.resetAtMs)) {
    requestedMs = classification.resetAtMs - nowMs + paddingMs;
  } else {
    requestedMs = fallback;
  }

  if (!Number.isFinite(requestedMs)) {
    requestedMs = fallback;
  }

  // Escalate repeated secondary limits. The first one waits as instructed; each
  // one after it waits longer, because the instruction plainly did not work.
  if (classification.kind === 'secondary' && secondaryStreak > 0) {
    requestedMs *= Math.pow(secondaryEscalationFactor, secondaryStreak);
  }

  requestedMs = Math.max(0, requestedMs);

  return {
    requestedMs,
    waitMs: Math.min(requestedMs, maxWaitMs),
    exceedsCeiling: requestedMs > maxWaitMs,
    retryAfterUsed,
  };
}
