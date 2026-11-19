/**
 * ProgressBar (lifecycle + state), its fluent builder, and a manager for
 * several bars keyed by id.
 */

import { processManager } from './process-manager.js';
import {
  ConsoleProgressRenderer,
  ProgressRenderer,
  SilentProgressRenderer,
} from './renderers.js';
import { TerminalUtils } from './terminal.js';
import { ProgressTracker } from './tracker.js';
import type {
  ConsoleRendererConfig,
  ProgressData,
  ProgressObserver,
  ProgressState,
  StateObserver,
} from './types.js';

export class ProgressBar {
  tracker: ProgressTracker;
  renderer: ProgressRenderer;
  state: ProgressState;
  updateInterval: ReturnType<typeof setInterval> | null;
  cleanupFn: (() => void) | null;

  constructor(total: number, description = 'Progress', renderer: ProgressRenderer | null = null) {
    this.tracker = new ProgressTracker(total, description);
    this.renderer = renderer || this.createDefaultRenderer();
    this.state = 'idle'; // idle, active, completed, stopped
    this.updateInterval = null;
    this.cleanupFn = null;

    // Process listeners are attached in start() (only while a bar is active),
    // never at construction.

    // Listen to tracker state changes
    this.tracker.addStateObserver((stateData) => {
      if (stateData.newState === 'completed') {
        this.state = 'completed';
      }
    });
  }

  createDefaultRenderer(): ProgressRenderer {
    if (!TerminalUtils.isInteractive) {
      return new SilentProgressRenderer();
    }
    return new ConsoleProgressRenderer();
  }

  start(): this {
    if (this.state !== 'idle') return this;

    this.state = 'active';
    this.tracker.setState('active');
    // Cursor control belongs to the renderer: a silent bar writes nothing.
    if (this.renderer.onStart) this.renderer.onStart();

    // Register cleanup
    this.cleanupFn = processManager.addCleanupTask(() => {
      this.stop();
      this.renderer.cleanup();
    });

    // For indeterminate progress, start auto-updating
    if (this.tracker.total <= 0) {
      const interval = setInterval(() => {
        if (this.state === 'active') {
          this.renderer.render(this.tracker.getProgress());
        }
      }, 100);
      this.updateInterval = interval;
      // The spinner animates the host's work; it must not keep the process
      // alive on its own once that work is done.
      if (typeof interval.unref === 'function') interval.unref();
    }

    return this;
  }

  stop(): this {
    if (this.state === 'idle' || this.state === 'stopped') return this;

    // "completed" is terminal: complete() calls stop() purely to release
    // resources, so overwriting the state here would erase the completion it
    // just recorded.
    if (this.state !== 'completed') {
      this.state = 'stopped';
    }
    if (this.renderer.onStop) this.renderer.onStop();

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }

    return this;
  }

  /** Advance by `increment` (relative). Use updateTo() for an absolute position. */
  update(increment = 1): ProgressData {
    if (this.state === 'completed' || this.state === 'stopped') {
      return this.getProgress();
    }

    if (this.state === 'idle') this.start();

    const progress = this.tracker.increment(increment);
    this.renderer.render(progress);

    // The tracker's state observer has usually already flipped this.state to
    // "completed" by now, so do not gate stop() on it: stop() is what restores
    // the cursor and releases the process listeners.
    if (progress.isComplete) {
      this.state = 'completed';
      this.stop();
    }

    return progress;
  }

  /**
   * Move to an absolute position (clamped to 0..total). Equivalent to
   * `update(value - current)`; `update(n)` itself stays incremental.
   */
  updateTo(value: number): ProgressData {
    const target = Math.max(0, Number(value) || 0);
    return this.update(target - this.tracker.current);
  }

  setTotal(total: number): this {
    this.tracker.setTotal(total);
    return this;
  }

  /**
   * Change the label shown beside the bar.
   *
   * Re-renders immediately when active so the new text appears at once rather
   * than waiting for the next update() — a description that lags the work it
   * describes is worse than none.
   */
  setDescription(description: string): this {
    this.tracker.description = description;
    if (this.state === 'active') {
      this.renderer.render(this.tracker.getProgress());
    }
    return this;
  }

  /**
   * Abort the bar with a failure message.
   *
   * Terminal like complete(), but leaves the bar unfinished: the run stopped
   * because something went wrong, and rendering it as 100% would misreport that.
   */
  error(message = 'Failed'): ProgressData {
    if (this.state === 'completed' || this.state === 'stopped') {
      return this.getProgress();
    }

    const progress = this.tracker.getProgress();
    this.tracker.description = message;

    if (this.renderer.error) {
      this.renderer.error({ ...progress, description: message });
    } else {
      this.renderer.render({ ...progress, description: message });
    }

    this.stop();
    return progress;
  }

  complete(): ProgressData {
    if (this.state === 'completed') {
      return this.getProgress(); // Idempotent - no double rendering
    }

    this.state = 'completed';
    const progress = this.tracker.complete();
    this.renderer.render(progress);
    this.stop();
    return progress;
  }

  getProgress(): ProgressData {
    return this.tracker.getProgress();
  }

  reset(): this {
    this.tracker.reset();
    this.state = 'idle';
    if (this.renderer.reset) {
      this.renderer.reset();
    }
    return this;
  }

  isCompleted(): boolean {
    return this.state === 'completed';
  }

  getState(): ProgressState {
    return this.state;
  }

  // Observer pattern support
  /**
   * Subscribe to progress updates. Returns an unsubscribe function (not the
   * bar), so calls do not chain; use ProgressBarBuilder.onProgress() to
   * register handlers in a fluent chain.
   */
  onProgress(callback: ProgressObserver): () => boolean {
    return this.tracker.addObserver(callback);
  }

  offProgress(callback: ProgressObserver): boolean {
    return this.tracker.removeObserver(callback);
  }

  onStateChange(callback: StateObserver): () => boolean {
    return this.tracker.addStateObserver(callback);
  }

  offStateChange(callback: StateObserver): boolean {
    return this.tracker.removeStateObserver(callback);
  }

  // Factory methods for common configurations
  static createConsole(
    total: number,
    description?: string,
    config: ConsoleRendererConfig = {}
  ): ProgressBar {
    const renderer = new ConsoleProgressRenderer(config);
    return new ProgressBar(total, description, renderer);
  }

  static createSilent(total: number, description?: string): ProgressBar {
    const renderer = new SilentProgressRenderer();
    return new ProgressBar(total, description, renderer);
  }

  /** See ProcessManager.setSignalHandling(). Applies to every bar. */
  static setSignalHandling(enabled: boolean): typeof ProgressBar {
    processManager.setSignalHandling(enabled);
    return ProgressBar;
  }

  static createSpinner(description?: string, config: ConsoleRendererConfig = {}): ProgressBar {
    const renderer = new ConsoleProgressRenderer({
      ...config,
      showPercentage: false,
      showETA: false,
    });
    return new ProgressBar(0, description, renderer);
  }
}

export class ProgressBarBuilder {
  config: ConsoleRendererConfig;
  total: number;
  description: string;
  progressHandlers: Array<(progressData: ProgressData) => void>;

  constructor() {
    this.config = {};
    this.total = 100;
    this.description = 'Progress';
    this.progressHandlers = [];
  }

  withTotal(total: number): this {
    this.total = total;
    return this;
  }

  /**
   * Register a progress observer on the bar this builder will produce.
   *
   * Handlers are collected here and attached in build()/buildSilent(), because
   * the bar does not exist yet — subscribing at build time is what lets the
   * whole configuration be expressed as one chain.
   */
  onProgress(handler: (progressData: ProgressData) => void): this {
    if (typeof handler === 'function') {
      this.progressHandlers.push(handler);
    }
    return this;
  }

  /** Attach every registered handler to a freshly built bar. */
  attachHandlers(bar: ProgressBar): ProgressBar {
    for (const handler of this.progressHandlers) {
      bar.onProgress(handler);
    }
    return bar;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Merge renderer options (any ConsoleProgressRenderer config key, e.g.
   * `barLength`, `template`, `stream`). `undefined` values are ignored.
   */
  withConfig(config: ConsoleRendererConfig = {}): this {
    const target = this.config as Record<string, unknown>;
    for (const [key, value] of Object.entries(config || {})) {
      if (value !== undefined) target[key] = value;
    }
    return this;
  }

  withBarLength(length: number): this {
    this.config.barLength = length;
    return this;
  }

  withChars(filled: string, empty: string): this {
    this.config.filledChar = filled;
    this.config.emptyChar = empty;
    return this;
  }

  withColors(enabled = true): this {
    this.config.useColors = enabled;
    return this;
  }

  withPrecision(precision: number): this {
    this.config.precision = precision;
    return this;
  }

  showETA(show = true): this {
    this.config.showETA = show;
    return this;
  }

  showSpeed(show = true): this {
    this.config.showSpeed = show;
    return this;
  }

  showPercentage(show = true): this {
    this.config.showPercentage = show;
    return this;
  }

  withTemplate(template: string): this {
    this.config.template = template;
    return this;
  }

  withTestMode(enabled = true): this {
    this.config.testMode = enabled;
    this.config.updateThrottle = enabled ? 100 : 0; // Slower updates for visibility
    return this;
  }

  withUpdateThrottle(ms: number): this {
    this.config.updateThrottle = ms;
    return this;
  }

  forSpinner(): this {
    this.total = 0;
    this.config.showPercentage = false;
    this.config.showETA = false;
    return this;
  }

  build(): ProgressBar {
    if (this.config.testMode) {
      // Use a test-friendly renderer with throttling
      const renderer = new ConsoleProgressRenderer({
        ...this.config,
        updateThrottle: this.config.updateThrottle || 100,
      });
      return this.attachHandlers(new ProgressBar(this.total, this.description, renderer));
    }

    const renderer = new ConsoleProgressRenderer(this.config);
    return this.attachHandlers(new ProgressBar(this.total, this.description, renderer));
  }

  buildSilent(): ProgressBar {
    const renderer = new SilentProgressRenderer();
    return this.attachHandlers(new ProgressBar(this.total, this.description, renderer));
  }
}

/**
 * Keeps several independent bars by id. Each bar redraws the current line,
 * so concurrent bars in one TTY overwrite each other.
 */
export class MultiProgressManager {
  progressBars: Map<string, ProgressBar>;
  isActive: boolean;

  constructor() {
    this.progressBars = new Map();
    this.isActive = false;
  }

  add(
    id: string,
    total: number,
    description?: string,
    config: ConsoleRendererConfig = {}
  ): ProgressBar {
    const progressBar = new ProgressBarBuilder()
      .withTotal(total)
      // An omitted description reaches ProgressBar as undefined, which then
      // falls back to its "Progress" default (unchanged from the JS original).
      .withDescription(description as string)
      .withConfig(config)
      .build();

    this.progressBars.set(id, progressBar);
    return progressBar;
  }

  get(id: string): ProgressBar | undefined {
    return this.progressBars.get(id);
  }

  remove(id: string): void {
    const progressBar = this.progressBars.get(id);
    if (progressBar) {
      progressBar.stop();
      this.progressBars.delete(id);
    }
  }

  update(id: string, increment = 1): ProgressData | null {
    const progressBar = this.progressBars.get(id);
    return progressBar ? progressBar.update(increment) : null;
  }

  complete(id: string): ProgressData | null {
    const progressBar = this.progressBars.get(id);
    return progressBar ? progressBar.complete() : null;
  }

  clear(): void {
    this.progressBars.forEach((progressBar) => progressBar.stop());
    this.progressBars.clear();
  }
}
