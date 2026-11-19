/**
 * The single `isCancel` chokepoint.
 *
 * Every clack prompt can be Ctrl-C'd, and when it is it resolves to a cancel
 * **symbol** — not a value, not a rejection. Code that forgets to check crashes
 * downstream on `undefined`. Routing every prompt through one helper turns
 * "is every prompt guarded?" from a code-review question into a grep.
 *
 * The prompt module is **injected** rather than imported, so no module under
 * `src/` (other than the `cli.ts` entry) depends on the prompt library
 * (Story 04/01/01 audits this) and the guard stays trivially testable without a TTY.
 */

import chalk from 'chalk';

/** The slice of `@clack/prompts` the cancel guard needs. */
export interface CancelAwareClack {
  isCancel: (value: unknown) => boolean;
  cancel?: (message?: string) => void;
}

export interface PromptOrExitDeps {
  clack?: CancelAwareClack;
  /** Injected for tests. */
  exit?: (code: number) => void;
  /** Fallback notice sink when `clack.cancel` is absent. */
  log?: (message: string) => void;
}

/**
 * Await a clack prompt and unwrap its value; exit 0 if the user cancelled.
 *
 * Taking a thunk rather than an already-running promise keeps the prompt lazily
 * constructed and makes the helper trivially mockable.
 *
 * @param promptFn Thunk that constructs and runs the prompt.
 * @returns The prompt's value, or `undefined` when `exit` is a non-throwing spy.
 */
export async function promptOrExit<T>(
  promptFn: () => Promise<T | symbol>,
  { clack, exit = process.exit, log = console.error }: PromptOrExitDeps = {}
): Promise<T | undefined> {
  if (!clack || typeof clack.isCancel !== 'function') {
    throw new TypeError('promptOrExit requires a clack module exposing isCancel()');
  }

  const value = await promptFn();

  if (clack.isCancel(value)) {
    const notice = chalk.yellow('Cancelled.');
    if (typeof clack.cancel === 'function') clack.cancel(notice);
    else log(notice);
    // Exit 0, NOT 1. A user pressing Ctrl-C has not encountered an error, and a
    // 1 here would make the cancel path indistinguishable from a real failure.
    exit(0);
    // Reachable only when `exit` is an injected spy that does not terminate.
    return undefined;
  }

  // `isCancel` is the guard that rules out the cancel symbol.
  return value as T;
}
