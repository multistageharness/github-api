#!/usr/bin/env node

/**
 * GitHub Issues CLI
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  validateProxyFlagsOrExit,
  proxyFlagsFromArgv,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';
import { GitHubRestClient } from '@internal/github-sdk-fetch-rest-api';
import { GitHubRateLimiter, isRateLimitError } from '@internal/github-sdk-ratelimit';
import { createClient } from './index.js';
import { loadConfig, resolveRepository, initConfig } from './lib/config.js';
import { getAuth } from './lib/auth.js';
import { formatOutput, formatError, formatSuccess } from './utils/format.js';
import type { IssuesClient } from './lib/client.js';
import type { CommandOptions, Command } from './commands/types.js';

// Import commands
import listCommand from './commands/list.js';
import getCommand from './commands/get.js';
import createCommand from './commands/create.js';
import updateCommand from './commands/update.js';
import commentsCommand from './commands/comments.js';
import labelsCommand from './commands/labels.js';
import assigneesCommand from './commands/assignees.js';
import milestonesCommand from './commands/milestones.js';
import { VERSION } from './version.js'; // generated from package.json

// Checked before anything else in this module: the search client below is built
// at module scope and reads the proxy flags itself, so a contradiction has to be
// caught here or it surfaces as a stack trace instead of a message (R8).
validateProxyFlagsOrExit();

/**
 * Governs the CLI's one direct GitHub call — the `/search/issues` request in
 * the `search` command. Everything else goes through the SDK client.
 */
const searchLimiter = new GitHubRateLimiter();

/**
 * The transport for that one call (PRD 0002, R14).
 *
 * Built with no token: the CLI resolves `GITHUB_TOKEN` through `getAuth()` at
 * call time, and the layer deliberately reads no environment variable of its
 * own (R4). The `token` scheme is kept rather than switched to the layer's
 * `Bearer` default, so the request on the wire is byte-for-byte what it was.
 */
const searchClient = new GitHubRestClient({
  authScheme: 'token',
  accept: 'application/vnd.github.v3+json',
  limiter: searchLimiter,
  // Built at module scope, before commander has parsed anything, so the proxy
  // flags are read straight off `process.argv`. Without this, `gh-issues search
  // --proxy …` would proxy every request except the one this client issues —
  // which is exactly the kind of partial coverage PRD 0002 R13 exists to
  // prevent.
  ...proxyOptionsFrom(proxyFlagsFromArgv()),
});

/** Global program options. */
interface GlobalOptions {
  repo?: string;
  token?: string;
  output?: string;
  noColor?: boolean;
  config?: boolean;
  [key: string]: unknown;
}


// Configure program
program
  .name('gh-issues')
  .description('GitHub Issues CLI - Manage GitHub issues from the command line')
  .version(VERSION)
  .option('-r, --repo <owner/repo>', 'Repository (owner/repo format)')
  .option('-t, --token <token>', 'GitHub authentication token')
  .option('-o, --output <format>', 'Output format (json, table, text)', 'text')
  .option('--no-color', 'Disable colored output')
  .option('--config', 'Show configuration')
  .hook('preAction', (thisCommand) => {
    // Global pre-action hook
    if ((thisCommand.opts() as GlobalOptions).noColor) {
      chalk.level = 0;
    }
  });

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);

// List issues command
program
  .command('list')
  .alias('ls')
  .description('List issues')
  .option('-s, --state <state>', 'Filter by state (open, closed, all)', 'open')
  .option('-l, --labels <labels>', 'Filter by labels (comma-separated)')
  .option('-a, --assignee <assignee>', 'Filter by assignee')
  .option('-c, --creator <creator>', 'Filter by creator')
  .option('-m, --milestone <milestone>', 'Filter by milestone')
  .option('--sort <field>', 'Sort by (created, updated, comments)', 'created')
  .option('--direction <dir>', 'Sort direction (asc, desc)', 'desc')
  .option('--limit <number>', 'Maximum number of results', parseInt)
  .option('--all', 'Fetch all pages')
  .option('--org <org>', 'List issues for organization')
  .action(async (options: CommandOptions) => {
    await executeCommand(listCommand, options);
  });

// Get single issue
program
  .command('get <number>')
  .alias('show')
  .description('Get issue details')
  .option('--comments', 'Include comments')
  .option('--events', 'Include events')
  .option('--timeline', 'Include timeline')
  .action(async (number: string, options: CommandOptions) => {
    await executeCommand(getCommand, { number: parseInt(number), ...options });
  });

// Create issue
program
  .command('create')
  .alias('new')
  .description('Create a new issue')
  .option('--title <title>', 'Issue title')
  .option('--body <body>', 'Issue description')
  .option('--labels <labels>', 'Labels (comma-separated)')
  .option('--assignees <assignees>', 'Assignees (comma-separated)')
  .option('--milestone <milestone>', 'Milestone number')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options: CommandOptions) => {
    await executeCommand(createCommand, options);
  });

// Update issue
program
  .command('update <number>')
  .alias('edit')
  .description('Update an issue')
  .option('--title <title>', 'New title')
  .option('--body <body>', 'New description')
  .option('--state <state>', 'State (open, closed)')
  .option('--labels <labels>', 'Replace labels (comma-separated)')
  .option('--milestone <milestone>', 'Milestone number')
  .action(async (number: string, options: CommandOptions) => {
    await executeCommand(updateCommand, { number: parseInt(number), ...options });
  });

// Close issue
program
  .command('close <number>')
  .description('Close an issue')
  .option('--reason <reason>', 'Close reason (completed, not_planned, duplicate)', 'completed')
  .action(async (number: string, options: { reason?: string }) => {
    const client = await getConfiguredClient(program.opts() as GlobalOptions);
    const spinner = ora('Closing issue...').start();

    try {
      const issue = (await client.update(parseInt(number), {
        state: 'closed',
        state_reason: options.reason
      })) as { number: number };
      spinner.succeed(formatSuccess(`Issue #${issue.number} closed`));
      console.log(formatOutput(issue, program.opts()));
    } catch (error) {
      spinner.fail();
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

// Reopen issue
program
  .command('reopen <number>')
  .description('Reopen an issue')
  .action(async (number: string) => {
    const client = await getConfiguredClient(program.opts() as GlobalOptions);
    const spinner = ora('Reopening issue...').start();

    try {
      const issue = (await client.update(parseInt(number), {
        state: 'open',
        state_reason: 'reopened'
      })) as { number: number };
      spinner.succeed(formatSuccess(`Issue #${issue.number} reopened`));
      console.log(formatOutput(issue, program.opts()));
    } catch (error) {
      spinner.fail();
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

// Lock issue
program
  .command('lock <number>')
  .description('Lock an issue')
  .option('--reason <reason>', 'Lock reason (off-topic, too heated, resolved, spam)')
  .action(async (number: string, options: { reason?: string }) => {
    const client = await getConfiguredClient(program.opts() as GlobalOptions);
    const spinner = ora('Locking issue...').start();

    try {
      await client.lock(parseInt(number), options.reason ?? null);
      spinner.succeed(formatSuccess(`Issue #${number} locked`));
    } catch (error) {
      spinner.fail();
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

// Unlock issue
program
  .command('unlock <number>')
  .description('Unlock an issue')
  .action(async (number: string) => {
    const client = await getConfiguredClient(program.opts() as GlobalOptions);
    const spinner = ora('Unlocking issue...').start();

    try {
      await client.unlock(parseInt(number));
      spinner.succeed(formatSuccess(`Issue #${number} unlocked`));
    } catch (error) {
      spinner.fail();
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

// Comments subcommands
program
  .command('comments <action>')
  .alias('comment')
  .description('Manage issue comments (list, add, edit, delete)')
  .option('-n, --number <number>', 'Issue number', parseInt)
  .option('-c, --comment <id>', 'Comment ID', parseInt)
  .option('-b, --body <body>', 'Comment body')
  .option('--since <date>', 'List comments since date')
  .action(async (action: string, options: CommandOptions) => {
    await executeCommand(commentsCommand, { action, ...options });
  });

// Labels subcommands
program
  .command('labels <action>')
  .alias('label')
  .description('Manage issue labels (list, add, remove, set)')
  .option('-n, --number <number>', 'Issue number', parseInt)
  .option('-l, --labels <labels>', 'Labels (comma-separated)')
  .option('--name <name>', 'Label name')
  .option('--color <color>', 'Label color (hex without #)')
  .option('--description <description>', 'Label description')
  .action(async (action: string, options: CommandOptions) => {
    await executeCommand(labelsCommand, { action, ...options });
  });

// Assignees subcommands
program
  .command('assignees <action>')
  .alias('assign')
  .description('Manage issue assignees (list, add, remove)')
  .option('-n, --number <number>', 'Issue number', parseInt)
  .option('-a, --assignees <assignees>', 'Assignees (comma-separated)')
  .action(async (action: string, options: CommandOptions) => {
    await executeCommand(assigneesCommand, { action, ...options });
  });

// Milestones subcommands
program
  .command('milestones <action>')
  .alias('milestone')
  .description('Manage milestones (list, create, update, delete)')
  .option('-n, --number <number>', 'Milestone number', parseInt)
  .option('--title <title>', 'Milestone title')
  .option('--description <description>', 'Milestone description')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .option('--state <state>', 'State (open, closed)')
  .action(async (action: string, options: CommandOptions) => {
    await executeCommand(milestonesCommand, { action, ...options });
  });

// Search issues
program
  .command('search <query>')
  .description('Search issues')
  .option('--in <fields>', 'Search in (title, body, comments)', 'title,body')
  .option('--author <user>', 'Filter by author')
  .option('--mentions <user>', 'Filter by mentions')
  .option('--team <team>', 'Filter by team')
  .option('--sort <field>', 'Sort by (comments, reactions, interactions, created, updated)')
  .option('--order <dir>', 'Sort order (asc, desc)', 'desc')
  .option('--limit <number>', 'Maximum results', parseInt)
  .action(
    async (
      query: string,
      options: {
        author?: string;
        mentions?: string;
        team?: string;
        sort?: string;
        order?: string;
        limit?: number;
      }
    ) => {
      const spinner = ora('Searching issues...').start();

      try {
        // Build search query
        let searchQuery = query;
        const globalOpts = program.opts() as GlobalOptions;

        if (globalOpts.repo) {
          const [owner, repo] = globalOpts.repo.split('/');
          searchQuery = `repo:${owner}/${repo} ${searchQuery}`;
        }

        if (options.author) searchQuery += ` author:${options.author}`;
        if (options.mentions) searchQuery += ` mentions:${options.mentions}`;
        if (options.team) searchQuery += ` team:${options.team}`;

        // Search using GitHub search API.
        //
        // `/search/*` is metered under GitHub's `search` resource — roughly 30
        // requests a minute against `core`'s 5000 an hour — so this call is the
        // easiest in the CLI to rate-limit. It was previously ungoverned: no
        // pacing, no retry, and a limit response was parsed as if it were a
        // result, reporting `Found undefined results`.
        // The layer builds the query and drops absent flags rather than
        // serializing them. This line used to interpolate `options.sort || ''`
        // and send `&sort=&order=undefined` when neither flag was passed —
        // exactly the `422` the encoding rule in R3 exists to prevent.
        // The CLI resolves the token; the layer applies it. `getAuth()` is read
        // per invocation because a `--token` flag can change it (R4).
        searchClient.setToken(getAuth());

        const result = await searchClient.request<{ total_count: number; items: unknown[] }>(
          'GET /search/issues',
          {
            q: searchQuery,
            sort: options.sort,
            order: options.order,
          },
          { resource: 'search' },
        );

        const data = result.data;
        spinner.succeed(`Found ${data.total_count} results`);

        const items = options.limit ? data.items.slice(0, options.limit) : data.items;
        console.log(formatOutput(items, globalOpts));
      } catch (error) {
        spinner.fail();
        if (isRateLimitError(error)) {
          const seconds = error.secondsUntilReset();
          console.error(
            formatError(
              new Error(
                seconds === null
                  ? `${error.message}. Try again shortly.`
                  : `${error.message}. Try again in ${seconds}s.`
              )
            )
          );
        } else {
          console.error(formatError(error as Error));
        }
        process.exit(1);
      }
    }
  );

// Initialize config
program
  .command('init')
  .description('Initialize configuration file')
  .action(async () => {
    try {
      await initConfig();
      console.log(formatSuccess('Configuration initialized'));
    } catch (error) {
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

// Helper function to execute commands
async function executeCommand(commandModule: Command, options: CommandOptions): Promise<void> {
  try {
    const globalOptions = program.opts() as GlobalOptions;
    const client = await getConfiguredClient(globalOptions);
    const config = await loadConfig();

    await commandModule.execute(client, {
      ...config,
      ...globalOptions,
      ...options
    });
  } catch (error) {
    console.error(formatError(error as Error));
    process.exit(1);
  }
}

// Helper function to get configured client
async function getConfiguredClient(options: GlobalOptions): Promise<IssuesClient> {
  const config = await loadConfig();
  let repoInfo: { owner?: string; repo?: string } = {};

  try {
    repoInfo = await resolveRepository(options);
  } catch {
    // Repository might not be needed for some commands
  }

  return createClient({
    auth: options.token || getAuth(),
    ...repoInfo,
    ...config,
    ...options,
    // Last, and from the parsed flags rather than from `options`: `--no-proxy`
    // arrives as `proxy: false` from commander and has to become the layer's
    // `proxy: null` before a client sees it (PRD 0002, R8).
    ...proxyOptionsFrom(program.opts())
  });
}

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
