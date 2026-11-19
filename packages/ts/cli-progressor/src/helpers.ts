/**
 * Async helpers that wrap a task in a progress bar or spinner.
 */

import { ProgressBar, ProgressBarBuilder } from './progress-bar.js';
import { Colors } from './terminal.js';
import type { ConsoleRendererConfig, StateChange } from './types.js';

/** Advances the bar by `increment` (default 1). */
export type ProgressUpdater = (increment?: number) => void;

/** Message of a caught value, read the same way the JS original did (`error.message`). */
function messageOf(error: unknown): unknown {
  return (error as { message?: unknown }).message;
}

export class CLIProgressHelper {
  static async withProgress<T>(
    total: number,
    description: string,
    asyncTask: (update: ProgressUpdater) => Promise<T>,
    config: ConsoleRendererConfig = {}
  ): Promise<T> {
    const progressBar = new ProgressBarBuilder()
      .withTotal(total)
      .withDescription(description)
      .withConfig(config)
      .build();

    progressBar.start();

    try {
      const result = await asyncTask((increment = 1) => {
        progressBar.update(increment);
      });

      // Only complete if not already completed (prevents double rendering)
      if (!progressBar.isCompleted()) {
        progressBar.complete();
      }

      return result;
    } catch (error) {
      progressBar.stop();
      console.error(Colors.error(`\n✗ ${description} failed: ${messageOf(error)}`));
      throw error;
    }
  }

  static async withSpinner<T>(
    description: string,
    asyncTask: () => Promise<T>,
    config: ConsoleRendererConfig = {}
  ): Promise<T> {
    const spinner = ProgressBar.createSpinner(description, config);
    spinner.start();

    try {
      const result = await asyncTask();
      spinner.stop();
      console.log(Colors.success(`✓ ${description} completed`));
      return result;
    } catch (error) {
      spinner.stop();
      console.error(Colors.error(`✗ ${description} failed: ${messageOf(error)}`));
      throw error;
    }
  }

  static async withProgressAndState<T>(
    total: number,
    description: string,
    asyncTask: (update: ProgressUpdater) => Promise<T>,
    config: ConsoleRendererConfig = {}
  ): Promise<{ result: T; stateHistory: Array<StateChange & { timestamp: number }> }> {
    const progressBar = new ProgressBarBuilder()
      .withTotal(total)
      .withDescription(description)
      .withConfig(config)
      .build();

    const stateHistory: Array<StateChange & { timestamp: number }> = [];

    // Track state changes
    const unsubscribeState = progressBar.onStateChange((stateData) => {
      stateHistory.push({
        timestamp: Date.now(),
        ...stateData,
      });
    });

    progressBar.start();

    try {
      const result = await asyncTask((increment = 1) => {
        progressBar.update(increment);
      });

      if (!progressBar.isCompleted()) {
        progressBar.complete();
      }

      unsubscribeState();
      return { result, stateHistory };
    } catch (error) {
      progressBar.stop();
      unsubscribeState();
      console.error(Colors.error(`\n✗ ${description} failed: ${messageOf(error)}`));
      throw error;
    }
  }
}
