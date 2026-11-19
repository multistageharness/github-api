#!/usr/bin/env node

/**
 * @fileoverview GitHub Repository CLI - Command Line Interface
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
import ora from 'ora';
import dotenv from 'dotenv';

import { RepoClient } from './client/RepoClient.js';
import { RepoError, AuthError } from './utils/errors.js';
import * as commands from './cli/commands/index.js';
import { setupConfig, loadConfig } from './cli/config.js';
import { PACKAGE_NAME, VERSION } from './version.js';

// Load environment variables
dotenv.config();

// Package info
const packageJson = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'GitHub Repository API client and CLI'
};

/**
 * Options used when constructing a client from a command action.
 */
interface CommandClientOptions {
  token?: string;
  [key: string]: unknown;
}

/**
 * Options for the `repo get` command.
 */
interface RepoGetOptions extends CommandClientOptions {
  full?: boolean;
}

/**
 * Options for the `repo list` command.
 */
interface RepoListCmdOptions extends CommandClientOptions {
  type?: string;
  sort?: string;
  direction?: string;
  limit?: string;
}

/**
 * Options for the `repo create` command.
 */
interface RepoCreateOptions extends CommandClientOptions {
  description?: string;
  private?: boolean;
  init?: boolean;
  template?: string;
  org?: string;
}

/**
 * Options for the `repo delete` command.
 */
interface RepoDeleteOptions extends CommandClientOptions {
  force?: boolean;
}

/**
 * Options for the `branch list` command.
 */
interface BranchListCmdOptions extends CommandClientOptions {
  protected?: boolean;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name('gh-repo')
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
process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('✗ Uncaught Exception:'), error.message);
  if (program.opts()['verbose']) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error(chalk.red('✗ Unhandled Rejection:'), reason);
  if (program.opts()['verbose']) {
    console.error(promise);
  }
  process.exit(1);
});

/**
 * Create authenticated client from CLI options
 */
async function createClient(options: CommandClientOptions = {}): Promise<RepoClient> {
  const globalOpts = program.opts();
  const config = await loadConfig();

  const token =
    options.token || globalOpts['token'] || config.token || process.env['GITHUB_TOKEN'];

  if (!token) {
    throw new AuthError(
      'GitHub token required. Set GITHUB_TOKEN environment variable or use --token option'
    );
  }

  return new RepoClient({
    // `--proxy` / `--no-proxy` / `--proxy-bypass`, mapped onto the client options
    // and validated before any request is issued (PRD 0002, R8).
    ...proxyOptionsFrom(program.opts()),
    token,
    baseUrl: globalOpts['baseUrl'],
    timeout: parseInt(globalOpts['timeout']),
    rateLimiting: { enabled: !globalOpts['noRateLimit'] },
    verbose: globalOpts['verbose']
  });
}

/**
 * Repository commands
 */
const repoCmd = program
  .command('repo')
  .alias('repository')
  .description('Repository management commands');

// Get repository
repoCmd
  .command('get <owner> <repo>')
  .description('Get repository information')
  .option('--full', 'Show full repository details')
  .action(async (owner: string, repo: string, options: RepoGetOptions) => {
    const spinner = ora('Fetching repository...').start();
    try {
      const client = await createClient(options);
      const result = await client.repositories.get(owner, repo);

      spinner.succeed('Repository fetched successfully');
      await commands.repositories.displayRepository(result as Record<string, unknown>, {
        ...program.opts(),
        ...options
      });
    } catch (error) {
      spinner.fail('Failed to fetch repository');
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// List repositories
repoCmd
  .command('list [user]')
  .alias('ls')
  .description('List repositories for user or authenticated user')
  .option('--type <type>', 'Repository type (all, owner, member)', 'all')
  .option('--sort <sort>', 'Sort by (created, updated, pushed, full_name)', 'updated')
  .option('--direction <direction>', 'Sort direction (asc, desc)', 'desc')
  .option('--limit <limit>', 'Limit number of results', '30')
  .action(async (user: string | undefined, options: RepoListCmdOptions) => {
    const spinner = ora('Fetching repositories...').start();
    try {
      const client = await createClient(options);
      const repos = (user
        ? await client.repositories.listForUser(user, options)
        : await client.repositories.listForAuthenticatedUser(options)) as Record<string, unknown>[];

      spinner.succeed(`Found ${repos.length} repositories`);
      await commands.repositories.displayRepositoryList(repos, {
        ...program.opts(),
        ...options
      });
    } catch (error) {
      spinner.fail('Failed to fetch repositories');
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// Create repository
repoCmd
  .command('create <name>')
  .description('Create a new repository')
  .option('-d, --description <description>', 'Repository description')
  .option('--private', 'Create private repository')
  .option('--init', 'Initialize with README')
  .option('--template <template>', 'Create from template repository')
  .option('--org <organization>', 'Create in organization')
  .action(async (name: string, options: RepoCreateOptions) => {
    const spinner = ora('Creating repository...').start();
    try {
      const client = await createClient(options);
      const repoData = {
        name,
        description: options.description,
        private: options.private || false,
        auto_init: options.init || false
      };

      const result = (options.org
        ? await client.repositories.createInOrg(options.org, repoData)
        : await client.repositories.create(repoData)) as {
        full_name: string;
        html_url: string;
      };

      spinner.succeed('Repository created successfully');
      console.log(chalk.green(`✓ Created repository: ${result.full_name}`));
      console.log(chalk.blue(`  URL: ${result.html_url}`));
    } catch (error) {
      spinner.fail('Failed to create repository');
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// Delete repository
repoCmd
  .command('delete <owner> <repo>')
  .alias('rm')
  .description('Delete a repository')
  .option('--force', 'Skip confirmation prompt')
  .action(async (owner: string, repo: string, options: RepoDeleteOptions) => {
    if (!options.force) {
      const { confirm } = await import('inquirer');
      const { shouldDelete } = await confirm({
        name: 'shouldDelete',
        message: `Are you sure you want to delete ${owner}/${repo}? This action cannot be undone.`,
        default: false
      });

      if (!shouldDelete) {
        console.log('Operation cancelled');
        return;
      }
    }

    const spinner = ora('Deleting repository...').start();
    try {
      const client = await createClient(options);
      await client.repositories.deleteRepo(owner, repo);

      spinner.succeed('Repository deleted successfully');
      console.log(chalk.green(`✓ Deleted repository: ${owner}/${repo}`));
    } catch (error) {
      spinner.fail('Failed to delete repository');
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Branch commands
 */
const branchCmd = program.command('branch').description('Branch management commands');

branchCmd
  .command('list <owner> <repo>')
  .alias('ls')
  .description('List repository branches')
  .option('--protected', 'Show only protected branches')
  .action(async (owner: string, repo: string, options: BranchListCmdOptions) => {
    const spinner = ora('Fetching branches...').start();
    try {
      const client = await createClient(options);
      const branches = (await client.branches.list(owner, repo, options)) as Record<
        string,
        unknown
      >[];

      spinner.succeed(`Found ${branches.length} branches`);
      await commands.branches.displayBranchList(branches, {
        ...program.opts(),
        ...options
      });
    } catch (error) {
      spinner.fail('Failed to fetch branches');
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Collaborator commands
 */
const collabCmd = program
  .command('collaborator')
  .alias('collab')
  .description('Collaborator management commands');

collabCmd
  .command('list <owner> <repo>')
  .alias('ls')
  .description('List repository collaborators')
  .action(async (owner: string, repo: string, options: CommandClientOptions) => {
    const spinner = ora('Fetching collaborators...').start();
    try {
      const client = await createClient(options);
      const collaborators = (await client.collaborators.list(owner, repo)) as Record<
        string,
        unknown
      >[];

      spinner.succeed(`Found ${collaborators.length} collaborators`);
      await commands.collaborators.displayCollaboratorList(collaborators, {
        ...program.opts(),
        ...options
      });
    } catch (error) {
      spinner.fail('Failed to fetch collaborators');
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Configuration commands
 */
const configCmd = program.command('config').description('Configuration management');

configCmd
  .command('setup')
  .description('Interactive configuration setup')
  .action(async () => {
    try {
      await setupConfig();
      console.log(chalk.green('✓ Configuration completed'));
    } catch (error) {
      console.error(chalk.red('Configuration failed:'), (error as Error).message);
      process.exit(1);
    }
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    try {
      const config = await loadConfig();
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(chalk.red('Failed to load configuration:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Help command enhancement
 */
program
  .command('help [command]')
  .description('Display help for command')
  .action((command?: string) => {
    if (command) {
      program.commands.find((cmd) => cmd.name() === command)?.help();
    } else {
      program.help();
    }
  });

/**
 * Parse command line arguments and execute
 */
async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof AuthError) {
      console.error(chalk.red('Authentication Error:'), error.message);
      console.log(chalk.yellow('💡 Tip: Run `gh-repo config setup` to configure authentication'));
    } else if (error instanceof RepoError) {
      console.error(chalk.red('Repository Error:'), error.message);
    } else {
      console.error(chalk.red('Error:'), (error as Error).message);
      if (program.opts()['verbose']) {
        console.error((error as Error).stack);
      }
    }
    process.exit(1);
  }
}

// Run CLI when this module is loaded as the entrypoint (the published bin).
void main();

export { program, createClient };
export default program;
