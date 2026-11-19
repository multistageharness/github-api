/**
 * @fileoverview Tree commands for the GitHub Git CLI
 * @module commands/tree
 */

import type { Command } from 'commander';
import { formatOutput } from '../utils/format.js';
import type { GitHubClient, GitTreeEntry } from '../lib/client.js';

/** Options parsed for the `tree create` command. */
interface TreeCreateOptions {
  owner: string;
  repo: string;
  tree: string;
  baseTree?: string;
  json?: boolean;
}

/** Options parsed for the `tree get` command. */
interface TreeGetOptions {
  owner: string;
  repo: string;
  sha: string;
  recursive?: boolean;
  json?: boolean;
}

/** Shape of a tree-get result, narrowed for pretty-printing. */
interface TreeResult {
  sha: string;
  truncated: boolean;
  tree: Array<{ mode: string; type: string; sha: string; path: string }>;
}

export class TreeCommands {
  client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  register(program: Command): void {
    program
      .command('create')
      .description('Create a new tree')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('-t, --tree <tree>', 'Tree entries as JSON string')
      .option('-b, --base-tree <baseTree>', 'Base tree SHA')
      .option('--json', 'Output as JSON')
      .action(async (options: TreeCreateOptions) => {
        try {
          let tree: GitTreeEntry[];
          try {
            tree = JSON.parse(options.tree) as GitTreeEntry[];
          } catch (e) {
            throw new Error('Invalid tree JSON: ' + (e as Error).message);
          }

          const result = await this.client.createTree(
            options.owner,
            options.repo,
            tree,
            options.baseTree
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error creating tree:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('get')
      .description('Get a tree')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('-s, --sha <sha>', 'Tree SHA')
      .option('--recursive', 'Get tree recursively')
      .option('--json', 'Output as JSON')
      .action(async (options: TreeGetOptions) => {
        try {
          const result = await this.client.getTree(
            options.owner,
            options.repo,
            options.sha,
            options.recursive
          );

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const tree = result as TreeResult;
            console.log(`Tree SHA: ${tree.sha}`);
            console.log(`Truncated: ${tree.truncated}`);
            console.log(`\nTree entries (${tree.tree.length}):`);
            tree.tree.forEach((entry) => {
              console.log(
                `  ${entry.mode} ${entry.type.padEnd(6)} ${entry.sha.substring(0, 7)}  ${entry.path}`
              );
            });
          }
        } catch (error) {
          console.error('Error getting tree:', (error as Error).message);
          process.exit(1);
        }
      });
  }
}
