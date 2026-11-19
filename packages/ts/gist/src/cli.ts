#!/usr/bin/env node

/**
 * @fileoverview GitHub Gists CLI entrypoint.
 * @module cli
 */

import { Command } from 'commander';
import {
  validateProxyFlagsOrExit,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';
import chalk from 'chalk';

import GistAPI from './index.js';
import { Formatter } from './lib/utils/formatter.js';
import type { OutputFormat } from './lib/utils/formatter.js';
import { config } from './lib/utils/config.js';
import './lib/cli/globals.js';

import { createListCommand } from './lib/cli/commands/list.js';
import { createCreateCommand } from './lib/cli/commands/create.js';
import { createUpdateCommand } from './lib/cli/commands/update.js';
import { createDeleteCommand } from './lib/cli/commands/delete.js';
import { createStarCommand } from './lib/cli/commands/star.js';
import { createForkCommand } from './lib/cli/commands/fork.js';
import { createCommentCommand } from './lib/cli/commands/comment.js';
import { createGetCommand } from './lib/cli/commands/get.js';
import { createCommitsCommand } from './lib/cli/commands/commits.js';
import { VERSION } from './version.js';

// Package metadata, generated from package.json at build time
// (scripts/gen-version.mjs) so the published bin does not depend on resolving
// package.json relative to the build output directory.
const packageJson = {
  version: VERSION
};

/**
 * Global options applied before any command action.
 */
interface GlobalOptions {
  token?: string;
  format: OutputFormat;
  color: boolean;
}

/**
 * Shape of an error potentially carrying commander / API error metadata.
 */
interface CliError extends Error {
  code?: string;
  exitCode?: number;
  resetTime?: number;
  errors?: { field?: string; message?: string }[];
}

// Create main program
const program = new Command();

program
  .name('gist')
  .description('GitHub Gists CLI - Manage your GitHub gists from the command line')
  .version(packageJson.version)
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-f, --format <format>', 'Output format (json, yaml, table)', 'json')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', (thisCommand) => {
    // Set up global options
    const opts = thisCommand.opts<GlobalOptions>();

    // Disable colors if requested
    if (!opts.color) {
      chalk.level = 0;
    }

    // Store format globally
    global.outputFormat = opts.format;

    // Create API client
    global.gistAPI = new GistAPI({
      token: opts.token,
      // `--proxy` / `--no-proxy` / `--proxy-bypass`, mapped onto the client
      // options and validated before any request is issued (PRD 0002, R8).
      ...proxyOptionsFrom(program.opts())
    });

    global.formatter = new Formatter(opts.format);
  });

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);
// Checked here, before commander routes to a subcommand: two contradictory
// flags, or a value that cannot be a proxy URL, must not surface as an unknown
// command or a stack trace (R8, R9).
validateProxyFlagsOrExit();

// Config command
program
  .command('config')
  .description('Manage CLI configuration')
  .argument('[action]', 'Action to perform (get, set, delete, list)')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value')
  .action((action: string | undefined, key: string | undefined, value: string | undefined) => {
    switch (action) {
      case 'set':
        if (!key || !value) {
          console.error(chalk.red('Key and value are required for set action'));
          process.exit(1);
        }
        config.set(key, value);
        console.log(chalk.green(`✓ Set ${key} = ${value}`));
        break;

      case 'get': {
        if (!key) {
          console.error(chalk.red('Key is required for get action'));
          process.exit(1);
        }
        const val = config.get(key);
        if (val !== undefined) {
          console.log(val);
        } else {
          console.log(chalk.yellow(`Key '${key}' not found`));
        }
        break;
      }

      case 'delete':
        if (!key) {
          console.error(chalk.red('Key is required for delete action'));
          process.exit(1);
        }
        config.delete(key);
        console.log(chalk.green(`✓ Deleted ${key}`));
        break;

      case 'list':
      case undefined: {
        const allConfig = config.load();
        if (Object.keys(allConfig).length === 0) {
          console.log(chalk.yellow('No configuration found'));
        } else {
          console.log(JSON.stringify(allConfig, null, 2));
        }
        break;
      }

      case 'clear':
        config.clear();
        console.log(chalk.green('✓ Configuration cleared'));
        break;

      default:
        console.error(chalk.red(`Unknown action: ${action}`));
        console.log('Available actions: get, set, delete, list, clear');
        process.exit(1);
    }
  });

// Add all commands
createListCommand(program);
createCreateCommand(program);
createGetCommand(program);
createUpdateCommand(program);
createDeleteCommand(program);
createStarCommand(program);
createForkCommand(program);
createCommentCommand(program);
createCommitsCommand(program);

// Error handling
program.exitOverride();

/**
 * Parse argv and run, applying the source's error-class-specific reporting.
 */
async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (caught) {
    const error = caught as CliError;
    // exitOverride() makes commander throw on its own normal exits too (help and
    // version). Treat those as the success they are rather than reporting an error.
    if (
      error.code === 'commander.helpDisplayed' ||
      error.code === 'commander.help' ||
      error.code === 'commander.version'
    ) {
      process.exit(error.exitCode ?? 0);
    }
    if (error.code === 'commander.unknownCommand') {
      console.error(chalk.red('Unknown command'));
      program.outputHelp();
    } else if (error.name === 'AuthenticationError') {
      console.error(chalk.red('Authentication required'));
      console.log(chalk.yellow('Please set your GitHub token:'));
      console.log('  1. Set GITHUB_TOKEN environment variable');
      console.log('  2. Use --token flag');
      console.log('  3. Run: gist config set token <your-token>');
    } else if (error.name === 'RateLimitError') {
      const resetDate = new Date(error.resetTime ?? 0);
      console.error(chalk.red('Rate limit exceeded'));
      console.log(chalk.yellow(`Resets at: ${resetDate.toLocaleString()}`));
    } else if (error.name === 'ValidationError') {
      console.error(chalk.red('Validation error:'), error.message);
      if (error.errors && error.errors.length > 0) {
        error.errors.forEach((err) => {
          console.log(chalk.yellow(`  - ${err.field}: ${err.message}`));
        });
      }
    } else {
      console.error(chalk.red('Error:'), error.message);
      if (process.env['DEBUG']) {
        console.error(error);
      }
    }
    process.exit(1);
  }
}

void main();
