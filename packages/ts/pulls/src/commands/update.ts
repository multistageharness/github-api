/**
 * Update pull request command
 */

import type PullRequestClient from '../lib/client.js';
import type { UpdateData, PullRequest } from '../lib/types.js';

/** Options for the update command. */
export interface UpdateOptions {
  number: number;
  title?: string;
  body?: string;
  base?: string;
  state?: string;
  [key: string]: unknown;
}

export default async function updateCommand(
  client: PullRequestClient,
  options: UpdateOptions
): Promise<PullRequest> {
  const data: UpdateData = {};

  if (options.title) data.title = options.title;
  if (options.body) data.body = options.body;
  if (options.base) data.base = options.base;
  if (options.state) data.state = options.state;

  if (Object.keys(data).length === 0) {
    throw new Error('No update fields provided');
  }

  const pr = await client.update(options.number, data);
  console.log(`✓ Pull request #${pr.number} updated`);

  return pr;
}
