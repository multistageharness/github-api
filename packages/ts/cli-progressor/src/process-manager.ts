/**
 * Process-level terminal restoration (exit / SIGINT / SIGTERM).
 */

import process from 'node:process';

/**
 * Restores the terminal (cursor, half-drawn line) when the process ends while
 * a bar is active.
 *
 * Listeners are attached only while at least one bar is active and removed
 * when the last one stops. The SIGINT/SIGTERM handler never calls
 * process.exit(): it restores the terminal, removes itself, and — only when no
 * other listener for that signal is left — re-raises the signal so the process
 * dies with the default signal status (130/143). A host program that installed
 * its own handler keeps full control of cleanup and exit code.
 */
export class ProcessManager {
  cleanupTasks: Set<() => void>;
  isSetup: boolean;
  handleSignals: boolean;
  signals: NodeJS.Signals[];
  onExit: () => void;
  onSignal: (signal: NodeJS.Signals) => void;

  constructor() {
    this.cleanupTasks = new Set();
    this.isSetup = false;
    this.handleSignals = true;
    this.signals = ['SIGINT', 'SIGTERM'];
    this.onExit = () => this.cleanup();
    this.onSignal = (signal) => {
      this.cleanup();
      this.teardown();
      if (process.listenerCount(signal) === 0) {
        process.kill(process.pid, signal);
      }
    };
  }

  setup(): void {
    if (this.isSetup) return;

    process.on('exit', this.onExit);
    if (this.handleSignals) {
      for (const signal of this.signals) process.on(signal, this.onSignal);
    }

    this.isSetup = true;
  }

  teardown(): void {
    if (!this.isSetup) return;
    process.removeListener('exit', this.onExit);
    for (const signal of this.signals) {
      process.removeListener(signal, this.onSignal);
    }
    this.isSetup = false;
  }

  /**
   * Turn SIGINT/SIGTERM terminal restoration on or off (default on). With it
   * off only an `exit` listener is installed, and a signal leaves the
   * terminal exactly as the host program's own handling does.
   */
  setSignalHandling(enabled: boolean): this {
    const wasSetup = this.isSetup;
    this.teardown();
    this.handleSignals = Boolean(enabled);
    if (wasSetup) this.setup();
    return this;
  }

  addCleanupTask(task: () => void): () => void {
    this.cleanupTasks.add(task);
    this.setup();
    return () => {
      this.cleanupTasks.delete(task);
      if (this.cleanupTasks.size === 0) this.teardown();
    };
  }

  cleanup(): void {
    [...this.cleanupTasks].forEach((task) => {
      try {
        task();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    });
  }
}

/** Global process manager instance shared by every ProgressBar. */
export const processManager = new ProcessManager();
