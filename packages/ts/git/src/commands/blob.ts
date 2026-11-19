/**
 * @fileoverview Blob commands for the GitHub Git CLI
 * @module commands/blob
 */

import fs from 'fs/promises';
import type { Command } from 'commander';
import { formatOutput } from '../utils/format.js';
import type { GitHubClient } from '../lib/client.js';

/** Options parsed for the `blob create` command. */
interface BlobCreateOptions {
  owner: string;
  repo: string;
  content?: string;
  file?: string;
  encoding: string;
  json?: boolean;
}

/** Options parsed for the `blob get` command. */
interface BlobGetOptions {
  owner: string;
  repo: string;
  sha: string;
  save?: string;
  json?: boolean;
}

export class BlobCommands {
  client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  register(program: Command): void {
    program
      .command('create')
      .description('Create a new blob')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .option('-c, --content <content>', 'Blob content')
      .option('-f, --file <file>', 'Read content from file')
      .option('-e, --encoding <encoding>', 'Content encoding (utf-8 or base64)', 'utf-8')
      .option('--json', 'Output as JSON')
      .action(async (options: BlobCreateOptions) => {
        try {
          let content = options.content;

          if (options.file) {
            const buffer = await fs.readFile(options.file);
            if (options.encoding === 'base64') {
              content = buffer.toString('base64');
            } else {
              content = buffer.toString('utf-8');
            }
          }

          if (!content) {
            throw new Error('Either --content or --file must be provided');
          }

          const result = await this.client.createBlob(
            options.owner,
            options.repo,
            content,
            options.encoding
          );

          formatOutput(result, options.json);
        } catch (error) {
          console.error('Error creating blob:', (error as Error).message);
          process.exit(1);
        }
      });

    program
      .command('get')
      .description('Get a blob')
      .requiredOption('-o, --owner <owner>', 'Repository owner')
      .requiredOption('-r, --repo <repo>', 'Repository name')
      .requiredOption('-s, --sha <sha>', 'Blob SHA')
      .option('--save <file>', 'Save content to file')
      .option('--json', 'Output as JSON')
      .action(async (options: BlobGetOptions) => {
        try {
          const result = await this.client.getBlob(
            options.owner,
            options.repo,
            options.sha
          );

          if (options.save) {
            const blob = result as { content: string; encoding?: string };
            let content: string | Buffer = blob.content;
            if (blob.encoding === 'base64') {
              content = Buffer.from(blob.content, 'base64');
            }
            await fs.writeFile(options.save, content);
            console.log(`Blob saved to ${options.save}`);
          } else {
            formatOutput(result, options.json);
          }
        } catch (error) {
          console.error('Error getting blob:', (error as Error).message);
          process.exit(1);
        }
      });
  }
}
