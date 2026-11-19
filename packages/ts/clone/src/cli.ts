#!/usr/bin/env node

/**
 * @fileoverview Git Repository Management CLI - Command Line Interface
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

import {
  validateProxyFlagsOrExit,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';

import { GitClient } from './client/GitClient.js';
import { setupConfig, loadConfig } from './cli/config.js';
import { createCLIProgressManager } from './utils/progress.js';
import type { ProgressEvent, StageChangeEvent } from './utils/progress.js';
import { PACKAGE_NAME, VERSION } from './version.js';

// Load environment variables
dotenv.config();

// Package info
const packageJson = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'Git Repository Management SDK and CLI - Local git operations with simple-git',
};

/** Global CLI options parsed by commander. */
interface GlobalOptions {
  token?: string;
  baseDir?: string;
  timeout?: string;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  color?: boolean;
  [key: string]: unknown;
}

/** Options for the `clone` command. */
interface CloneCmdOptions {
  branch?: string;
  depth?: number;
  bare?: boolean;
  progress?: boolean;
  noProgress?: boolean;
}

/** Options for the `pull` command. */
interface PullCmdOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

/** Options for the `push` command. */
interface PushCmdOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
}

/** Options for the `init` command. */
interface InitCmdOptions {
  bare?: boolean;
}

/** Options for the `sync` command. */
interface SyncCmdOptions {
  remote?: string;
  branch?: string;
  autoPush?: boolean;
  rebase?: boolean;
}

/** Error-like shape produced by the CLI error handler. */
interface ErrorOutput {
  error: string;
  type: string;
  timestamp: string;
  details?: unknown;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name('gh-clone')
  .description(packageJson.description)
  .version(packageJson.version)
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-d, --base-dir <dir>', 'Base directory for repositories', './repositories')
  .option('--timeout <ms>', 'Operation timeout in milliseconds', '300000')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress output except errors')
  .option('--json', 'Output results as JSON')
  .option('--no-color', 'Disable colored output');

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);
// Checked here, before commander routes to a subcommand: two contradictory
// flags, or a value that cannot be a proxy URL, must not surface as an unknown
// command or a stack trace (R8, R9).
validateProxyFlagsOrExit();

/**
 * Create GitClient from global options
 */
function createClient(options: GlobalOptions): GitClient {
  const config = loadConfig();

  // `gh-clone` reaches GitHub through `git` itself, never through this
  // process's HTTP client — so the proxy flags every other binary carries have
  // nothing here to govern. Proxying git traffic is a named non-goal of
  // PRD 0002: it is git's own configuration, and reaching into it from here
  // would mean writing config on the user's machine.
  //
  // The flags are still registered, so `--proxy` parses and validates
  // identically in all eleven binaries (R8, RK6) — but a flag that silently did
  // nothing would be worse than no flag at all, so this says so out loud and
  // names what does work.
  const proxyFlags = proxyOptionsFrom(program.opts());
  if (proxyFlags.proxy !== undefined || proxyFlags.proxyBypass !== undefined) {
    console.error(
      chalk.yellow(
        'Note: gh-clone transfers repositories with git, not over the GitHub API, ' +
          'so --proxy does not affect them. Configure git instead, for example ' +
          '`git config --global http.proxy http://proxy.example.test:8080` ' +
          'or by exporting https_proxy for the git process.',
      ),
    );
  }

  return new GitClient({
    baseDir: options.baseDir || config.baseDir || './repositories',
    token: options.token || config.token || process.env['GITHUB_TOKEN'],
    verbose: options.verbose || config.verbose || false,
    timeout: parseInt(options.timeout || String(config.timeout) || '300000'),
  });
}

/**
 * Format output based on options
 */
function formatOutput(data: unknown, options: GlobalOptions): void {
  const record = data as Record<string, unknown> | null;

  if (options.quiet && !(record && record['error'])) {
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Pretty print based on data type
  if (record && record['error']) {
    console.error(chalk.red(`Error: ${String(record['error'])}`));
    if (options.verbose && record['details']) {
      console.error(chalk.gray(JSON.stringify(record['details'], null, 2)));
    }
  } else if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string') {
        console.log(item);
      } else {
        const obj = item as Record<string, unknown>;
        console.log(chalk.cyan(obj['name'] || obj['path'] || JSON.stringify(item)));
      }
    });
  } else if (typeof data === 'object' && data !== null) {
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'object') {
        console.log(chalk.cyan(`${key}:`), JSON.stringify(value));
      } else {
        console.log(chalk.cyan(`${key}:`), value);
      }
    });
  } else {
    console.log(data);
  }
}

/**
 * Handle errors consistently
 */
function handleError(error: unknown, options: GlobalOptions): never {
  const err = error as Error & {
    context?: unknown;
    originalError?: { message?: string; stack?: string };
  };

  const errorData: ErrorOutput = {
    error: err.message,
    type: err.name,
    timestamp: new Date().toISOString(),
  };

  if (options.verbose) {
    errorData.details = {
      stack: err.stack,
      context: err.context || {},
      originalError: err.originalError
        ? {
            message: err.originalError.message,
            stack: err.originalError.stack,
          }
        : null,
    };
  }

  formatOutput(errorData, options);
  process.exit(1);
}

/**
 * Clone command
 */
program
  .command('clone <repo-url> [target-dir]')
  .description('Clone a repository')
  .option('-b, --branch <branch>', 'Specific branch to clone')
  .option('--depth <depth>', 'Clone depth for shallow clone', parseInt)
  .option('--bare', 'Create bare repository')
  .option('--no-progress', 'Disable progress display')
  .action(async (repoUrl: string, targetDir: string | undefined, cmdOptions: CloneCmdOptions) => {
    const globalOptions = program.opts() as GlobalOptions;
    let progressManager: ReturnType<typeof createCLIProgressManager> | null = null;

    try {
      const client = createClient(globalOptions);

      // Set up progress tracking (unless disabled)
      const showProgress = !cmdOptions.noProgress && !globalOptions.quiet;

      if (showProgress) {
        progressManager = createCLIProgressManager({
          onStageChange: (data: StageChangeEvent) => {
            if (globalOptions.verbose) {
              console.log(chalk.blue(`[${data.stage}] ${data.description}`));
            }
          },
        });
      }

      const result = await client.clone(repoUrl, targetDir, {
        branch: cmdOptions.branch,
        depth: cmdOptions.depth,
        bare: cmdOptions.bare,
        progressManager: progressManager ?? undefined,
        onProgress: globalOptions.verbose
          ? (data: ProgressEvent) => {
              console.log(chalk.gray(`Progress: ${data.percentage}% - ${data.message || ''}`));
            }
          : undefined,
      });

      if (!globalOptions.quiet) {
        console.log(chalk.green('✓ Repository cloned successfully'));
        console.log(chalk.cyan('Path:'), result.path);
        console.log(chalk.cyan('Branch:'), result.branch);
        if (result.remotes && result.remotes.length > 0) {
          console.log(chalk.cyan('Remote:'), result.remotes[0]?.refs.fetch);
        }
      }

      if (globalOptions.json) {
        formatOutput(result, globalOptions);
      }
    } catch (error) {
      if (progressManager) {
        console.log(chalk.red('✗ Clone failed'));
      }
      handleError(error, globalOptions);
    }
  });

/**
 * Pull command
 */
program
  .command('pull <repo-name>')
  .description('Pull latest changes for a repository')
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-b, --branch <branch>', 'Branch name')
  .option('--rebase', 'Use rebase instead of merge')
  .action(async (repoName: string, cmdOptions: PullCmdOptions) => {
    const globalOptions = program.opts() as GlobalOptions;
    const spinner = ora(`Pulling changes for ${repoName}...`).start();

    try {
      const client = createClient(globalOptions);

      const result = await client.pull(repoName, {
        remote: cmdOptions.remote,
        branch: cmdOptions.branch,
        rebase: cmdOptions.rebase,
      });

      spinner.succeed(`Successfully pulled ${repoName}`);

      if (!globalOptions.quiet) {
        console.log(chalk.green('✓ Pull completed successfully'));
        console.log(chalk.cyan('Repository:'), result.name);
        console.log(chalk.cyan('Status:'), result.status.current);
        if (result.result.summary) {
          console.log(chalk.cyan('Changes:'), result.result.summary.changes || 0);
          console.log(chalk.cyan('Insertions:'), result.result.summary.insertions || 0);
          console.log(chalk.cyan('Deletions:'), result.result.summary.deletions || 0);
        }
      }

      if (globalOptions.json) {
        formatOutput(result, globalOptions);
      }
    } catch (error) {
      spinner.fail('Pull failed');
      handleError(error, globalOptions);
    }
  });

/**
 * Push command
 */
program
  .command('push <repo-name>')
  .description('Push changes for a repository')
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-b, --branch <branch>', 'Branch name')
  .option('-f, --force', 'Force push')
  .option('-u, --set-upstream', 'Set upstream tracking')
  .action(async (repoName: string, cmdOptions: PushCmdOptions) => {
    const globalOptions = program.opts() as GlobalOptions;
    const spinner = ora(`Pushing changes for ${repoName}...`).start();

    try {
      const client = createClient(globalOptions);

      const result = await client.push(repoName, {
        remote: cmdOptions.remote,
        branch: cmdOptions.branch,
        force: cmdOptions.force,
        setUpstream: cmdOptions.setUpstream,
      });

      spinner.succeed(`Successfully pushed ${repoName}`);

      if (!globalOptions.quiet) {
        console.log(chalk.green('✓ Push completed successfully'));
        console.log(chalk.cyan('Repository:'), result.name);
        console.log(chalk.cyan('Status:'), result.status.current);
      }

      if (globalOptions.json) {
        formatOutput(result, globalOptions);
      }
    } catch (error) {
      spinner.fail('Push failed');
      handleError(error, globalOptions);
    }
  });

/**
 * Status command
 */
program
  .command('status <repo-name>')
  .description('Show repository status')
  .action(async (repoName: string) => {
    const globalOptions = program.opts() as GlobalOptions;

    try {
      const client = createClient(globalOptions);
      const result = await client.status(repoName);

      if (!globalOptions.quiet && !globalOptions.json) {
        console.log(chalk.green(`Repository: ${result.name}`));
        console.log(chalk.cyan('Path:'), result.path);
        console.log(chalk.cyan('Branch:'), result.branch);
        console.log(chalk.cyan('Modified:'), result.status.modified.length);
        console.log(chalk.cyan('Staged:'), result.status.staged.length);
        console.log(chalk.cyan('Untracked:'), result.status.not_added.length);
        console.log(chalk.cyan('Behind:'), result.status.behind);
        console.log(chalk.cyan('Ahead:'), result.status.ahead);

        if (result.recentCommits.length > 0) {
          console.log(chalk.cyan('Recent commits:'));
          result.recentCommits.slice(0, 3).forEach((commit) => {
            console.log(`  ${chalk.yellow(commit.hash.substring(0, 7))} ${commit.message}`);
          });
        }
      }

      formatOutput(result, globalOptions);
    } catch (error) {
      handleError(error, globalOptions);
    }
  });

/**
 * List command
 */
program
  .command('list')
  .alias('ls')
  .description('List all managed repositories')
  .action(async () => {
    const globalOptions = program.opts() as GlobalOptions;

    try {
      const client = createClient(globalOptions);
      const repositories = await client.listRepositories();

      if (!globalOptions.quiet && !globalOptions.json) {
        if (repositories.length === 0) {
          console.log(chalk.yellow('No repositories found'));
          return;
        }

        console.log(chalk.green(`Found ${repositories.length} repositories:`));
        repositories.forEach((repo) => {
          console.log(`  ${chalk.cyan(repo.name)} (${repo.branch})`);
          console.log(`    Path: ${repo.path}`);
          console.log(
            `    Status: ${repo.status.modified.length} modified, ${repo.status.ahead} ahead, ${repo.status.behind} behind`
          );
          console.log();
        });
      }

      formatOutput(repositories, globalOptions);
    } catch (error) {
      handleError(error, globalOptions);
    }
  });

/**
 * Init command
 */
program
  .command('init <repo-name>')
  .description('Initialize a new repository')
  .option('--bare', 'Create bare repository')
  .action(async (repoName: string, cmdOptions: InitCmdOptions) => {
    const globalOptions = program.opts() as GlobalOptions;
    const spinner = ora(`Initializing repository ${repoName}...`).start();

    try {
      const client = createClient(globalOptions);

      const result = await client.init(repoName, {
        bare: cmdOptions.bare,
      });

      spinner.succeed(`Successfully initialized ${repoName}`);

      if (!globalOptions.quiet) {
        console.log(chalk.green('✓ Repository initialized successfully'));
        console.log(chalk.cyan('Name:'), result.name);
        console.log(chalk.cyan('Path:'), result.path);
        console.log(chalk.cyan('Type:'), result.bare ? 'bare' : 'regular');
      }

      if (globalOptions.json) {
        formatOutput(result, globalOptions);
      }
    } catch (error) {
      spinner.fail('Init failed');
      handleError(error, globalOptions);
    }
  });

/**
 * Sync command
 */
program
  .command('sync <repo-name>')
  .description('Sync repository (pull + optional push)')
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-b, --branch <branch>', 'Branch name')
  .option('--auto-push', 'Automatically push after successful pull')
  .option('--rebase', 'Use rebase instead of merge')
  .action(async (repoName: string, cmdOptions: SyncCmdOptions) => {
    const globalOptions = program.opts() as GlobalOptions;
    const spinner = ora(`Syncing ${repoName}...`).start();

    try {
      const client = createClient(globalOptions);

      // Pull first
      spinner.text = `Pulling changes for ${repoName}...`;
      const pullResult = await client.pull(repoName, {
        remote: cmdOptions.remote,
        branch: cmdOptions.branch,
        rebase: cmdOptions.rebase,
      });

      let pushResult: Awaited<ReturnType<GitClient['push']>> | null = null;
      if (cmdOptions.autoPush) {
        const statusResult = await client.status(repoName);
        if (statusResult.status.ahead > 0) {
          spinner.text = `Pushing changes for ${repoName}...`;
          pushResult = await client.push(repoName, {
            remote: cmdOptions.remote,
            branch: cmdOptions.branch,
          });
        }
      }

      spinner.succeed(`Successfully synced ${repoName}`);

      if (!globalOptions.quiet) {
        console.log(chalk.green('✓ Sync completed successfully'));
        console.log(chalk.cyan('Repository:'), pullResult.name);
        console.log(chalk.cyan('Pull changes:'), pullResult.result.summary?.changes || 0);
        if (pushResult) {
          console.log(chalk.cyan('Push:'), 'completed');
        }
      }

      const result = {
        repository: pullResult.name,
        pull: pullResult,
        push: pushResult,
        syncedAt: new Date().toISOString(),
      };

      if (globalOptions.json) {
        formatOutput(result, globalOptions);
      }
    } catch (error) {
      spinner.fail('Sync failed');
      handleError(error, globalOptions);
    }
  });

/**
 * Config command
 */
program
  .command('config')
  .description('Manage configuration')
  .action(async () => {
    const globalOptions = program.opts() as GlobalOptions;

    try {
      await setupConfig();
      console.log(chalk.green('✓ Configuration setup completed'));
    } catch (error) {
      handleError(error, globalOptions);
    }
  });

// Handle unknown commands
program.on('command:*', (operands: string[]) => {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log('See --help for available commands');
  process.exit(1);
});

// Parse arguments
if (process.argv.length < 3) {
  program.help();
} else {
  program.parse(process.argv);
}
