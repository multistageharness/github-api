/**
 * @fileoverview `gist comment` — list, add, or delete gist comments.
 * @module lib/cli/commands/comment
 */

import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface CommentFlags {
  list?: boolean;
  body?: string;
  delete?: string;
}

/** Register `comment`. */
export function createCommentCommand(program: Command): void {
  program
    .command('comment')
    .description('List, add, or delete comments on a gist')
    .argument('<gistId>', 'Gist ID')
    .option('--list', 'List comments')
    .option('-b, --body <body>', 'Comment body to post')
    .option('--delete <commentId>', 'Delete a comment by ID')
    .action(async (gistId: string, flags: CommentFlags) => {
      if (flags.delete) {
        await api().comments.delete(gistId, Number(flags.delete));
        out().print({ deleted: true, id: Number(flags.delete) });
        return;
      }
      if (flags.body) {
        out().print(await api().comments.create(gistId, { body: flags.body }));
        return;
      }
      out().print(await api().comments.list(gistId));
    });
}
