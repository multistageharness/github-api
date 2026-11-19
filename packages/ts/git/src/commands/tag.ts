/**
 * @fileoverview Tag commands for the GitHub Git CLI
 * @module commands/tag
 */

import type { Command } from 'commander';
import { formatOutput } from '../utils/format.js';
import type { GitHubClient, GitPerson } from '../lib/client.js';

/** Options parsed for the `tag create` command. */
interface TagCreateOptions {
  owner: string;
  repo: string;
  tag: string;
  message: string;
  object: string;
  type: string;
  taggerName?: string;
  taggerEmail?: string;
  taggerDate?: string;
  json?: boolean;
}

/** Options parsed for the `tag get` command. */
interface TagGetOptions {
  owner: string;
  repo: string;
  sha: string;
  json?: boolean;
}

export class TagCommands {
  client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  register(program: Command): void {
    program
      .command('create')
      .description('Create a new tag object')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('-t, --tag <tag>', 'Tag name (e.g., v1.0.0)')
      .requiredOption('-m, --message <message>', 'Tag message')
      .requiredOption('--object <object>', 'SHA of the git object this is tagging')
      .option('--type <type>', 'Object type (commit, tree, or blob)', 'commit')
      .option('--tagger-name <name>', 'Tagger name')
      .option('--tagger-email <email>', 'Tagger email')
      .option('--tagger-date <date>', 'Tagger date (ISO 8601)')
      .option('--json', 'Output as JSON')
      .action(async (options: TagCreateOptions) => {
        try {
          let tagger: GitPerson | null = null;

          if (options.taggerName || options.taggerEmail) {
            tagger = {
              name: options.taggerName,
              email: options.taggerEmail,
              date: options.taggerDate || new Date().toISOString()
            };
          }

          const result = await this.client.createTag(
            options.owner,
            options.repo,
            options.tag,
            options.message,
            options.object,
            options.type,
            tagger
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error creating tag:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('get')
      .description('Get a tag')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('-s, --sha <sha>', 'Tag SHA')
      .option('--json', 'Output as JSON')
      .action(async (options: TagGetOptions) => {
        try {
          const result = await this.client.getTag(
            options.owner,
            options.repo,
            options.sha
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error getting tag:', (error as Error).message);
          process.exit(1);
        }
      });
  }
}
