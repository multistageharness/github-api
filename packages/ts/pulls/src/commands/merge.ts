/**
 * Merge pull request command
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import type PullRequestClient from '../lib/client.js';
import type { MergeOptions, MergeResult } from '../lib/types.js';

/** Options for the merge command. */
export interface MergeCommandOptions {
  number: number;
  method?: string;
  title?: string;
  message?: string;
  confirm?: boolean;
  [key: string]: unknown;
}

export default async function mergeCommand(
  client: PullRequestClient,
  options: MergeCommandOptions
): Promise<MergeResult | null> {
  // Get PR details first
  const pr = await client.get(options.number);

  if (pr.state !== 'open') {
    throw new Error(`Pull request #${pr.number} is not open (state: ${pr.state})`);
  }

  if (pr.mergeable === false) {
    throw new Error(`Pull request #${pr.number} cannot be merged (conflicts or checks failing)`);
  }

  // Confirm merge unless --confirm flag is set
  if (!options.confirm) {
    console.log(`\nAbout to merge PR #${pr.number}: ${pr.title}`);
    console.log(`  From: ${pr.head?.label}`);
    console.log(`  Into: ${pr.base?.label}`);
    console.log(`  Method: ${options.method || 'merge'}`);

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed with merge?',
        default: false
      }
    ]);

    if (!proceed) {
      console.log('Merge cancelled');
      return null;
    }
  }

  // Prepare merge options
  const mergeOptions: MergeOptions = {
    merge_method: options.method || 'merge'
  };

  if (options.title) mergeOptions.commit_title = options.title;
  if (options.message) mergeOptions.commit_message = options.message;

  // Perform merge
  const result = await client.merge(options.number, mergeOptions);

  console.log(chalk.green('✓'), `Pull request #${pr.number} merged successfully`);
  console.log(`  SHA: ${result.sha}`);
  console.log(`  Message: ${result.message}`);

  return result;
}
