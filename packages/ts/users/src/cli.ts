#!/usr/bin/env node

/**
 * @fileoverview GitHub Users CLI - Command Line Interface
 * @version 1.0.0
 */

import {
  validateProxyFlagsOrExit,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';
import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import { Command } from 'commander';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import dotenv from 'dotenv';

import { UsersClient } from './client/UsersClient.js';
import { UsersError, AuthError } from './utils/errors.js';
import { getAuth } from './client/auth.js';
import { formatError, formatSuccess, formatInfo } from './utils/formatting.js';
import { PACKAGE_NAME, VERSION } from './version.js';

// Load environment variables
dotenv.config();

/**
 * Global CLI options shared across commands.
 */
interface GlobalOptions {
  token?: string;
  baseUrl?: string;
  timeout?: string;
  noRateLimit?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  color?: boolean;
}

/**
 * Options for the `profile update` command.
 */
interface ProfileUpdateOptions {
  name?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  twitter?: string;
  hireable?: boolean;
  notHireable?: boolean;
}

/**
 * Options for the `email list` command.
 */
interface EmailListOptions {
  verified?: boolean;
  unverified?: boolean;
  primary?: boolean;
}

/**
 * Options for the `user list` command.
 */
interface UserListOptions {
  since?: number;
  perPage?: number;
  type?: string;
}

/**
 * Options for the `context get` command.
 */
interface ContextGetOptions {
  subjectType?: string;
  subjectId?: string;
}

// Package info
const packageJson = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'GitHub Users API client and CLI'
};

/**
 * Main CLI program
 */
const program = new Command();

program
  .name('gh-users')
  .description(packageJson.description)
  .version(packageJson.version)
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('--base-url <url>', 'GitHub API base URL', DEFAULT_BASE_URL)
  .option('--timeout <ms>', 'Request timeout in milliseconds', '10000')
  .option('--no-rate-limit', 'Disable rate limiting')
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
 * Global error handler
 */
function handleError(error: unknown, options: GlobalOptions = {}): void {
  if (options.quiet) return;

  if (error instanceof AuthError) {
    console.error(formatError(`Authentication failed: ${error.message}`));
    console.error(formatInfo('Set GITHUB_TOKEN environment variable or use --token option'));
    process.exit(1);
  } else if (error instanceof UsersError) {
    console.error(formatError(error.message));
    if (options.verbose && error.response) {
      console.error(chalk.gray('Response details:'), JSON.stringify(error.response, null, 2));
    }
    process.exit(1);
  } else {
    console.error(formatError(`Unexpected error: ${(error as Error).message}`));
    if (options.verbose) {
      console.error(chalk.gray((error as Error).stack));
    }
    process.exit(1);
  }
}

/**
 * Create client from options
 */
function createClient(options: GlobalOptions): UsersClient {
  const token = options.token || getAuth();

  if (!token) {
    throw new AuthError('GitHub token is required. Set GITHUB_TOKEN environment variable or use --token option.');
  }

  return new UsersClient({
    // `--proxy` / `--no-proxy` / `--proxy-bypass`, mapped onto the client options
    // and validated before any request is issued (PRD 0002, R8).
    ...proxyOptionsFrom(program.opts()),
    token,
    baseUrl: options.baseUrl,
    timeout: parseInt(options.timeout ?? '10000'),
    rateLimiting: {
      enabled: !options.noRateLimit
    }
  });
}

/**
 * Profile commands
 */
const profileCmd = program
  .command('profile')
  .alias('me')
  .description('Manage authenticated user profile');

profileCmd
  .command('show')
  .description('Show authenticated user profile')
  .action(async (_options: Record<string, unknown>) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      spinner = globalOptions.quiet ? null : ora('Fetching user profile...').start();

      const user = await client.profile.getAuthenticated();

      if (spinner) spinner.succeed('Profile retrieved');

      if (globalOptions.json) {
        console.log(JSON.stringify(user, null, 2));
      } else {
        const { formatUser } = await import('./utils/formatting.js');
        console.log(formatUser(user));
      }
    } catch (error) {
      if (spinner) spinner.fail('Failed to retrieve profile');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

profileCmd
  .command('update')
  .description('Update authenticated user profile')
  .option('--name <name>', 'Full name')
  .option('--bio <bio>', 'Biography')
  .option('--company <company>', 'Company')
  .option('--location <location>', 'Location')
  .option('--blog <url>', 'Blog URL')
  .option('--twitter <username>', 'Twitter username')
  .option('--hireable', 'Set as hireable')
  .option('--not-hireable', 'Set as not hireable')
  .action(async (options: ProfileUpdateOptions) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      const updateData: Record<string, unknown> = {};
      if (options.name !== undefined) updateData['name'] = options.name;
      if (options.bio !== undefined) updateData['bio'] = options.bio;
      if (options.company !== undefined) updateData['company'] = options.company;
      if (options.location !== undefined) updateData['location'] = options.location;
      if (options.blog !== undefined) updateData['blog'] = options.blog;
      if (options.twitter !== undefined) updateData['twitter_username'] = options.twitter;
      if (options.hireable) updateData['hireable'] = true;
      if (options.notHireable) updateData['hireable'] = false;

      if (Object.keys(updateData).length === 0) {
        console.log(formatInfo('No updates specified. Use --help to see available options.'));
        return;
      }

      spinner = globalOptions.quiet ? null : ora('Updating profile...').start();

      const user = await client.profile.updateAuthenticated(updateData);

      if (spinner) spinner.succeed('Profile updated');

      if (globalOptions.json) {
        console.log(JSON.stringify(user, null, 2));
      } else {
        console.log(formatSuccess('Profile updated successfully!'));
        const { formatUser } = await import('./utils/formatting.js');
        console.log(formatUser(user));
      }
    } catch (error) {
      if (spinner) spinner.fail('Failed to update profile');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

/**
 * Email commands
 */
const emailCmd = program
  .command('email')
  .alias('emails')
  .description('Manage authenticated user email addresses');

emailCmd
  .command('list')
  .description('List email addresses')
  .option('--verified', 'Show only verified emails')
  .option('--unverified', 'Show only unverified emails')
  .option('--primary', 'Show only primary email')
  .action(async (options: EmailListOptions) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      spinner = globalOptions.quiet ? null : ora('Fetching email addresses...').start();

      let emails;
      if (options.verified) {
        emails = await client.emails.getVerified();
      } else if (options.unverified) {
        emails = await client.emails.getUnverified();
      } else if (options.primary) {
        const primary = await client.emails.getPrimary();
        emails = primary ? [primary] : [];
      } else {
        emails = await client.emails.list();
      }

      if (spinner) spinner.succeed(`Found ${emails.length} email address${emails.length === 1 ? '' : 'es'}`);

      if (globalOptions.json) {
        console.log(JSON.stringify(emails, null, 2));
      } else {
        const { formatEmails } = await import('./utils/formatting.js');
        console.log(formatEmails(emails));
      }
    } catch (error) {
      if (spinner) spinner.fail('Failed to retrieve email addresses');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

emailCmd
  .command('add <emails...>')
  .description('Add email addresses')
  .action(async (emails: string[]) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      spinner = globalOptions.quiet
        ? null
        : ora(`Adding ${emails.length} email address${emails.length === 1 ? '' : 'es'}...`).start();

      const result = await client.emails.add(emails);

      if (spinner) spinner.succeed(`Added ${result.length} email address${result.length === 1 ? '' : 'es'}`);

      if (globalOptions.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatSuccess(`Successfully added ${result.length} email address${result.length === 1 ? '' : 'es'}!`));
        emails.forEach((email) => console.log(`  + ${email}`));
      }
    } catch (error) {
      if (spinner) spinner.fail('Failed to add email addresses');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

emailCmd
  .command('delete <emails...>')
  .alias('remove')
  .description('Delete email addresses')
  .action(async (emails: string[]) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      spinner = globalOptions.quiet
        ? null
        : ora(`Deleting ${emails.length} email address${emails.length === 1 ? '' : 'es'}...`).start();

      await client.emails.delete(emails);

      if (spinner) spinner.succeed(`Deleted ${emails.length} email address${emails.length === 1 ? '' : 'es'}`);

      if (!globalOptions.json) {
        console.log(formatSuccess(`Successfully deleted ${emails.length} email address${emails.length === 1 ? '' : 'es'}!`));
        emails.forEach((email) => console.log(`  - ${email}`));
      }
    } catch (error) {
      if (spinner) spinner.fail('Failed to delete email addresses');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

/**
 * User discovery commands
 */
const userCmd = program
  .command('user')
  .alias('users')
  .description('Discover and view user information');

userCmd
  .command('get <username>')
  .description('Get user information by username')
  .action(async (username: string) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      spinner = globalOptions.quiet ? null : ora(`Fetching user ${username}...`).start();

      const user = await client.discovery.getByUsername(username);

      if (spinner) spinner.succeed(`Retrieved user ${username}`);

      if (globalOptions.json) {
        console.log(JSON.stringify(user, null, 2));
      } else {
        const { formatUser } = await import('./utils/formatting.js');
        console.log(formatUser(user));
      }
    } catch (error) {
      if (spinner) spinner.fail(`Failed to retrieve user ${username}`);
      handleError(error, program.opts<GlobalOptions>());
    }
  });

userCmd
  .command('list')
  .description('List GitHub users')
  .option('--since <id>', 'User ID to start listing from', parseInt)
  .option('--per-page <count>', 'Number of users per page (max 100)', parseInt, 30)
  .option('--type <type>', 'Filter by user type (User or Organization)')
  .action(async (options: UserListOptions) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      const listOptions: { since?: number; per_page?: number } = {};
      if (options.since) listOptions.since = options.since;
      if (options.perPage) listOptions.per_page = options.perPage;

      spinner = globalOptions.quiet ? null : ora('Fetching users...').start();

      let users = await client.discovery.list(listOptions);

      // Filter by type if specified
      if (options.type) {
        users = users.filter((user) => user.type === options.type);
      }

      if (spinner) spinner.succeed(`Found ${users.length} users`);

      if (globalOptions.json) {
        console.log(JSON.stringify(users, null, 2));
      } else {
        const { formatUserTable } = await import('./utils/formatting.js');
        console.log(formatUserTable(users));
      }
    } catch (error) {
      if (spinner) spinner.fail('Failed to list users');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

/**
 * Context/hovercard commands
 */
const contextCmd = program
  .command('context')
  .alias('hovercard')
  .description('Get contextual user information');

contextCmd
  .command('get <username>')
  .description('Get user context information')
  .option('--subject-type <type>', 'Context subject type (repository, issue, pull_request, organization)')
  .option('--subject-id <id>', 'Context subject ID')
  .action(async (username: string, options: ContextGetOptions) => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      const contextOptions: { subject_type?: string; subject_id?: string } = {};
      if (options.subjectType) contextOptions.subject_type = options.subjectType;
      if (options.subjectId) contextOptions.subject_id = options.subjectId;

      spinner = globalOptions.quiet ? null : ora(`Fetching context for ${username}...`).start();

      const context = await client.context.getForUser(username, contextOptions);

      if (spinner) spinner.succeed(`Retrieved context for ${username}`);

      if (globalOptions.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        const { formatUserContext } = await import('./utils/formatting.js');
        console.log(formatUserContext(context));
      }
    } catch (error) {
      if (spinner) spinner.fail(`Failed to retrieve context for ${username}`);
      handleError(error, program.opts<GlobalOptions>());
    }
  });

/**
 * Test authentication command
 */
program
  .command('auth-test')
  .description('Test authentication and show rate limit information')
  .action(async () => {
    let spinner: Ora | null = null;
    try {
      const globalOptions = program.opts<GlobalOptions>();
      const client = createClient(globalOptions);

      spinner = globalOptions.quiet ? null : ora('Testing authentication...').start();

      const rateLimit = await client.testAuth();

      if (spinner) spinner.succeed('Authentication successful!');

      if (globalOptions.json) {
        console.log(JSON.stringify(rateLimit, null, 2));
      } else {
        console.log(formatSuccess('Authentication successful!'));
        console.log(formatInfo('Rate limit information:'));
        console.log(`  Core: ${rateLimit.resources.core.remaining}/${rateLimit.resources.core.limit}`);
        console.log(`  Search: ${rateLimit.resources.search.remaining}/${rateLimit.resources.search.limit}`);
        console.log(`  Reset: ${new Date(rateLimit.resources.core.reset * 1000).toLocaleString()}`);
      }
    } catch (error) {
      if (spinner) spinner.fail('Authentication failed');
      handleError(error, program.opts<GlobalOptions>());
    }
  });

/**
 * Parse and execute
 */
program.parse();
