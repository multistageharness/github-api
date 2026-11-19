/**
 * Renderer strategies: the ProgressRenderer base class and the console,
 * silent and multi renderers built on it.
 */

import process from 'node:process';
import { performance } from 'node:perf_hooks';

import { Colors, Spinner, TerminalUtils } from './terminal.js';
import type {
  ConsoleRendererConfig,
  ProgressData,
  ProgressStream,
  ResolvedConsoleRendererConfig,
} from './types.js';

/** Base class for custom renderers. */
export class ProgressRenderer {
  render(_progressData: ProgressData): void {
    throw new Error('render() must be implemented by subclass');
  }
  cleanup(): void {}
  onStart?(): void;
  onStop?(): void;
  reset?(): void;
  error?(progressData: ProgressData): void;
}

type MilestoneInput = Pick<ProgressData, 'isComplete' | 'isIndeterminate' | 'percentage'>;

export class ConsoleProgressRenderer extends ProgressRenderer {
  stream: ProgressStream;
  config: ResolvedConsoleRendererConfig;
  lastLineLength: number;
  spinner: Spinner | null;
  lastRenderTime: number;
  hasRenderedCompletion: boolean;
  hasRenderedIndeterminate: boolean;
  lastMilestone: number;

  /**
   * @param config.stream Where output goes (default `process.stdout`). Any
   *   `{ write, isTTY?, columns? }` works, which is what lets the tests assert
   *   on rendered output.
   */
  constructor(config: ConsoleRendererConfig = {}) {
    super();
    // Keys passed as `undefined` must not clobber the defaults below.
    const given = Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined)
    ) as ConsoleRendererConfig;
    this.stream = given.stream || process.stdout;
    this.config = {
      barLength: 40,
      filledChar: '█',
      emptyChar: '░',
      showETA: true,
      showSpeed: true,
      showPercentage: true,
      precision: 1,
      useColors: true,
      template: null,
      updateThrottle: 0,
      testMode: false,
      ...given,
    } as ResolvedConsoleRendererConfig;
    // Clamp after the merge so an explicit barLength is clamped too, and a
    // terminal narrower than 30 columns cannot produce a negative repeat().
    const columns = this.stream.columns || TerminalUtils.columns;
    this.config.barLength = Math.max(5, Math.min(Number(this.config.barLength) || 40, columns - 30));
    this.lastLineLength = 0;
    this.spinner = null;
    this.lastRenderTime = 0;
    this.hasRenderedCompletion = false;
    this.hasRenderedIndeterminate = false;
    this.lastMilestone = -1;
  }

  get isInteractive(): boolean {
    return TerminalUtils.isStreamInteractive(this.stream);
  }

  /** Colorize only when the user asked for colors and the terminal has them. */
  paint(text: string, color: string): string {
    if (!this.config.useColors) return text;
    return Colors.colorize(text, color);
  }

  formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  /** `speed` is items per second. Below 1/s show the time per item instead. */
  formatSpeed(speed: number): string {
    if (speed <= 0) return '0/s';
    if (speed < 1) return `${(1 / speed).toFixed(1)}s/item`;
    if (speed < 100) return `${speed.toFixed(1)}/s`;
    return `${Math.round(speed)}/s`;
  }

  /** Plain (uncolored) filled and empty segments of the bar. */
  barSegments(percentage: number): { filled: string; empty: string } {
    const ratio = Math.min(1, Math.max(0, percentage / 100));
    const filledLength = Math.floor(ratio * this.config.barLength);
    const emptyLength = this.config.barLength - filledLength;
    return {
      filled: this.config.filledChar.repeat(filledLength),
      empty: this.config.emptyChar.repeat(emptyLength),
    };
  }

  override render(progressData: ProgressData): void {
    const now = performance.now();

    // Throttle updates if configured (never throttle the final frame)
    if (
      !progressData.isComplete &&
      this.config.updateThrottle > 0 &&
      now - this.lastRenderTime < this.config.updateThrottle
    ) {
      return;
    }
    this.lastRenderTime = now;

    const { current, total, percentage, eta, speed, description, isComplete, isIndeterminate } =
      progressData;

    // Prevent duplicate completion messages
    if (isComplete && this.hasRenderedCompletion) {
      return;
    }

    let output = '';

    if (this.config.template) {
      output = this.renderTemplate(progressData);
    } else if (isIndeterminate) {
      if (isComplete) {
        output = `${description}:`;
      } else {
        if (!this.spinner) this.spinner = new Spinner();
        const spinnerFrame = this.spinner.next();
        output = `${description}: ${this.paint(spinnerFrame, 'cyan')} Working...`;
      }
    } else {
      const { filled, empty } = this.barSegments(percentage);
      const filledBar = this.paint(filled, isComplete ? 'green' : 'cyan');
      const emptyBar = this.paint(empty, 'dim');
      const bar = `[${filledBar}${emptyBar}]`;

      let stats = '';
      if (this.config.showPercentage) {
        stats += ` ${this.paint(`${percentage.toFixed(this.config.precision)}%`, 'bright')}`;
      }

      stats += ` (${current}/${total})`;

      if (this.config.showSpeed && speed > 0) {
        stats += ` ${this.paint(this.formatSpeed(speed), 'dim')}`;
      }

      if (this.config.showETA && eta > 0) {
        stats += ` ETA: ${this.paint(this.formatTime(eta), 'dim')}`;
      }

      output = `${description}: ${bar}${stats}`;
    }

    if (this.isInteractive) {
      // Clear previous line and write new one
      TerminalUtils.clearLine(this.stream);
      this.stream.write(output);

      if (isComplete) {
        const completedMsg = this.config.useColors
          ? this.paint(' ✓ Complete!', 'green')
          : ' Complete!';
        this.stream.write(completedMsg + '\n');
        this.hasRenderedCompletion = true;
      }
    } else if (this.shouldPrintMilestone(progressData)) {
      // Non-interactive mode - only show milestones, one line each
      this.stream.write(output + (isComplete ? ' Complete!' : '') + '\n');
      if (isComplete) this.hasRenderedCompletion = true;
    }

    this.lastLineLength = output.length;
  }

  /**
   * Non-TTY output (CI logs) cannot redraw, so print the first frame, each
   * new 10% decile reached, and completion. Indeterminate bars print once
   * when they start and once when they complete.
   */
  shouldPrintMilestone({ isComplete, isIndeterminate, percentage }: MilestoneInput): boolean {
    if (isComplete) return true;
    if (isIndeterminate) {
      if (this.hasRenderedIndeterminate) return false;
      this.hasRenderedIndeterminate = true;
      return true;
    }
    const decile = Math.floor(percentage / 10);
    if (decile <= this.lastMilestone) return false;
    this.lastMilestone = decile;
    return true;
  }

  /**
   * Substitute `{key}` placeholders. Besides every ProgressData key, `{bar}`
   * is the bar body (no brackets), `{percentage}` honors `precision`, `{eta}`
   * and `{elapsed}` are whole seconds, and `{speed}` is formatted.
   */
  renderTemplate(progressData: ProgressData): string {
    // Only called with a template set; a null template throws, as before.
    const template = this.config.template as string;
    const { filled, empty } = this.barSegments(progressData.percentage);
    const values: Record<string, unknown> = {
      ...progressData,
      bar: `${filled}${empty}`,
      percentage: Number(progressData.percentage).toFixed(this.config.precision),
      eta: Math.round(progressData.eta || 0),
      elapsed: Math.round(progressData.elapsed || 0),
      speed: this.formatSpeed(progressData.speed || 0),
    };
    return template.replace(/\{(\w+)\}/g, (match: string, key: string) => {
      return values[key] !== undefined ? String(values[key]) : match;
    });
  }

  /** Called by ProgressBar.start(). */
  override onStart(): void {
    TerminalUtils.hideCursor(this.stream);
  }

  /** Called by ProgressBar.stop(). Erase an unfinished spinner line. */
  override onStop(): void {
    if (this.isInteractive && this.spinner && !this.hasRenderedCompletion) {
      TerminalUtils.clearLine(this.stream);
    }
    TerminalUtils.showCursor(this.stream);
  }

  override cleanup(): void {
    TerminalUtils.showCursor(this.stream);
    this.hasRenderedCompletion = false;
  }

  override reset(): void {
    this.hasRenderedCompletion = false;
    this.hasRenderedIndeterminate = false;
    this.lastMilestone = -1;
    this.lastRenderTime = 0;
  }
}

export class SilentProgressRenderer extends ProgressRenderer {
  progressHistory: Array<ProgressData & { timestamp: number }>;
  lastProgress: ProgressData | null;

  constructor() {
    super();
    this.progressHistory = [];
    this.lastProgress = null;
  }

  override render(progressData: ProgressData): void {
    this.lastProgress = { ...progressData };
    this.progressHistory.push({ ...progressData, timestamp: Date.now() });
  }

  getLastProgress(): ProgressData | null {
    return this.lastProgress;
  }

  getHistory(): Array<ProgressData & { timestamp: number }> {
    return [...this.progressHistory]; // Return copy to prevent external mutation
  }

  clear(): void {
    this.progressHistory = [];
    this.lastProgress = null;
  }

  override cleanup(): void {
    // Silent renderer doesn't need cleanup
  }

  override reset(): void {
    this.clear();
  }
}

export class MultiProgressRenderer extends ProgressRenderer {
  config: Record<string, unknown>;
  renderers: Map<string, ProgressRenderer>;
  lineCount: number;

  constructor(config: Record<string, unknown> = {}) {
    super();
    this.config = config;
    this.renderers = new Map();
    this.lineCount = 0;
  }

  addProgress(id: string, renderer: ProgressRenderer): void {
    this.renderers.set(id, renderer);
    this.lineCount++;
  }

  removeProgress(id: string): void {
    if (this.renderers.delete(id)) {
      this.lineCount--;
    }
  }

  override render(progressData: ProgressData, id?: string): void {
    const renderer = this.renderers.get(id as string);
    if (!renderer) return;
    renderer.render(progressData);
  }

  override cleanup(): void {
    this.renderers.forEach((renderer) => renderer.cleanup());
  }

  override reset(): void {
    this.renderers.forEach((renderer) => {
      if (renderer.reset) renderer.reset();
    });
  }
}
