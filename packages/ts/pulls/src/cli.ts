#!/usr/bin/env node

import { program } from 'commander';
import {
  validateProxyFlagsOrExit,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

import { createClient } from './index.js';
import { loadConfig, resolveRepository, initConfig } from './lib/config.js';
import { getAuth } from './lib/auth.js';
import { formatOutput } from './utils/format.js';
import { formatError } from './utils/errors.js';
import type PullRequestClient from './lib/client.js';

// Import commands
import listCommand from './commands/list.js';
import getCommand from './commands/get.js';
import createCommand from './commands/create.js';
import updateCommand from './commands/update.js';
import mergeCommand from './commands/merge.js';
import reviewCommand from './commands/review.js';
import commentsCommand from './commands/comments.js';
import filesCommand from './commands/files.js';
import searchCommand from './commands/search.js';
import { VERSION } from './version.js'; // generated from package.json


/** A command handler: receives a client + merged options and returns output. */
type CommandFunc = (client: PullRequestClient, options: Record<string, unknown>) => Promise<unknown>;

// Configure program
program
  .name('gh-pr')
  .description('GitHub Pull Request CLI')
  .version(VERSION)
  .option('-r, --repo <owner/repo>', 'Repository (owner/repo format)')
  .option('-t, --token <token>', 'GitHub authentication token')
  .option('-o, --output <format>', 'Output format (json, table, text)', 'table')
  .option('--no-color', 'Disable colored output')
  .option('--config', 'Show configuration')
  .hook('preAction', (thisCommand) => {
    // Global pre-action hook
    if (thisCommand.opts().noColor) {
      chalk.level = 0;
    }
  });

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);
// Checked here, before commander routes to a subcommand: two contradictory
// flags, or a value that cannot be a proxy URL, must not surface as an unknown
// command or a stack trace (R8, R9).
validateProxyFlagsOrExit();

// List pull requests
program
  .command('list')
  .alias('ls')
  .description('List pull requests')
  .option('-s, --state <state>', 'Filter by state (open, closed, all)', 'open')
  .option('-b, --base <branch>', 'Filter by base branch')
  .option('-h, --head <branch>', 'Filter by head branch')
  .option('--sort <field>', 'Sort by (created, updated, popularity)', 'created')
  .option('--direction <dir>', 'Sort direction (asc, desc)', 'desc')
  .option('-l, --limit <number>', 'Maximum number of results', parseInt)
  .option('--all', 'Fetch all pages')
  .action(async (options: Record<string, unknown>) => {
    await executeCommand(listCommand as CommandFunc, options);
  });

// Get single pull request
program
  .command('get <number>')
  .alias('show')
  .description('Get pull request details')
  .option('--comments', 'Include comments')
  .option('--reviews', 'Include reviews')
  .option('--commits', 'Include commits')
  .option('--files', 'Include changed files')
  .action(async (number: string, options: Record<string, unknown>) => {
    await executeCommand(getCommand as CommandFunc, { number: parseInt(number), ...options });
  });

// Create pull request
program
  .command('create')
  .alias('new')
  .description('Create a new pull request')
  .option('--title <title>', 'PR title')
  .option('--body <body>', 'PR description')
  .option('--head <branch>', 'Head branch')
  .option('--base <branch>', 'Base branch')
  .option('--draft', 'Create as draft')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options: Record<string, unknown>) => {
    await executeCommand(createCommand as CommandFunc, options);
  });

// Update pull request
program
  .command('update <number>')
  .alias('edit')
  .description('Update a pull request')
  .option('--title <title>', 'New title')
  .option('--body <body>', 'New description')
  .option('--base <branch>', 'New base branch')
  .option('--state <state>', 'State (open, closed)')
  .action(async (number: string, options: Record<string, unknown>) => {
    await executeCommand(updateCommand as CommandFunc, { number: parseInt(number), ...options });
  });

// Merge pull request
program
  .command('merge <number>')
  .description('Merge a pull request')
  .option('--method <method>', 'Merge method (merge, squash, rebase)', 'merge')
  .option('--title <title>', 'Merge commit title')
  .option('--message <message>', 'Merge commit message')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async (number: string, options: Record<string, unknown>) => {
    await executeCommand(mergeCommand as CommandFunc, { number: parseInt(number), ...options });
  });

// Review commands
program
  .command('review <number>')
  .description('Review a pull request')
  .option('--approve', 'Approve the PR')
  .option('--request-changes', 'Request changes')
  .option('--comment <comment>', 'Add a comment')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (number: string, options: Record<string, unknown>) => {
    await executeCommand(reviewCommand as CommandFunc, { number: parseInt(number), ...options });
  });

// Comments commands
program
  .command('comments <number>')
  .description('Manage pull request comments')
  .option('--add <comment>', 'Add a comment')
  .option('--list', 'List comments', true)
  .action(async (number: string, options: Record<string, unknown>) => {
    await executeCommand(commentsCommand as CommandFunc, { number: parseInt(number), ...options });
  });

// Files command
program
  .command('files <number>')
  .alias('diff')
  .description('Show changed files in a pull request')
  .option('--names-only', 'Show only file names')
  .option('--stats', 'Show file statistics')
  .action(async (number: string, options: Record<string, unknown>) => {
    await executeCommand(filesCommand as CommandFunc, { number: parseInt(number), ...options });
  });

// Search command
program
  .command('search <query>')
  .description('Search pull requests')
  .option('--repo <owner/repo>', 'Search in specific repository')
  .option('--author <username>', 'Filter by author')
  .option('--assignee <username>', 'Filter by assignee')
  .option('--label <label>', 'Filter by label')
  .option('--sort <field>', 'Sort by (created, updated, comments)', 'created')
  .option('--order <dir>', 'Sort order (asc, desc)', 'desc')
  .option('-l, --limit <number>', 'Maximum number of results', parseInt)
  .action(async (query: string, options: Record<string, unknown>) => {
    await executeCommand(searchCommand as CommandFunc, { query, ...options });
  });

// Config command
program
  .command('config')
  .description('Manage configuration')
  .option('--init', 'Initialize configuration file')
  .option('--global', 'Use global configuration')
  .option('--get <key>', 'Get configuration value')
  .option('--set <key=value>', 'Set configuration value')
  .action(async (options: Record<string, unknown>) => {
    if (options.init) {
      try {
        const configPath = initConfig(Boolean(options.global));
        console.log(chalk.green('✓'), `Configuration initialized at: ${configPath}`);
      } catch (error) {
        console.error(chalk.red('✗'), (error as Error).message);
        process.exit(1);
      }
    } else if (options.get) {
      const config = loadConfig();
      console.log(config[options.get as string] || 'Not set');
    } else if (options.set) {
      const [key, value] = (options.set as string).split('=');
      // Implementation would save the config
      console.log(`Set ${key} = ${value}`);
    } else {
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Interactive pull request management')
  .action(async () => {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          'List pull requests',
          'Get pull request details',
          'Create pull request',
          'Update pull request',
          'Merge pull request',
          'Review pull request',
          'Search pull requests',
          'Exit'
        ]
      }
    ]);

    switch (answers.action) {
      case 'List pull requests':
        await executeCommand(listCommand as CommandFunc, { interactive: true });
        break;
      case 'Get pull request details': {
        const { number } = await inquirer.prompt([
          { type: 'number', name: 'number', message: 'Pull request number:' }
        ]);
        await executeCommand(getCommand as CommandFunc, { number });
        break;
      }
      case 'Create pull request':
        await executeCommand(createCommand as CommandFunc, { interactive: true });
        break;
      case 'Exit':
        process.exit(0);
        break;
      default:
        console.log('Not implemented yet');
    }
  });

/**
 * Execute command with error handling
 */
async function executeCommand(
  commandFunc: CommandFunc,
  options: Record<string, unknown>
): Promise<void> {
  const globalOpts = program.opts();
  const config = loadConfig();

  // Merge options
  const mergedOptions: Record<string, unknown> = {
    ...config,
    ...globalOpts,
    ...options
  };

  // Resolve repository
  const { owner, repo } = resolveRepository(mergedOptions);
  if (!owner || !repo) {
    console.error(chalk.red('✗'), 'Repository not specified. Use --repo or set in config.');
    console.error('Example: gh-pr list --repo owner/repo');
    process.exit(1);
  }

  mergedOptions.owner = owner;
  mergedOptions.repo = repo;

  // Get authentication
  const auth = (mergedOptions.token as string | undefined) || getAuth();
  if (!auth) {
    console.warn(chalk.yellow('⚠'), 'No authentication token found. API rate limits will apply.');
  }
  mergedOptions.auth = auth;

  // Create client. The proxy flags are applied last and from the parsed
  // globals: `--no-proxy` arrives as `proxy: false` from commander and has to
  // become the layer's `proxy: null` before a client sees it (PRD 0002, R8).
  const client = createClient({ ...mergedOptions, ...proxyOptionsFrom(program.opts()) });

  // Show spinner for long operations
  const spinner = mergedOptions.output === 'json' ? null : ora('Loading...').start();

  try {
    const result = await commandFunc(client, mergedOptions);

    if (spinner) spinner.succeed();

    // Format and display output
    if (result !== undefined) {
      const formatted = formatOutput(result, (mergedOptions.output as string) || 'table', {
        colorize: !mergedOptions.noColor
      });
      console.log(formatted);
    }
  } catch (error) {
    if (spinner) spinner.fail();
    console.error(chalk.red('✗'), formatError(error));
    process.exit(1);
  }
}

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
