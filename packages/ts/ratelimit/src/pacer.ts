/**
 * @fileoverview Proactive pacing: spacing requests out *before* they are sent,
 * rather than only reacting once a limit has already been hit (R7).
 * @module pacer
 */

import type { ResourceState } from './types.js';

/** Pacing configuration. Defaults and units are documented in `config.ts`. */
export interface PacingConfig {
  /** Floor between two requests to the same resource, in ms. `0` disables it. */
  minIntervalMs: number;
  /** Whether to stretch the remaining budget over the remaining window. */
  adaptive: boolean;
  /**
   * Fraction of the budget below which adaptive pacing engages, `0`–`1`.
   *
   * Above it the budget is healthy and pacing adds nothing at all, which is
   * what keeps the fast path free of measurable delay (N1).
   */
  adaptiveThreshold: number;
  /** Requests held back from the budget so a burst cannot spend the last one. */
  reserve: number;
  /** Ceiling on any single pacing delay, in ms. */
  maxDelayMs: number;
}

/** Why the pacer chose a delay. */
export type PacingReason = 'min-interval' | 'adaptive';

/** A pacing decision. Pure — the caller does the sleeping. */
export interface PacingDecision {
  delayMs: number;
  reason: PacingReason;
}

/** Inputs to a pacing decision. */
export interface PacingInput {
  /** Budget as last reported for this resource, if any. */
  state: ResourceState | undefined;
  /** When the previous request to this resource was released, epoch ms. */
  lastRequestAtMs: number | undefined;
  /** Current time, epoch ms. */
  nowMs: number;
  config: PacingConfig;
}

/**
 * Decide how long to hold a request back.
 *
 * Two independent delays, and the larger wins:
 *
 * 1. **Minimum interval** — a flat floor since the last request to this
 *    resource. This is the behavior `repos` and `python.v3` already have.
 * 2. **Adaptive** — once the budget drops below `adaptiveThreshold` of its
 *    limit, spread what is left across the time still on the clock, so a
 *    nearly-exhausted budget is not spent in one burst and then blocked for the
 *    rest of the window.
 *
 * When the budget is healthy and no interval is owed, this returns `0` and the
 * caller sleeps not at all — the counter-metric that stops "throttle everything
 * to a crawl" from counting as success.
 */
export function computePacing(input: PacingInput): PacingDecision {
  const { state, lastRequestAtMs, nowMs, config } = input;

  let delayMs = 0;
  let reason: PacingReason = 'min-interval';

  if (config.minIntervalMs > 0 && lastRequestAtMs !== undefined) {
    const elapsed = nowMs - lastRequestAtMs;
    // A clock that jumped backwards must not manufacture a huge delay.
    if (elapsed >= 0 && elapsed < config.minIntervalMs) {
      delayMs = config.minIntervalMs - elapsed;
    }
  }

  const adaptiveMs = config.adaptive ? adaptiveInterval(state, nowMs, config) : 0;
  if (adaptiveMs > delayMs) {
    delayMs = adaptiveMs;
    reason = 'adaptive';
  }

  return { delayMs: Math.min(Math.max(0, delayMs), config.maxDelayMs), reason };
}

/**
 * Spread the remaining budget across the remaining window.
 *
 * Returns `0` unless the budget is both known and genuinely low, so the healthy
 * path stays free of added latency.
 */
function adaptiveInterval(
  state: ResourceState | undefined,
  nowMs: number,
  config: PacingConfig,
): number {
  if (state?.remaining === undefined || state.reset === undefined) {
    return 0;
  }

  const untilResetMs = state.reset * 1000 - nowMs;
  if (untilResetMs <= 0) {
    // The window has already rolled over; the next response will say so.
    return 0;
  }

  // Engage only when the budget is low relative to its own limit. Without a
  // reported limit there is no ratio to test, so pacing stays off rather than
  // guessing against a hardcoded 5000 — the mistake at `users/http.ts:81`.
  if (state.limit === undefined || state.limit <= 0) {
    return 0;
  }
  if (state.remaining / state.limit > config.adaptiveThreshold) {
    return 0;
  }

  const spendable = state.remaining - config.reserve;
  if (spendable <= 0) {
    // Nothing left to spend. Waiting for the reset is the limiter's job, not
    // the pacer's — returning the whole window here would sleep past the cap.
    return config.maxDelayMs;
  }

  return untilResetMs / spendable;
}

/**
 * Last-request timestamps, one per resource, so pacing one bucket never delays
 * another (R2).
 */
export class PacingTracker {
  #lastByResource = new Map<string, number>();

  get(resource: string): number | undefined {
    return this.#lastByResource.get(resource);
  }

  mark(resource: string, atMs: number): void {
    this.#lastByResource.set(resource, atMs);
  }

  clear(): void {
    this.#lastByResource.clear();
  }
}
