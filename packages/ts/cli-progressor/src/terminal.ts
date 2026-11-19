/**
 * Terminal helpers: TTY detection, cursor control, colors and spinner frames.
 */

import process from 'node:process';

import type { ProgressStream } from './types.js';

export class TerminalUtils {
  static get isInteractive(): boolean {
    return process.stdout.isTTY && process.env.CI !== 'true';
  }

  static get columns(): number {
    return process.stdout.columns || 80;
  }

  static get supportsColor(): boolean {
    return (
      Boolean(process.stdout.isTTY) && process.env.FORCE_COLOR !== '0' && !process.env.NO_COLOR
    );
  }

  /** Whether `stream` is a terminal we may redraw in place. */
  static isStreamInteractive(stream: ProgressStream = process.stdout): boolean {
    return Boolean(stream && stream.isTTY) && process.env.CI !== 'true';
  }

  static moveCursor(dx: number, dy: number, stream: ProgressStream = process.stdout): void {
    if (this.isStreamInteractive(stream)) {
      stream.write(`\x1b[${dy}A\x1b[${dx}G`);
    }
  }

  static clearLine(stream: ProgressStream = process.stdout): void {
    if (this.isStreamInteractive(stream)) {
      stream.write('\x1b[2K\r');
    }
  }

  static hideCursor(stream: ProgressStream = process.stdout): void {
    if (this.isStreamInteractive(stream)) {
      stream.write('\x1b[?25l');
    }
  }

  static showCursor(stream: ProgressStream = process.stdout): void {
    if (this.isStreamInteractive(stream)) {
      stream.write('\x1b[?25h');
    }
  }
}

export class Colors {
  static get codes(): Record<string, string> {
    return {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
    };
  }

  static colorize(text: string, color: string): string {
    if (!TerminalUtils.supportsColor) return text;
    return `${this.codes[color] || ''}${text}${this.codes.reset}`;
  }

  static success(text: string): string {
    return Colors.colorize(text, 'green');
  }
  static error(text: string): string {
    return Colors.colorize(text, 'red');
  }
  static warning(text: string): string {
    return Colors.colorize(text, 'yellow');
  }
  static info(text: string): string {
    return Colors.colorize(text, 'cyan');
  }
  static dim(text: string): string {
    return Colors.colorize(text, 'dim');
  }
}

export type SpinnerPreset = 'dots' | 'line' | 'arrow' | 'bounce' | 'clock';

export class Spinner {
  frames: string[];
  current: number;

  constructor(frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']) {
    this.frames = frames;
    this.current = 0;
  }

  next(): string {
    const frame = this.frames[this.current] as string;
    this.current = (this.current + 1) % this.frames.length;
    return frame;
  }

  static get presets(): Record<SpinnerPreset, string[]> {
    return {
      dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      line: ['-', '\\', '|', '/'],
      arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
      bounce: ['⠁', '⠂', '⠄', '⠂'],
      clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
    };
  }
}
