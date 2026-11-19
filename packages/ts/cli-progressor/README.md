# @internal/cli-progressor

# Instruction Prompt: How to Use the `@internal/cli-progressor` Progress Bar Library

This document provides a comprehensive guide on using the progress bar utilities exported from `@internal/cli-progressor`. It covers everything from basic usage to advanced patterns like custom renderers, multi-bar management, and error handling.

### Table of Contents

1.  [**Basic Usage**](#1-basic-usage): Create a simple progress bar.
2.  [**Advanced Configuration with the Builder Pattern**](#2-advanced-configuration-with-the-builder-pattern): Customize your progress bar's appearance and behavior.
3.  [**Handling Multiple Progress Bars**](#3-handling-multiple-progress-bars): Manage several progress bars simultaneously.
4.  [**Using the `CLIProgressHelper` for Common Tasks**](#4-using-the-cliprogresshelper-for-common-tasks): Easily wrap asynchronous tasks with a progress bar.
5.  [**Responding to Events with Observers**](#5-responding-to-events-with-observers): Execute code at different stages of progress.
6.  [**Extending Functionality: Custom Renderers**](#6-extending-functionality-custom-renderers): Change the entire output format (e.g., to JSON or a themed spinner).
7.  [**Building Robust CLI Tools**](#7-building-robust-cli-tools): Implement error recovery and retry logic.
8.  [**Utility Components**](#8-utility-components): Use helper components like `Colors` and `Spinner`.

---

### Install and test

```sh
npm install @internal/cli-progressor   # resolves from the internal registry
```

Inside this repository it is the `packages/ts/cli-progressor` workspace (dependencies are hoisted at the `packages/ts` root, so run `npm install` there, not here). From `packages/ts/cli-progressor`:

```sh
npm test            # Vitest over tests/**/*.test.ts
npm run typecheck   # tsc --noEmit (strict) over src/ and tests/
npm run lint        # eslint src
npm run build       # dual ESM + CJS build into dist/esm and dist/cjs
npm run demo        # run the demo (same as the progress-demo bin), after a build
make ci             # lint, typecheck, test, build
```

Requires Node 20.19+. The package has no runtime dependencies. It is written in TypeScript (`src/`, entry `src/index.ts`) and ships declarations generated from the source (`dist/esm/index.d.ts`, `dist/cjs/index.d.ts`), so every export, including types such as `ProgressData` and `ConsoleRendererConfig`, is typed.

The `progress-demo` bin (`src/cli.ts`) runs a tour of every bar style; `progress-demo --help` and `progress-demo --version` print usage and the package version.

### UI (from tests/renderer.test.ts)

```sh
Async Test: [████████████████████████████████████████] 100.0% (5/5) 2.5/s ETA: 0s ✓ Complete!
```

Speed is shown as items per second, or as time per item (`2.0s/item`) when slower than one item per second.

### Process signals

While a bar is active the library listens for `exit`, `SIGINT` and `SIGTERM` only to restore the cursor and clear a half-drawn line. It never calls `process.exit()`: if your program has its own `SIGINT`/`SIGTERM` handler, that handler decides cleanup and exit code; if it has none, the signal is re-raised so the process ends with the normal signal status (130 / 143). The listeners are removed when the last bar stops. Call `ProgressBar.setSignalHandling(false)` to install only the `exit` listener.

### 1. Basic Usage

To create a simple progress bar, instantiate the `ProgressBar` class with a total value and an optional description.

**Instructions:**

1.  Import `ProgressBar` from `@internal/cli-progressor`.
2.  Create a new `ProgressBar` instance, providing the total number of steps.
3.  Call `.start()` to display the bar.
4.  Call `.update(increment)` inside your loop or task to advance the progress. `update(n)` is relative (it adds `n`); use `.updateTo(value)` to move to an absolute position.

**Example:**

```js
import { ProgressBar } from "@internal/cli-progressor";

// Create a progress bar for 100 items with a description.
const progressBar = new ProgressBar(100, "Downloading files");
progressBar.start();

// Simulate work and update the progress.
for (let i = 0; i < 100; i++) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  progressBar.update(1); // Increment progress by 1
}
```

---

### 2. Advanced Configuration with the Builder Pattern

For more control over the progress bar's appearance and features, use the `ProgressBarBuilder`. This provides a fluent interface to chain configuration methods.

**Instructions:**

1.  Import `ProgressBarBuilder`.
2.  Create a new `ProgressBarBuilder` instance.
3.  Chain various `.with...()` and `.show...()` methods to set options.
4.  Call `.build()` to create the final `ProgressBar` instance.

**Available Methods:**

- `.withTotal(number)`: Sets the total value.
- `.withDescription(string)`: Sets the text description.
- `.withBarLength(number)`: Sets the visual width of the bar.
- `.withChars(completeChar, incompleteChar)`: Sets the characters for the bar.
- `.withColors(boolean)`: Enables or disables terminal colors.
- `.showETA(boolean)`: Toggles the Estimated Time of Arrival display.
- `.showSpeed(boolean)`: Toggles the items/second display.
- `.withTemplate(string)`: Replaces the default line with a `{key}` template. Keys are any progress field plus `{bar}` (the bar body); `{eta}` and `{elapsed}` are whole seconds.
- `.withConfig(object)`: Merges any renderer option at once, including `stream` (defaults to `process.stdout`).
- `.onProgress(callback)`: Registers an observer that is attached when the bar is built (chainable).

**Example:**

```js
import { ProgressBarBuilder } from "@internal/cli-progressor";

const customProgress = new ProgressBarBuilder()
  .withTotal(500)
  .withDescription("Processing data")
  .withBarLength(50)
  .withChars("█", "░")
  .withColors(true)
  .showETA(true)
  .showSpeed(true)
  .build();

customProgress.start();
// ... update loop ...
```

---

### 3. Handling Multiple Progress Bars

To keep several progress bars by id (e.g., for concurrent downloads), use the `MultiProgressManager`.

> **Limitation:** each bar redraws the *current* terminal line, so bars updated concurrently in one TTY overwrite each other instead of stacking. Use it to manage the bars' lifecycle, and render one bar at a time (or use silent bars) when work runs in parallel.

**Instructions:**

1.  Import `MultiProgressManager`.
2.  Create an instance of the manager.
3.  Use the `manager.add(id, total, description, config?)` method to create and add a new progress bar. This returns the `ProgressBar` instance, which you can then update individually.

**Example:**

```js
import { MultiProgressManager } from "@internal/cli-progressor";

const manager = new MultiProgressManager();

// Add two progress bars to the manager
const download1 = manager.add("file1", 100, "Downloading file1.zip");
const download2 = manager.add("file2", 200, "Downloading file2.zip");

// You can now update each bar independently
// download1.update(10);
// download2.update(25);
```

---

### 4. Using the `CLIProgressHelper` for Common Tasks

The `CLIProgressHelper.withProgress()` method is a powerful wrapper that simplifies adding a progress bar to a loop that processes a list of items. It handles starting, updating, and stopping the bar automatically.

**Instructions:**

1.  Import `CLIProgressHelper`.
2.  Call `CLIProgressHelper.withProgress()`, providing:
    - The total number of items.
    - A description string.
    - An async callback function that receives an `updateProgress` function as its argument.
3.  Inside your callback, iterate through your items and call `updateProgress(1)` after each item is processed.

**Example (File Processing):**

```js
import { CLIProgressHelper } from "@internal/cli-progressor";

const files = ["file1.txt", "file2.txt", "file3.txt"];

// The helper manages the entire lifecycle of the progress bar.
await CLIProgressHelper.withProgress(
  files.length,
  "Processing files",
  async (updateProgress) => {
    for (const file of files) {
      // Simulate processing a file
      await new Promise((resolve) => setTimeout(resolve, 100));
      updateProgress(1); // The helper increments the bar
    }
  }
);
```

---

### 5. Responding to Events with Observers

You can attach multiple "observer" functions to a progress bar to react to updates. This is useful for logging, analytics, or triggering actions at specific milestones.

**Instructions:**

1.  Use the `.onProgress(callback)` method on a `ProgressBar` instance. It returns an **unsubscribe function**, not the bar, so call it once per observer (or chain `.onProgress()` on a `ProgressBarBuilder`, which does return the builder).
2.  The `callback` function will receive a `progressData` object on every update. This object contains details like `percentage`, `current`, `total`, `speed`, and `isComplete`.
3.  Call the returned function (or `bar.offProgress(callback)`) to stop observing.

**Example:**

```js
import { ProgressBar, Colors } from "@internal/cli-progressor";

class ProgressLogger {
  log(progressData) {
    if (progressData.percentage === 50) {
      console.log(Colors.info("LOG: Halfway there!"));
    }
  }
}

const logger = new ProgressLogger();
const progressBar = new ProgressBar(100, "Observer Demo");

progressBar.onProgress(logger.log.bind(logger)); // Observer 1
const unsubscribe = progressBar.onProgress((data) => {
  // Observer 2 (anonymous)
  if (data.isComplete) {
    console.log(Colors.success("🎉 Task completed!"));
  }
});

progressBar.start();
// ... update loop ...
unsubscribe(); // stop observing when no longer needed
```

---

### 6. Extending Functionality: Custom Renderers

If you need a completely different output format, you can create a custom renderer by extending the exported `ProgressRenderer` base class.

**Instructions:**

1.  Import `ProgressRenderer`.
2.  Create a new class that `extends ProgressRenderer`.
3.  Implement the `render(progressData)` method to define how the progress is displayed.
4.  Optionally, implement the `cleanup()` method to clear the display after the progress is complete.
5.  Pass an instance of your custom renderer as the third argument to the `ProgressBar` constructor.

**Example (JSON Output):**

```js
import { ProgressRenderer, ProgressBar } from "@internal/cli-progressor";

class JSONProgressRenderer extends ProgressRenderer {
  render(progressData) {
    // Output progress data as a JSON string
    console.log(JSON.stringify({ progress: progressData }));
  }
  cleanup() {
    // Optionally log a completion event
    console.log('{"event": "progress_complete"}');
  }
}

// Use the custom renderer with a progress bar
const jsonProgress = new ProgressBar(
  100,
  "API Processing",
  new JSONProgressRenderer()
);
jsonProgress.start();
```

---

### 7. Building Robust CLI Tools

Combine the library's features to build resilient command-line tools with features like automatic retries and error reporting.

**Instructions:**

Use `CLIProgressHelper.withProgress` to manage the main loop. Inside the loop, wrap individual processing steps in `try...catch` blocks to handle failures. For retries, create a helper function with a `for` loop.

**Example (Processing with Error Recovery):**

```js
import { Colors, CLIProgressHelper } from "@internal/cli-progressor";

const items = ["task1", "task2", "failing_task", "task4"];

await CLIProgressHelper.withProgress(
  items.length,
  "Robust Processing",
  async (update) => {
    for (const item of items) {
      let attempts = 3;
      while (attempts > 0) {
        try {
          // Simulate a task that might fail
          if (item === "failing_task" && attempts > 1) {
            throw new Error("Temporary failure");
          }
          console.log(`\nProcessed ${item}`);
          break; // Success
        } catch (error) {
          attempts--;
          console.warn(Colors.warning(`\n⚠️  Failed on ${item}, retrying...`));
          if (attempts === 0) {
            console.error(Colors.error(`\n✗ Permanently failed on ${item}`));
          }
        }
      }
      update(1);
    }
  }
);
```

---

### 8. Utility Components

The library also exports standalone utilities.

- `Colors`: An object with methods for colorizing terminal output (`.success()`, `.error()`, `.warning()`, `.info()`, `.dim()`).
- `Spinner`: A class for creating indeterminate loading spinners, often used within a custom renderer.

**Example:**

```js
import { Colors, Spinner } from "@internal/cli-progressor";

console.log(Colors.success("✓ Operation successful!"));
console.log(Colors.error("✗ An error occurred."));

// Spinners are typically used inside a custom renderer (see section 6)
const spinner = new Spinner(Spinner.presets.dots);
// console.log(spinner.next()); // Get the next frame of the animation
```
