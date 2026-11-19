/**
 * @fileoverview Cancellation and time bounds, composed (R9).
 *
 * Three packages in this repository build an `AbortController` and a
 * `setTimeout` by hand, each clears it differently, and none of the three
 * accepts a caller's signal — so a consumer cannot cancel a request at all.
 * Two more have no timeout whatsoever.
 *
 * `AbortSignal.any` would express this in one line, but it landed in Node 20
 * and every package here declares `node >= 18`, so the composition is written
 * out.
 * @module signal
 */

/** A composed signal and the means to tell what ended it. */
export interface ComposedSignal {
  /** The signal to hand the transport. */
  signal: AbortSignal;
  /** Whether the timeout is what fired, as opposed to the caller's signal. */
  timedOut: () => boolean;
  /** Whether the caller's signal is what fired. */
  cancelled: () => boolean;
  /** Clear the timer and drop the listener. Safe to call more than once. */
  cleanup: () => void;
}

/**
 * Compose a caller's signal with a timeout: whichever fires first wins, and the
 * other is cleaned up (R9).
 *
 * The timer is `unref`ed where the runtime supports it and cleared in every
 * exit path, so a settled request never holds a CLI process open.
 */
export function composeSignal(timeoutMs: number, callerSignal?: AbortSignal): ComposedSignal {
  const controller = new AbortController();
  let didTimeout = false;
  let didCancel = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onCallerAbort: (() => void) | undefined;

  const cleanup = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (onCallerAbort !== undefined && callerSignal !== undefined) {
      callerSignal.removeEventListener('abort', onCallerAbort);
      onCallerAbort = undefined;
    }
  };

  // A signal that already aborted must abort this request immediately rather
  // than waiting for an event that has already been delivered.
  if (callerSignal?.aborted === true) {
    didCancel = true;
    controller.abort(callerSignal.reason);
    return { signal: controller.signal, timedOut: () => false, cancelled: () => true, cleanup };
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
    (timer as { unref?: () => void }).unref?.();
  }

  if (callerSignal !== undefined) {
    onCallerAbort = (): void => {
      didCancel = true;
      cleanup();
      controller.abort(callerSignal.reason);
    };
    callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    cancelled: () => didCancel,
    cleanup,
  };
}

/** Whether a thrown value is an abort, however the runtime spells it. */
export function isAbortLike(error: unknown): boolean {
  const named = error as { name?: unknown; code?: unknown };
  return named?.name === 'AbortError' || named?.name === 'TimeoutError' || named?.code === 'ABORT_ERR';
}
