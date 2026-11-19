/**
 * Update issue command
 */

import ora from 'ora';
import { formatIssue, formatSuccess } from '../utils/format.js';
import type { IssueLike } from '../utils/format.js';
import type { IssuesClient } from '../lib/client.js';
import type { Command, CommandOptions } from './types.js';

/** Issue update payload built by this command. */
interface UpdateData {
  title?: string;
  body?: string;
  state?: string;
  labels?: string[];
  milestone?: number;
}

const command: Command = {
  async execute(client: IssuesClient, options: CommandOptions): Promise<void> {
    if (!options.number) {
      throw new Error('Issue number is required');
    }

    const updateData: UpdateData = {};

    // Build update data from options
    if (options.title) updateData.title = options.title;
    if (options.body) updateData.body = options.body;
    if (options.state) updateData.state = options.state;
    if (options.labels) {
      updateData.labels = options.labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l);
    }
    if (options.milestone) {
      updateData.milestone = parseInt(options.milestone);
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No update fields provided');
    }

    const spinner = ora(`Updating issue #${options.number}...`).start();

    try {
      const issue = (await client.update(options.number, updateData)) as IssueLike;
      spinner.succeed(formatSuccess(`Issue #${issue.number} updated`));
      console.log(formatIssue(issue, options.output || 'text'));
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }
};

export default command;
