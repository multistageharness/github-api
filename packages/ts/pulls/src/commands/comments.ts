/**
 * Comments command for pull requests
 */

import type PullRequestClient from '../lib/client.js';
import type { ReviewComment } from '../lib/types.js';

/** Options for the comments command. */
export interface CommentsOptions {
  number: number;
  add?: string;
  list?: boolean;
  [key: string]: unknown;
}

export default async function commentsCommand(
  client: PullRequestClient,
  options: CommentsOptions
): Promise<ReviewComment | ReviewComment[]> {
  if (options.add) {
    // Add a comment (simplified - would need more details for line comments)
    const comment = await client.createReviewComment(options.number, {
      body: options.add,
      commit_id: 'HEAD', // Would need to get actual commit SHA
      path: '', // Would need file path for line comments
      position: 1
    });

    console.log(`✓ Comment added to PR #${options.number}`);
    return comment;
  }

  // List comments
  const comments = await client.listReviewComments(options.number);
  return comments;
}
