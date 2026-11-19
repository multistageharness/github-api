#!/usr/bin/env node

/**
 * GitHub Activity CLI
 * Command-line interface for GitHub Activity API
 */

import {
  validateProxyFlagsOrExit,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';
import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import { program } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { createClient } from '../index.js';
import type { ActivityClientOptions } from '../client/ActivityClient.js';
import { setupCommands } from '../cli/commands.js';
import type { GlobalOptions } from '../cli/commands.js';
import { displayBanner, displayError, shouldShowBanner } from '../cli/formatters.js';
import { VERSION } from '../version.js';

/**
 * Top-level CLI flags.
 */
interface CliGlobalOptions extends GlobalOptions {
  token?: string;
  baseUrl?: string;
  config?: string;
  output?: string;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  noColor?: boolean;
  debug?: boolean;
}

// Load environment variables
config();

// Display banner (interactive terminals only; never on --version / --quiet)
if (shouldShowBanner()) {
  displayBanner(VERSION);
}

// Main CLI program
program
  .name('github-activity')
  .alias('gha')
  .description('GitHub Activity API CLI - Manage events, notifications, stars, and watching')
  .version(VERSION)
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-b, --base-url <url>', 'GitHub API base URL', DEFAULT_BASE_URL)
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-o, --output <format>', 'Output format (json, table, csv)', 'table')
  .option('-q, --quiet', 'Suppress non-error output')
  .option('-v, --verbose', 'Verbose output')
  .option('--no-color', 'Disable colored output')
  .option('--debug', 'Enable debug mode');

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);
// Checked here, before commander routes to a subcommand: two contradictory
// flags, or a value that cannot be a proxy URL, must not surface as an unknown
// command or a stack trace (R8, R9).
validateProxyFlagsOrExit();

// Global error handler
process.on('unhandledRejection', (error) => {
  displayError(error);
  process.exit(1);
});

// Initialize client and setup commands
async function main(): Promise<void> {
  try {
    // Get global options
    const options = program.opts<CliGlobalOptions>();

    // Disable colors if requested
    if (options.noColor) {
      chalk.level = 0;
    }

    // Set debug mode
    if (options.debug) {
      process.env['DEBUG'] = 'true';
    }

    // Create client
    const clientOptions: ActivityClientOptions = {
      token: options.token || process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'],
      baseURL: options.baseUrl,
      debug: options.debug,
      // `--proxy` / `--no-proxy` / `--proxy-bypass`, mapped onto the client
      // options and validated before any request is issued (PRD 0002, R8).
      ...proxyOptionsFrom(program.opts())
    };

    if (options.config) {
      clientOptions.configPath = options.config;
    }

    const client = await createClient(clientOptions);

    // Setup commands with client
    setupCommands(program, client, options);

    // Parse arguments
    await program.parseAsync(process.argv);

    // Show help if no command provided
    if (process.argv.length < 3) {
      program.help();
    }
  } catch (error) {
    displayError(error);
    process.exit(1);
  }
}

// Run CLI
void main();
