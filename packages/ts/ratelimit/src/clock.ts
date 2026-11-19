/**
 * @fileoverview Injectable time. Nothing in the package calls `Date.now()` or
 * `setTimeout` directly — every wait goes through a {@link Clock}, which is what
 * lets the whole suite exercise hour-long waits without elapsed wall time (R13).
 * @module clock
 */

import type { Clock } from './types.js';

/** Thrown when a wait is cancelled through an `AbortSignal` (R6). */
export class AbortError extends Error {
  override readonly name = 'AbortError';

  constructor(message = 'The operation was aborted') {
    super(message);
  }
}

/** True for both our {@link AbortError} and the platform's `DOMException`. */
export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null | undefined)?.name === 'AbortError';
}

/** Reject immediately if the signal is already aborted. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AbortError();
  }
}

/** Options for {@link SystemClock}. */
export interface SystemClockOptions {
  /**
   * Call `unref()` on every wait timer (Node only), so a pending wait does not
   * keep the process alive.
   *
   * Off by default, and deliberately so: a rate-limit wait is usually the
   * *only* pending work once the throttled response has been read, and an
   * unref'd timer then lets Node exit mid-wait — exit code 13 under ESM, a
   * silent `0` under CJS — so the retry never runs. Opt in only when the
   * process has other work that will keep it alive and abandoning the wait on
   * exit is acceptable.
   *
   * @default false
   */
  unref?: boolean;
}

/**
 * The default clock: real time, real timers.
 *
 * Wait timers are ref'd by default: a pending wait *is* the work, so it keeps
 * the process alive until it resolves or its signal aborts.
 */
export class SystemClock implements Clock {
  readonly #unref: boolean;

  constructor(options: SystemClockOptions = {}) {
    this.#unref = options.unref === true;
  }

  now(): number {
    return Date.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new AbortError());
    }
    if (!(ms > 0)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      if (this.#unref) {
        // Node-only, opt-in: let the process exit even while this wait is pending.
        (timer as unknown as { unref?: () => void }).unref?.();
      }

      const onAbort = (): void => {
        cleanup();
        reject(new AbortError());
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/**
 * A clock whose time only moves when a test moves it, and whose sleeps resolve
 * the moment {@link ManualClock.advance} passes their deadline.
 *
 * Exported because the conformance runner and every consumer's tests need the
 * same fake — writing a second one per package is how the current suites ended
 * up asserting nothing about timing at all.
 */
export class ManualClock implements Clock {
  #now: number;
  #pending: Array<{ at: number; resolve: () => void; reject: (e: unknown) => void; cleanup: () => void }> =
    [];

  constructor(startMs = 0) {
    this.#now = startMs;
  }

  now(): number {
    return this.#now;
  }

  /** Number of sleeps still outstanding (not yet settled or aborted). */
  get pendingCount(): number {
    return this.#pending.length;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new AbortError());
    }
    if (!(ms > 0)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const entry = {
        at: this.#now + ms,
        resolve,
        reject,
        cleanup: (): void => {
          signal?.removeEventListener('abort', onAbort);
        },
      };

      const onAbort = (): void => {
        const i = this.#pending.indexOf(entry);
        if (i >= 0) {
          this.#pending.splice(i, 1);
        }
        entry.cleanup();
        reject(new AbortError());
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.#pending.push(entry);
    });
  }

  /**
   * Move time forward and settle every sleep whose deadline has passed.
   *
   * Yields to the microtask queue after settling so awaiting callers get a
   * chance to run before the caller asserts.
   */
  async advance(ms: number): Promise<void> {
    this.#now += ms;
    const due = this.#pending.filter((p) => p.at <= this.#now);
    this.#pending = this.#pending.filter((p) => p.at > this.#now);
    for (const entry of due) {
      entry.cleanup();
      entry.resolve();
    }
    // Let continuations run — two turns covers a sleep that schedules a sleep.
    await Promise.resolve();
    await Promise.resolve();
  }

  /** Settle every outstanding sleep, however far in the future. */
  async runAll(): Promise<void> {
    while (this.#pending.length > 0) {
      const next = Math.min(...this.#pending.map((p) => p.at));
      await this.advance(Math.max(0, next - this.#now));
    }
  }
}
