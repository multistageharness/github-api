#!/usr/bin/env node

/**
 * @fileoverview GitHub Search CLI — command-line interface for the search SDK.
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

import { createSafeSearchClient } from './lib/SafeSearchClient.js';
import type { SafeSearchClient } from './lib/SafeSearchClient.js';
import type { SearchParams, SearchResult } from './lib/BaseSearchClient.js';
import { SEARCH_ENDPOINTS } from './endpoints/index.js';
import { AuthError } from './utils/errors.js';
import { PACKAGE_NAME, VERSION } from './version.js';

// Load environment variables
dotenv.config();

const packageJson = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'Enterprise-grade GitHub Search API client and CLI',
};

/**
 * Options shared by every search subcommand.
 */
interface SearchCmdOptions {
  token?: string;
  sort?: string;
  order?: string;
  perPage?: string;
  page?: string;
  json?: boolean;
}

const program = new Command();

program
  .name('github-search')
  .description(packageJson.description)
  .version(packageJson.version)
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('--json', 'Output results as JSON');

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);
// Checked here, before commander routes to a subcommand: two contradictory
// flags, or a value that cannot be a proxy URL, must not surface as an unknown
// command or a stack trace (R8, R9).
validateProxyFlagsOrExit();

/**
 * Build an authenticated client from CLI options.
 */
function createClient(options: SearchCmdOptions = {}): SafeSearchClient {
  const globalOpts = program.opts<{ token?: string }>();
  const token = options.token ?? globalOpts.token ?? process.env['GITHUB_TOKEN'];
  if (!token) {
    throw new AuthError(
      'GitHub token required. Set GITHUB_TOKEN environment variable or use --token option'
    );
  }
  return createSafeSearchClient({
    token,
    // `--proxy` / `--no-proxy` / `--proxy-bypass`, mapped onto the client
    // options and validated before any request is issued (PRD 0002, R8).
    ...proxyOptionsFrom(program.opts())
  });
}

/**
 * Render a search result to stdout.
 */
function render(result: SearchResult, options: SearchCmdOptions): void {
  const globalOpts = program.opts<{ json?: boolean }>();
  if (options.json || globalOpts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(chalk.green(`Found ${result.total_count} results`));
  for (const item of result.items) {
    const rec = item as Record<string, unknown>;
    const name = rec['full_name'] ?? rec['name'] ?? rec['login'] ?? rec['path'] ?? 'N/A';
    console.log(`  - ${String(name)}`);
  }
}

/**
 * Wire one subcommand per supported search endpoint.
 */
for (const endpoint of SEARCH_ENDPOINTS) {
  program
    .command(`${endpoint} <query>`)
    .description(`Search ${endpoint}`)
    .option('-t, --token <token>', 'GitHub personal access token')
    .option('--sort <sort>', 'Sort field')
    .option('--order <order>', 'Sort order (asc, desc)')
    .option('--per-page <n>', 'Results per page', '30')
    .option('--page <n>', 'Page number', '1')
    .option('--json', 'Output results as JSON')
    .action(async (query: string, options: SearchCmdOptions) => {
      const spinner = ora(`Searching ${endpoint}...`).start();
      try {
        const client = createClient(options);
        const params: SearchParams = {
          q: query,
          per_page: options.perPage ? parseInt(options.perPage, 10) : undefined,
          page: options.page ? parseInt(options.page, 10) : undefined,
          sort: options.sort,
          order: options.order,
        };
        const method = `search${endpoint.charAt(0).toUpperCase()}${endpoint.slice(1)}` as
          | 'searchRepositories'
          | 'searchCode'
          | 'searchCommits'
          | 'searchIssues'
          | 'searchUsers'
          | 'searchLabels'
          | 'searchTopics';
        const result = await client[method].bind(client)(params);
        spinner.succeed(`Search complete`);
        render(result, options);
      } catch (error) {
        spinner.fail('Search failed');
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });
}

/**
 * Parse args and execute.
 */
async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof AuthError) {
      console.error(chalk.red('Authentication Error:'), error.message);
    } else {
      console.error(chalk.red('Error:'), (error as Error).message);
    }
    process.exit(1);
  }
}

void main();

export { program, createClient };
export default program;
