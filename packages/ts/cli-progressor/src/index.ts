/**
 * @internal/cli-progressor — CLI progress tracking with Strategy, Builder,
 * Observer and State Machine patterns.
 *
 * Library entry point. The demo that `main.mjs` used to run when executed
 * directly now lives in the `progress-demo` bin (`src/cli.ts`).
 */

export { ProgressBar, ProgressBarBuilder, MultiProgressManager } from './progress-bar.js';
export {
  ProgressRenderer,
  ConsoleProgressRenderer,
  SilentProgressRenderer,
  MultiProgressRenderer,
} from './renderers.js';
export { ProgressTracker, StandardProgressCalculator } from './tracker.js';
export { CLIProgressHelper } from './helpers.js';
export { Colors, TerminalUtils, Spinner } from './terminal.js';
export { ProcessManager } from './process-manager.js';

export type { ProgressUpdater } from './helpers.js';
export type { SpinnerPreset } from './terminal.js';
export type {
  CalculatedProgress,
  ConsoleRendererConfig,
  ProgressData,
  ProgressObserver,
  ProgressState,
  ProgressStream,
  ResolvedConsoleRendererConfig,
  StateChange,
  StateObserver,
} from './types.js';
