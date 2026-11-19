/**
 * @fileoverview Reference commands for the GitHub Git CLI
 * @module commands/ref
 */

import type { Command } from 'commander';
import { formatOutput } from '../utils/format.js';
import type { GitHubClient } from '../lib/client.js';

/** Options parsed for the `ref create` command. */
interface RefCreateOptions {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  json?: boolean;
}

/** Options parsed for the `ref get` / `ref list` commands. */
interface RefGetOptions {
  owner: string;
  repo: string;
  ref: string;
  json?: boolean;
}

/** Options parsed for the `ref update` command. */
interface RefUpdateOptions {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  force?: boolean;
  json?: boolean;
}

/** Options parsed for the `ref delete` command. */
interface RefDeleteOptions {
  owner: string;
  repo: string;
  ref: string;
  json?: boolean;
}

export class RefCommands {
  client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  register(program: Command): void {
    program
      .command('create')
      .description('Create a new reference')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('--ref <ref>', 'Reference name (e.g., refs/heads/feature)')
      .requiredOption('-s, --sha <sha>', 'SHA1 value for this reference')
      .option('--json', 'Output as JSON')
      .action(async (options: RefCreateOptions) => {
        try {
          const result = await this.client.createRef(
            options.owner,
            options.repo,
            options.ref,
            options.sha
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error creating reference:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('get')
      .description('Get a reference')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('--ref <ref>', 'Reference name (e.g., heads/main)')
      .option('--json', 'Output as JSON')
      .action(async (options: RefGetOptions) => {
        try {
          const result = await this.client.getRef(
            options.owner,
            options.repo,
            options.ref
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error getting reference:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('list')
      .description('List matching references')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('--ref <ref>', 'Reference pattern to match')
      .option('--json', 'Output as JSON')
      .action(async (options: RefGetOptions) => {
        try {
          const result = await this.client.listMatchingRefs(
            options.owner,
            options.repo,
            options.ref
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error listing references:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('update')
      .description('Update a reference')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('--ref <ref>', 'Reference name (e.g., heads/main)')
      .requiredOption('-s, --sha <sha>', 'New SHA1 value')
      .option('-f, --force', 'Force update (non-fast-forward)')
      .option('--json', 'Output as JSON')
      .action(async (options: RefUpdateOptions) => {
        try {
          const result = await this.client.updateRef(
            options.owner,
            options.repo,
            options.ref,
            options.sha,
            options.force
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error updating reference:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('delete')
      .description('Delete a reference')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('--ref <ref>', 'Reference name (e.g., heads/feature)')
      .option('--json', 'Output as JSON')
      .action(async (options: RefDeleteOptions) => {
        try {
          const result = await this.client.deleteRef(
            options.owner,
            options.repo,
            options.ref
          );

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('Reference deleted successfully');
          }
        } catch (error) {
          console.error('Error deleting reference:', (error as Error).message);
          process.exit(1);
        }
      });
  }
}
