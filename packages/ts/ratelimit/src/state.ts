/**
 * @fileoverview Per-resource budget tracking. Each GitHub resource is an
 * independent budget with its own limit and its own reset clock, so spending
 * from one never appears to spend from another (R2).
 * @module state
 */

import { hasNoRateLimitHeaders } from './headers.js';
import {
  FALLBACK_RESOURCE,
  WELL_KNOWN_RESOURCES,
  type RateLimitStatus,
  type ResourceState,
} from './types.js';

/**
 * A fixed-size map of resource name to budget.
 *
 * Memory is bounded by the number of distinct resources GitHub reports, not by
 * process lifetime or request count — there is no per-request history here (N2).
 */
export class RateLimitStore {
  #byResource = new Map<string, ResourceState>();

  constructor() {
    for (const resource of WELL_KNOWN_RESOURCES) {
      this.#byResource.set(resource, { resource });
    }
  }

  /** Every tracked resource, in insertion order. */
  snapshot(): ResourceState[] {
    return [...this.#byResource.values()].map((entry) => ({ ...entry }));
  }

  /** One resource's raw state, or `undefined` if never seen. */
  get(resource: string): ResourceState | undefined {
    const entry = this.#byResource.get(resource);
    return entry === undefined ? undefined : { ...entry };
  }

  /**
   * Merge what a response reported into a resource's budget.
   *
   * Only fields the response actually carried are written. A response with no
   * rate-limit headers leaves the budget exactly as it was — it neither zeroes
   * it nor marks it unlimited (R1).
   *
   * Responses complete out of order under concurrency, so an observation is
   * not simply "the latest": one from an *older* window (a smaller `reset`) is
   * ignored outright, and within the *same* window the budget only ever moves
   * down — `remaining` keeps the minimum seen and `used` the maximum (R1).
   *
   * @returns the resulting state, or `null` when nothing was recorded.
   */
  update(resource: string, parsed: Partial<ResourceState>, observedAt: number): ResourceState | null {
    if (hasNoRateLimitHeaders(parsed)) {
      return null;
    }

    const key = resource === '' ? FALLBACK_RESOURCE : resource;
    const previous = this.#byResource.get(key) ?? { resource: key };

    if (parsed.reset !== undefined && previous.reset !== undefined && parsed.reset < previous.reset) {
      // A late response from a window that has already rolled over.
      return null;
    }
    const sameWindow = parsed.reset !== undefined && parsed.reset === previous.reset;

    const next: ResourceState = { ...previous, resource: key, observedAt };

    if (parsed.limit !== undefined) {
      next.limit = parsed.limit;
    }
    if (parsed.remaining !== undefined) {
      next.remaining =
        sameWindow && previous.remaining !== undefined
          ? Math.min(previous.remaining, parsed.remaining)
          : parsed.remaining;
    }
    if (parsed.used !== undefined) {
      next.used =
        sameWindow && previous.used !== undefined ? Math.max(previous.used, parsed.used) : parsed.used;
    }
    if (parsed.reset !== undefined) {
      // A new window resets the spent counters the old window reported, so a
      // stale `remaining` from the previous window is not carried forward.
      if (previous.reset !== undefined && parsed.reset > previous.reset && parsed.remaining === undefined) {
        delete next.remaining;
        delete next.used;
      }
      next.reset = parsed.reset;
    }

    this.#byResource.set(key, next);
    return { ...next };
  }

  /** Derived, caller-facing view of one resource (R10). */
  status(resource: string, nowMs: number): RateLimitStatus {
    const entry = this.#byResource.get(resource) ?? { resource };
    return toStatus(entry, nowMs);
  }

  /** Derived view of every tracked resource (R10). */
  allStatuses(nowMs: number): RateLimitStatus[] {
    return [...this.#byResource.values()].map((entry) => toStatus(entry, nowMs));
  }

  /** Forget everything. Used by tests and by consumers reusing a client across tokens. */
  clear(): void {
    this.#byResource.clear();
    for (const resource of WELL_KNOWN_RESOURCES) {
      this.#byResource.set(resource, { resource });
    }
  }
}

/**
 * Add the derived fields consumers actually render.
 *
 * `millisecondsUntilReset` is floored at zero: a reset timestamp in the past, or
 * a clock skewed against GitHub's, must never yield a negative interval (R6).
 */
export function toStatus(entry: ResourceState, nowMs: number): RateLimitStatus {
  const resetAtMs = entry.reset === undefined ? undefined : entry.reset * 1000;
  const untilReset = resetAtMs === undefined ? undefined : Math.max(0, resetAtMs - nowMs);

  const status: RateLimitStatus = {
    ...entry,
    resetAt: resetAtMs === undefined ? null : new Date(resetAtMs),
    exhausted: entry.remaining === 0,
  };

  if (untilReset !== undefined) {
    status.millisecondsUntilReset = untilReset;
    status.secondsUntilReset = Math.ceil(untilReset / 1000);
  }

  return status;
}

/**
 * True when the budget is known and has fallen below `threshold`.
 *
 * Unknown budget is not "approaching" — reporting exhaustion for a resource no
 * response has described yet is how a missing header becomes a false alarm.
 */
export function isApproachingLimit(entry: ResourceState | undefined, threshold: number): boolean {
  return entry?.remaining !== undefined && entry.remaining < threshold;
}
