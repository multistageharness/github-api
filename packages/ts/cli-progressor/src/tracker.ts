/**
 * Progress arithmetic (calculator) and the observable progress state (tracker).
 */

import { performance } from 'node:perf_hooks';

import type {
  CalculatedProgress,
  ProgressData,
  ProgressObserver,
  ProgressState,
  StateObserver,
} from './types.js';

/** Base class for progress calculators (internal; not exported by the package). */
class IProgressCalculator {
  calculate(
    _current: number,
    _total: number,
    _startTime: number,
    _lastUpdate?: number
  ): CalculatedProgress {
    throw new Error('calculate() must be implemented by subclass');
  }
}

export class StandardProgressCalculator extends IProgressCalculator {
  speedHistory: number[];
  maxHistorySize: number;

  constructor() {
    super();
    this.speedHistory = [];
    this.maxHistorySize = 10;
  }

  override calculate(
    current: number,
    total: number,
    startTime: number,
    _lastUpdate?: number
  ): CalculatedProgress {
    const now = performance.now();
    const elapsed = (now - startTime) / 1000;

    // Fix floating-point precision issue
    const percentage = total > 0 ? Math.round((current / total) * 100 * 100) / 100 : 0;

    // Calculate speed with moving average
    const speed = this.calculateSpeed(current, elapsed);

    // Calculate ETA
    let eta = 0;
    if (current > 0 && current < total && speed > 0) {
      eta = (total - current) / speed;
    }

    return {
      current,
      total,
      percentage,
      elapsed,
      eta,
      speed,
      // A bar with no total (spinner / indeterminate) is never complete by
      // arithmetic: 0 >= 0 would otherwise finish every spinner on its first
      // frame. It completes only through an explicit complete().
      isComplete: total > 0 && current >= total,
      isIndeterminate: total <= 0,
    };
  }

  calculateSpeed(current: number, elapsed: number): number {
    if (elapsed <= 0) return 0;

    const currentSpeed = current / elapsed;

    // Maintain speed history for smoothing
    this.speedHistory.push(currentSpeed);
    if (this.speedHistory.length > this.maxHistorySize) {
      this.speedHistory.shift();
    }

    // Return moving average
    return this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
  }
}

export class ProgressTracker {
  total: number;
  current: number;
  description: string;
  startTime: number;
  lastUpdateTime: number;
  calculator: StandardProgressCalculator;
  observers: Set<ProgressObserver>;
  /** Typed `string` to match setState(); the library itself only uses ProgressState values. */
  state: string;
  stateObservers: Set<StateObserver>;

  constructor(
    total: number,
    description = 'Progress',
    calculator: StandardProgressCalculator | null = null
  ) {
    this.total = total;
    this.current = 0;
    this.description = description;
    this.startTime = performance.now();
    this.lastUpdateTime = this.startTime;
    this.calculator = calculator || new StandardProgressCalculator();
    this.observers = new Set();
    this.state = 'idle';
    this.stateObservers = new Set();
  }

  addObserver(observer: ProgressObserver): () => boolean {
    this.observers.add(observer);
    return () => this.observers.delete(observer); // Return cleanup function
  }

  removeObserver(observer: ProgressObserver): boolean {
    return this.observers.delete(observer);
  }

  addStateObserver(observer: StateObserver): () => boolean {
    this.stateObservers.add(observer);
    return () => this.stateObservers.delete(observer);
  }

  removeStateObserver(observer: StateObserver): boolean {
    return this.stateObservers.delete(observer);
  }

  notifyObservers(progressData: ProgressData): void {
    this.observers.forEach((observer) => {
      try {
        if (typeof observer === 'function') {
          observer(progressData);
        } else if (observer.onProgress) {
          observer.onProgress(progressData);
        }
      } catch (error) {
        console.error('Observer error:', error);
      }
    });
  }

  notifyStateChange(newState: string, oldState: string): void {
    this.stateObservers.forEach((observer) => {
      try {
        if (typeof observer === 'function') {
          observer({ newState, oldState, tracker: this });
        } else if (observer.onStateChange) {
          observer.onStateChange({ newState, oldState, tracker: this });
        }
      } catch (error) {
        console.error('State observer error:', error);
      }
    });
  }

  setState(newState: string): void {
    const oldState = this.state;
    if (oldState !== newState) {
      this.state = newState;
      this.notifyStateChange(newState, oldState);
    }
  }

  getState(): string {
    return this.state;
  }

  increment(amount = 1): ProgressData {
    if (this.state === 'completed') return this.getProgress();

    // Indeterminate trackers (total <= 0) have no upper bound to clamp to.
    this.current =
      this.total > 0 ? Math.min(this.total, this.current + amount) : this.current + amount;
    this.lastUpdateTime = performance.now();

    const progress = this.getProgress();

    // State transition detection
    if (progress.isComplete && this.state !== 'completed') {
      this.setState('completed');
    }

    this.notifyObservers(progress);
    return progress;
  }

  getProgress(): ProgressData {
    const calculatedData = this.calculator.calculate(
      this.current,
      this.total,
      this.startTime,
      this.lastUpdateTime
    );

    return {
      ...calculatedData,
      // An explicit complete() finishes an indeterminate tracker too.
      isComplete: calculatedData.isComplete || this.state === 'completed',
      description: this.description,
      // setState() accepts any string; ProgressData reports it as-is.
      state: this.state as ProgressState,
    };
  }

  reset(): void {
    this.current = 0;
    this.startTime = performance.now();
    this.lastUpdateTime = this.startTime;
    this.setState('idle');
    if (this.calculator.speedHistory) {
      this.calculator.speedHistory = [];
    }
  }

  complete(): ProgressData {
    if (this.state === 'completed') {
      return this.getProgress();
    }

    this.current = this.total;
    this.setState('completed');
    return this.getProgress();
  }

  setTotal(total: number): this {
    this.total = total;
    return this;
  }

  isCompleted(): boolean {
    return this.state === 'completed';
  }
}
