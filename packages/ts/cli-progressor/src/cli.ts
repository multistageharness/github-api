#!/usr/bin/env node

/**
 * `progress-demo` — runs a demonstration of every progress-bar style.
 *
 * This is the "run the demo when executed directly" part of the original
 * `main.mjs`; the library itself is `src/index.ts` and has no side effects.
 */

import process from 'node:process';

import {
  CLIProgressHelper,
  Colors,
  ProgressBar,
  ProgressBarBuilder,
  SilentProgressRenderer,
} from './index.js';
import { PACKAGE_NAME, VERSION } from './version.js';

const USAGE = `Usage: progress-demo [options]

Runs a demonstration of ${PACKAGE_NAME}:
a basic bar, a custom styled bar, a spinner, an async task,
a silent (CI) bar and state tracking.

Options:
  -h, --help     Show this help and exit
  -v, --version  Print the version and exit
`;

// ===== DEMONSTRATION & EXAMPLES =====
async function demonstrateProgressBars(): Promise<void> {
  console.log(Colors.colorize('=== CLI Progress Bar System Demo ===\n', 'bright'));

  console.log(Colors.info('1. Basic Progress Bar:'));
  const basicBar = new ProgressBar(100, 'Processing files').start();
  await simulateWork(basicBar, 100, 50);
  await sleep(500);

  console.log(Colors.info('\n2. Custom Styled Progress Bar:'));
  const customBar = new ProgressBarBuilder()
    .withTotal(50)
    .withDescription('Custom Processing')
    .withBarLength(30)
    .withChars('▓', '▒')
    .withPrecision(0)
    .showSpeed(true)
    .build()
    .start();
  await simulateWork(customBar, 50, 75);
  await sleep(500);

  console.log(Colors.info('\n3. Spinner for Indeterminate Progress:'));
  await CLIProgressHelper.withSpinner('Connecting to server', async () => {
    await sleep(2000);
  });

  console.log(Colors.info('\n4. Progress with Async Task:'));
  await CLIProgressHelper.withProgress(75, 'Downloading', async (updateProgress) => {
    for (let i = 0; i < 75; i++) {
      await sleep(30);
      updateProgress(1);
    }
  });

  console.log(Colors.info('\n5. Silent Progress (CI mode):'));
  const silentBar = ProgressBar.createSilent(10, 'Test Progress');
  for (let i = 0; i < 10; i++) {
    silentBar.update(1);
  }
  console.log('Final progress:', silentBar.getProgress());
  // createSilent() always installs a SilentProgressRenderer.
  console.log(
    'History length:',
    (silentBar.renderer as SilentProgressRenderer).getHistory().length
  );

  console.log(Colors.info('\n6. Progress with State Tracking:'));
  const { result, stateHistory } = await CLIProgressHelper.withProgressAndState(
    20,
    'State Tracking Demo',
    async (updateProgress) => {
      for (let i = 0; i < 20; i++) {
        await sleep(50);
        updateProgress(1);
      }
      return 'completed successfully';
    }
  );
  console.log('Result:', result);
  console.log('State changes:', stateHistory.length);

  console.log(Colors.success('\n✓ All demonstrations completed!'));
}

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateWork(progressBar: ProgressBar, total: number, delay = 50): Promise<void> {
  let completed = 0;
  while (completed < total) {
    const increment = Math.min(Math.floor(Math.random() * 5) + 1, total - completed);
    progressBar.update(increment);
    completed += increment;
    await sleep(delay + Math.random() * 50);
  }
}

// ===== MAIN EXECUTION =====
async function main(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  try {
    await demonstrateProgressBars();
  } catch (error) {
    console.error(Colors.error(`Error: ${(error as { message?: unknown }).message}`));
    process.exit(1);
  }
}

main(process.argv.slice(2)).catch(console.error);
