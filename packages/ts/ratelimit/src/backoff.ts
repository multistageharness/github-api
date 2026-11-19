/**
 * @fileoverview Bounded, jittered retry backoff. Three unjittered schedules
 * exist across this repository today; synchronized retries from many clients
 * rebuild the very burst that caused the limit (R9).
 * @module backoff
 */

/** How much randomness to apply to a computed delay. */
export type JitterMode = 'none' | 'full' | 'equal';

/** Backoff schedule. Every field has a documented default in `config.ts` (R12). */
export interface BackoffConfig {
  /** Delay for the first retry, in ms. */
  baseMs: number;
  /** Multiplier applied per attempt. */
  factor: number;
  /** Ceiling on the computed delay before jitter, in ms. */
  maxMs: number;
  /** Jitter strategy. `equal` keeps a floor; `full` can return near-zero. */
  jitter: JitterMode;
}

/**
 * Delay before retry number `attempt` (1-based).
 *
 * The exponential term is capped *before* jitter is applied, so the returned
 * value can never exceed `maxMs` (R6, R9).
 *
 * - `none` — deterministic `base * factor^(attempt-1)`, capped.
 * - `equal` — half the capped delay plus a random half. Bounded below, which
 *   keeps a retry storm from collapsing onto zero.
 * - `full` — uniform across `[0, capped]`. Maximum spread, no floor.
 *
 * @param random injectable source of `[0, 1)`, so tests are deterministic (R13).
 */
export function computeBackoff(
  attempt: number,
  config: BackoffConfig,
  random: () => number = Math.random,
): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = config.baseMs * Math.pow(config.factor, n - 1);
  const capped = Math.min(config.maxMs, Number.isFinite(raw) ? raw : config.maxMs);
  const bounded = Math.max(0, capped);

  switch (config.jitter) {
    case 'none':
      return bounded;
    case 'full':
      return bounded * clampUnit(random());
    case 'equal':
    default:
      return bounded / 2 + (bounded / 2) * clampUnit(random());
  }
}

/** Keep a misbehaving `random` from pushing a delay outside its bounds. */
function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
