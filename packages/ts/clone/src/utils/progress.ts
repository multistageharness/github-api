/**
 * @fileoverview Progress Management utilities for Git operations
 * @module progress
 */

import { ProgressBarBuilder } from '@internal/cli-progressor';
import type { ProgressBar } from '@internal/cli-progressor';

/**
 * Progress stages for git clone operations
 */
export const CLONE_STAGES = {
  INITIALIZING: 'initializing',
  CLONING: 'cloning',
  RESOLVING_DELTAS: 'resolving_deltas',
  CHECKING_OUT: 'checking_out',
  COMPLETE: 'complete',
} as const;

/** A clone stage value (one of the {@link CLONE_STAGES} string constants). */
export type CloneStage = (typeof CLONE_STAGES)[keyof typeof CLONE_STAGES];

/** Payload passed to the `onProgress` callback. */
export interface ProgressEvent {
  operationId: string | null;
  stage: CloneStage | null;
  step: number;
  total: number;
  percentage: number;
  eta?: unknown;
  description?: string;
  message?: string;
}

/** Payload passed to the `onStageChange` callback. */
export interface StageChangeEvent {
  operationId: string | null;
  stage: CloneStage | null;
  description?: string;
  timestamp: string;
}

/** Payload passed to the `onComplete` callback. */
export interface CompleteEvent {
  operationId: string | null;
  result?: unknown;
  error?: string;
  stage?: CloneStage | null;
}

/** Options accepted by {@link GitProgressManager}. */
export interface GitProgressManagerOptions {
  silent?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  onStageChange?: (event: StageChangeEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
  enableCLI?: boolean;
}

/** Parsed git progress data produced by the private parser. */
interface ParsedGitProgress {
  stage: CloneStage;
  message: string;
  step: number;
}

/**
 * Progress Manager for Git Operations
 * Provides a clean interface for consuming applications to control progress display
 */
export class GitProgressManager {
  silent: boolean;
  onProgress?: (event: ProgressEvent) => void;
  onStageChange?: (event: StageChangeEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
  enableCLI: boolean;

  currentStage: CloneStage | null;
  totalSteps: number;
  currentStep: number;
  progressBar: ProgressBar | null;
  operationId: string | null;
  /** Position last pushed to `progressBar` (clamped to `0..totalSteps`). */
  #barPosition = 0;

  /**
   * Create a new progress manager
   * @param options - Configuration options
   */
  constructor(options: GitProgressManagerOptions = {}) {
    this.silent = options.silent !== false; // Default to silent
    this.onProgress = options.onProgress;
    this.onStageChange = options.onStageChange;
    this.onComplete = options.onComplete;
    this.enableCLI = options.enableCLI || false;

    this.currentStage = null;
    this.totalSteps = 0;
    this.currentStep = 0;
    this.progressBar = null;
    this.operationId = null;
  }

  /**
   * Start a new progress tracking operation
   * @param operationId - Unique identifier for the operation
   * @param description - Operation description
   * @param totalSteps - Total number of steps
   */
  start(operationId: string, description: string, totalSteps = 100): void {
    this.operationId = operationId;
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.#barPosition = 0;
    this.currentStage = CLONE_STAGES.INITIALIZING;

    // Only create CLI progress bar if explicitly enabled
    if (this.enableCLI && !this.silent) {
      this.progressBar = new ProgressBarBuilder()
        .withTotal(totalSteps)
        .withDescription(description)
        .withBarLength(40)
        .showETA(true)
        .onProgress((data) => {
          // Call user-provided progress callback if available
          if (this.onProgress) {
            this.onProgress({
              operationId: this.operationId,
              stage: this.currentStage,
              step: data.current,
              total: data.total,
              percentage: data.percentage,
              eta: data.eta,
              description: description,
            });
          }
        })
        .build();

      this.progressBar.start();
    }

    // Always call callbacks even in silent mode
    this._notifyStageChange(this.currentStage, description);
  }

  /**
   * Update progress to a specific step
   * @param step - Current step number
   * @param message - Optional status message
   */
  update(step: number, message?: string): void {
    this.currentStep = step;

    if (this.progressBar) {
      this.#moveBarTo(step);
      if (message) {
        this.progressBar.setDescription(message);
      }
    }

    // Always notify callbacks
    if (this.onProgress) {
      this.onProgress({
        operationId: this.operationId,
        stage: this.currentStage,
        step: step,
        total: this.totalSteps,
        percentage: Math.round((step / this.totalSteps) * 100),
        message: message,
      });
    }
  }

  /**
   * Move the CLI bar to the absolute position `step`.
   *
   * `ProgressBar.update()` is incremental (it advances by its argument), while
   * this manager tracks absolute positions, so only the difference is pushed.
   */
  #moveBarTo(step: number): void {
    if (!this.progressBar) return;
    const target = Math.min(Math.max(step, 0), this.totalSteps);
    const delta = target - this.#barPosition;
    if (delta !== 0) {
      this.progressBar.update(delta);
      this.#barPosition = target;
    }
  }

  /**
   * Advance progress by a number of steps
   * @param steps - Number of steps to advance
   * @param message - Optional status message
   */
  advance(steps = 1, message?: string): void {
    this.update(this.currentStep + steps, message);
  }

  /**
   * Change the current operation stage
   * @param stage - New stage (use CLONE_STAGES constants)
   * @param description - Stage description
   */
  setStage(stage: CloneStage, description?: string): void {
    this.currentStage = stage;
    this._notifyStageChange(stage, description);

    if (this.progressBar && description) {
      this.progressBar.setDescription(description);
    }
  }

  /**
   * Mark the operation as complete
   * @param result - Operation result data
   */
  complete(result: unknown = {}): void {
    this.currentStage = CLONE_STAGES.COMPLETE;

    if (this.progressBar) {
      this.#moveBarTo(this.totalSteps);
      this.progressBar.complete();
    }

    if (this.onComplete) {
      this.onComplete({
        operationId: this.operationId,
        result: result,
      });
    }

    this._notifyStageChange(CLONE_STAGES.COMPLETE, 'Operation completed');
  }

  /**
   * Handle an error during progress tracking
   * @param error - The error that occurred
   */
  error(error: Error): void {
    if (this.progressBar) {
      this.progressBar.error(error.message);
    }

    if (this.onComplete) {
      this.onComplete({
        operationId: this.operationId,
        error: error.message,
        stage: this.currentStage,
      });
    }
  }

  /**
   * Create a progress callback function for simple-git operations
   * @returns Progress callback compatible with simple-git
   */
  createGitProgressCallback(): (progress: string) => void {
    return (progress: string) => {
      // Parse git progress output
      const progressData = this._parseGitProgress(progress);

      if (progressData) {
        // Update stage first if it changed
        if (progressData.stage && progressData.stage !== this.currentStage) {
          this.setStage(progressData.stage, progressData.message);
        }

        // Then update progress
        this.update(progressData.step, progressData.message);
      }
    };
  }

  /**
   * Parse git command progress output
   * @param progress - Raw progress string from git
   * @returns Parsed progress data
   */
  private _parseGitProgress(progress: string): ParsedGitProgress | null {
    if (!progress || typeof progress !== 'string') {
      return null;
    }

    const progressStr = progress.toString().trim();

    // Common git progress patterns
    if (progressStr.includes('Cloning into')) {
      return { stage: CLONE_STAGES.CLONING, message: 'Initializing clone...', step: 10 };
    }

    if (progressStr.includes('remote: Counting objects')) {
      return { stage: CLONE_STAGES.CLONING, message: 'Counting objects...', step: 20 };
    }

    if (progressStr.includes('Receiving objects')) {
      const match = progressStr.match(/Receiving objects:\s*(\d+)%/);
      if (match && match[1] !== undefined) {
        const percentage = parseInt(match[1]);
        const step = Math.round((percentage / 100) * 60) + 20; // 20-80 range
        return { stage: CLONE_STAGES.CLONING, message: `Receiving objects: ${percentage}%`, step };
      }
    }

    if (progressStr.includes('Resolving deltas')) {
      const match = progressStr.match(/Resolving deltas:\s*(\d+)%/);
      if (match && match[1] !== undefined) {
        const percentage = parseInt(match[1]);
        const step = Math.round((percentage / 100) * 15) + 80; // 80-95 range
        return {
          stage: CLONE_STAGES.RESOLVING_DELTAS,
          message: `Resolving deltas: ${percentage}%`,
          step,
        };
      }
    }

    if (progressStr.includes('Checking out files')) {
      return { stage: CLONE_STAGES.CHECKING_OUT, message: 'Checking out files...', step: 95 };
    }

    return null;
  }

  /**
   * Notify stage change callback
   */
  private _notifyStageChange(stage: CloneStage | null, description?: string): void {
    if (this.onStageChange) {
      this.onStageChange({
        operationId: this.operationId,
        stage: stage,
        description: description,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Create a progress manager with common configurations
 * @param options - Configuration options
 * @returns Configured progress manager
 */
export function createProgressManager(options: GitProgressManagerOptions = {}): GitProgressManager {
  return new GitProgressManager(options);
}

/**
 * Helper function to create a silent progress manager (no output)
 * Only fires callbacks if provided
 * @param callbacks - Progress callbacks
 * @returns Silent progress manager
 */
export function createSilentProgressManager(
  callbacks: GitProgressManagerOptions = {}
): GitProgressManager {
  return new GitProgressManager({
    silent: true,
    enableCLI: false,
    ...callbacks,
  });
}

/**
 * Helper function to create a CLI-enabled progress manager
 * Shows progress in terminal
 * @param options - Configuration options
 * @returns CLI-enabled progress manager
 */
export function createCLIProgressManager(
  options: GitProgressManagerOptions = {}
): GitProgressManager {
  return new GitProgressManager({
    silent: false,
    enableCLI: true,
    ...options,
  });
}
