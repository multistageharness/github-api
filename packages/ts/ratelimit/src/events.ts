/**
 * @fileoverview A minimal typed emitter. Node's `EventEmitter` would do, but the
 * package ships zero runtime dependencies and must work unchanged in any ES2022
 * host (N3) — and this way payloads are only built when somebody is listening.
 * @module events
 */

import type { RateLimiterEventName, RateLimiterEvents, RateLimiterListener } from './types.js';

/**
 * Typed pub/sub with no cost when nothing is subscribed.
 *
 * `emit` takes a **thunk**, not a payload. With no listeners the thunk is never
 * called, so building an event object costs nothing on the hot path — which is
 * what R10's "imposes no cost when no consumer subscribes" actually requires.
 */
export class EventBus {
  #listeners = new Map<RateLimiterEventName, Set<(payload: never) => void>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends RateLimiterEventName>(event: K, listener: RateLimiterListener<K>): () => void {
    let set = this.#listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  /** Subscribe for exactly one delivery. */
  once<K extends RateLimiterEventName>(event: K, listener: RateLimiterListener<K>): () => void {
    const off = this.on(event, ((payload: RateLimiterEvents[K]) => {
      off();
      listener(payload);
    }) as RateLimiterListener<K>);
    return off;
  }

  /** Unsubscribe. Safe to call for a listener that was never registered. */
  off<K extends RateLimiterEventName>(event: K, listener: RateLimiterListener<K>): void {
    this.#listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  /** True when at least one listener is registered for `event`. */
  has(event: RateLimiterEventName): boolean {
    const set = this.#listeners.get(event);
    return set !== undefined && set.size > 0;
  }

  /**
   * Deliver an event, building its payload only if somebody is listening.
   *
   * A throwing listener must never take down the request it was reporting on,
   * so failures are swallowed here. The package writes nothing to stdout or
   * stderr of its own accord (N9), and that includes complaining about a bad
   * listener.
   */
  emit<K extends RateLimiterEventName>(event: K, build: () => RateLimiterEvents[K]): void {
    const set = this.#listeners.get(event);
    if (set === undefined || set.size === 0) {
      return;
    }
    const payload = build();
    // Copy first: a listener may unsubscribe itself during delivery.
    for (const listener of [...set]) {
      try {
        (listener as RateLimiterListener<K>)(payload);
      } catch {
        // Reporting is best-effort by design.
      }
    }
  }

  /** Drop every listener. */
  clear(): void {
    this.#listeners.clear();
  }
}
