/**
 * Search pull requests command
 */

import type PullRequestClient from '../lib/client.js';
import type { PullRequest } from '../lib/types.js';

/** Options for the search command. */
export interface SearchCommandOptions {
  query: string;
  repo?: string;
  author?: string;
  assignee?: string;
  label?: string;
  sort?: string;
  order?: string;
  limit?: number;
  [key: string]: unknown;
}

export default async function searchCommand(
  client: PullRequestClient,
  options: SearchCommandOptions
): Promise<PullRequest[]> {
  // Build search query
  let query = options.query;

  // Add repository qualifier if specified
  if (options.repo || (client.owner && client.repo)) {
    const repo = options.repo || `${client.owner}/${client.repo}`;
    query += ` repo:${repo}`;
  }

  // Add type qualifier (pull requests only)
  query += ' type:pr';

  // Add other qualifiers
  if (options.author) query += ` author:${options.author}`;
  if (options.assignee) query += ` assignee:${options.assignee}`;
  if (options.label) query += ` label:"${options.label}"`;

  const searchOptions = {
    sort: options.sort || 'created',
    order: options.order || 'desc',
    per_page: options.limit || 30
  };

  const results = await client.search(query, searchOptions);

  console.log(`Found ${results.total_count} pull requests`);

  // Return just the items for formatting
  return results.items;
}
