/**
 * @fileoverview A FIFO semaphore whose capacity can shrink and recover at
 * runtime. Secondary limits are provoked by parallelism, so capping the request
 * *rate* is not enough — in-flight count has to be capped too (R8).
 * @module semaphore
 */

import { AbortError } from './clock.js';

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
}

/**
 * Counting semaphore with a mutable limit.
 *
 * Requests over the cap queue rather than fail (R8), and a queued request can be
 * abandoned through its `AbortSignal` without leaking a slot (R6).
 */
export class Semaphore {
  #limit: number;
  #inFlight = 0;
  #queue: Waiter[] = [];

  constructor(limit: number) {
    this.#limit = Math.max(1, Math.floor(limit));
  }

  /** Current cap on concurrent holders. */
  get limit(): number {
    return this.#limit;
  }

  /** Slots currently held. */
  get inFlight(): number {
    return this.#inFlight;
  }

  /** Callers waiting for a slot. */
  get queued(): number {
    return this.#queue.length;
  }

  /**
   * Take a slot, waiting in FIFO order when the cap is reached.
   *
   * @returns a release function. It is idempotent, so a caller that releases in
   *          both a `finally` and an error path cannot free the same slot twice
   *          and let an extra request through.
   */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw new AbortError();
    }

    if (this.#inFlight < this.#limit) {
      this.#inFlight++;
      return this.#makeRelease();
    }

    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      };

      const onAbort = (): void => {
        const index = this.#queue.indexOf(waiter);
        if (index >= 0) {
          this.#queue.splice(index, 1);
        }
        waiter.cleanup();
        reject(new AbortError());
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.#queue.push(waiter);
    });

    // The slot was handed over by `#release`; `#inFlight` is already incremented.
    return this.#makeRelease();
  }

  #makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.#release();
    };
  }

  #release(): void {
    this.#inFlight--;
    this.#drain();
  }

  /** Hand slots to queued waiters while capacity allows. */
  #drain(): void {
    while (this.#inFlight < this.#limit && this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (next === undefined) {
        return;
      }
      this.#inFlight++;
      next.cleanup();
      next.resolve();
    }
  }

  /**
   * Change the cap.
   *
   * Lowering it never cancels work already in flight — it only withholds new
   * slots until the count falls back under the new cap. Raising it immediately
   * releases whatever the new headroom allows.
   */
  setLimit(limit: number): void {
    this.#limit = Math.max(1, Math.floor(limit));
    this.#drain();
  }

  /** Fail every queued waiter. Used on `close()`. */
  drainWithError(error: unknown): void {
    const queued = this.#queue;
    this.#queue = [];
    for (const waiter of queued) {
      waiter.cleanup();
      waiter.reject(error);
    }
  }
}
