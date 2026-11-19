/**
 * @fileoverview `gist list` — list gists.
 * @module lib/cli/commands/list
 */

import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface ListFlags {
  public?: boolean;
  starred?: boolean;
  user?: string;
  perPage: string;
  page: string;
}

/** Register `list` (alias `ls`). */
export function createListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List gists')
    .option('--public', 'List all public gists')
    .option('--starred', 'List your starred gists')
    .option('--user <username>', 'List public gists for a user')
    .option('--per-page <n>', 'Results per page', '30')
    .option('--page <n>', 'Page number', '1')
    .action(async (flags: ListFlags) => {
      const options = { per_page: Number(flags.perPage), page: Number(flags.page) };
      const gists = flags.starred
        ? await api().gists.listStarred(options)
        : flags.public
          ? await api().gists.listPublic(options)
          : flags.user
            ? await api().gists.listForUser(flags.user, options)
            : await api().gists.list(options);
      out().print(gists);
    });
}
