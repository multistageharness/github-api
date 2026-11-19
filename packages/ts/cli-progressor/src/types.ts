/**
 * Public data types for @internal/cli-progressor.
 */

import type { ProgressTracker } from './tracker.js';

export type ProgressState = 'idle' | 'active' | 'completed' | 'stopped';

export interface ProgressData {
  current: number;
  total: number;
  /** 0-100, rounded to two decimals. */
  percentage: number;
  /** Seconds since the tracker started. */
  elapsed: number;
  /** Estimated seconds remaining (0 when unknown). */
  eta: number;
  /** Items per second (moving average). */
  speed: number;
  description: string;
  isComplete: boolean;
  /** True when total <= 0 (spinner). */
  isIndeterminate: boolean;
  state: ProgressState;
}

/** What a progress calculator derives from the raw counters. */
export type CalculatedProgress = Omit<ProgressData, 'description' | 'state'>;

export interface StateChange {
  newState: string;
  oldState: string;
  tracker: ProgressTracker;
}

export type ProgressObserver =
  | ((progressData: ProgressData) => void)
  | { onProgress(progressData: ProgressData): void };

export type StateObserver =
  | ((change: StateChange) => void)
  | { onStateChange(change: StateChange): void };

/** Minimal writable target for ConsoleProgressRenderer. */
export interface ProgressStream {
  write(chunk: string): unknown;
  isTTY?: boolean;
  columns?: number;
}

export interface ConsoleRendererConfig {
  barLength?: number;
  filledChar?: string;
  emptyChar?: string;
  showETA?: boolean;
  showSpeed?: boolean;
  showPercentage?: boolean;
  /** Decimal places for the percentage. Default 1. */
  precision?: number;
  useColors?: boolean;
  /**
   * `{key}` template. Keys: any ProgressData key, plus `{bar}` (bar body,
   * no brackets). `{eta}` and `{elapsed}` are whole seconds.
   */
  template?: string | null;
  updateThrottle?: number;
  testMode?: boolean;
  /** Output target. Default `process.stdout`. */
  stream?: ProgressStream;
}

/** ConsoleProgressRenderer's config after defaults are applied. */
export type ResolvedConsoleRendererConfig = Required<
  Omit<ConsoleRendererConfig, 'stream' | 'template'>
> & {
  template: string | null;
};
