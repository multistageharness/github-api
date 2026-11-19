/**
 * Get pull request details command
 */

import type PullRequestClient from '../lib/client.js';
import type { PullRequest } from '../lib/types.js';

/** Options for the get command. */
export interface GetOptions {
  number: number;
  comments?: boolean;
  reviews?: boolean;
  commits?: boolean;
  files?: boolean;
  [key: string]: unknown;
}

export default async function getCommand(
  client: PullRequestClient,
  options: GetOptions
): Promise<PullRequest> {
  const pr = await client.get(options.number);

  // Add additional data if requested
  if (options.comments) {
    pr.comments_list = await client.listReviewComments(options.number);
  }

  if (options.reviews) {
    pr.reviews_list = await client.listReviews(options.number);
  }

  if (options.commits) {
    pr.commits_list = await client.listCommits(options.number);
  }

  if (options.files) {
    pr.files_list = await client.listFiles(options.number);
  }

  return pr;
}
