/**
 * List issues command
 */

import ora from 'ora';
import { formatOutput, formatWarning } from '../utils/format.js';
import type { IssueLike } from '../utils/format.js';
import { collectAllPages } from '../utils/pagination.js';
import type { PageResponse } from '../utils/pagination.js';
import type { IssuesClient } from '../lib/client.js';
import type { Command, CommandOptions } from './types.js';

const command: Command = {
  async execute(client: IssuesClient, options: CommandOptions): Promise<void> {
    const spinner = ora('Fetching issues...').start();

    try {
      let issues: IssueLike[];

      // Prepare filter options
      const listOptions: Record<string, unknown> = {
        state: options.state || 'open',
        sort: options.sort || 'created',
        direction: options.direction || 'desc',
        per_page: options.limit || 30,
        page: 1
      };

      // Add optional filters
      if (options.labels) {
        listOptions['labels'] = options.labels;
      }
      if (options.assignee) {
        listOptions['assignee'] = options.assignee;
      }
      if (options.creator) {
        listOptions['creator'] = options.creator;
      }
      if (options.milestone) {
        listOptions['milestone'] = options.milestone;
      }
      if (options.since) {
        listOptions['since'] = options.since;
      }

      // Determine which list method to use
      if (options.org) {
        // List for organization
        if (options.all) {
          issues = await collectAllPages<IssueLike>(
            (opts) =>
              client.listForOrg(options.org as string, {
                ...opts,
                includePagination: true
              }) as Promise<PageResponse<IssueLike>>,
            listOptions,
            options.limit
          );
        } else {
          issues = (await client.listForOrg(options.org, listOptions)) as IssueLike[];
        }
      } else if (client.owner && client.repo) {
        // List for repository
        if (options.all) {
          issues = await collectAllPages<IssueLike>(
            (opts) =>
              client.listForRepo({
                ...opts,
                includePagination: true
              }) as Promise<PageResponse<IssueLike>>,
            listOptions,
            options.limit
          );
        } else {
          issues = (await client.listForRepo(listOptions)) as IssueLike[];
        }
      } else {
        // List for authenticated user
        if (options.all) {
          issues = await collectAllPages<IssueLike>(
            (opts) =>
              client.list({ ...opts, includePagination: true }) as Promise<PageResponse<IssueLike>>,
            listOptions,
            options.limit
          );
        } else {
          issues = (await client.list(listOptions)) as IssueLike[];
        }
      }

      spinner.succeed(`Found ${issues.length} issue${issues.length !== 1 ? 's' : ''}`);

      if (issues.length === 0) {
        console.log(formatWarning('No issues found matching the criteria'));
        return;
      }

      console.log(formatOutput(issues, options));

      // Show pagination info if not fetching all
      if (!options.all && issues.length === listOptions['per_page']) {
        console.log(formatWarning('\nMore results may be available. Use --all to fetch all pages.'));
      }
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }
};

export default command;
