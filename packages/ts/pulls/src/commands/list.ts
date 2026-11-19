/**
 * List pull requests command
 */

import { collectAllPages } from '../utils/pagination.js';
import type PullRequestClient from '../lib/client.js';
import type { ListOptions, PullRequest } from '../lib/types.js';

/** Options for the list command. */
export interface ListCommandOptions {
  state?: string;
  base?: string;
  head?: string;
  sort?: string;
  direction?: string;
  limit?: number;
  all?: boolean;
  [key: string]: unknown;
}

export default async function listCommand(
  client: PullRequestClient,
  options: ListCommandOptions
): Promise<PullRequest[]> {
  const listOptions: ListOptions = {
    state: options.state || 'open',
    base: options.base,
    head: options.head,
    sort: options.sort || 'created',
    direction: options.direction || 'desc',
    per_page: options.limit || 30
  };

  // If fetching all pages
  if (options.all) {
    return await collectAllPages<PullRequest>(
      (page) => client.list({ ...listOptions, page }),
      { maxPages: options.limit ? Math.ceil(options.limit / 30) : Infinity }
    );
  }

  // Single page fetch
  return await client.list(listOptions);
}
