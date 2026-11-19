/**
 * @fileoverview `gist commits` — list gist revisions, or summarize them.
 * @module lib/cli/commands/commits
 */

import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface CommitsFlags {
  stats?: boolean;
}

/** Register `commits`. */
export function createCommitsCommand(program: Command): void {
  program
    .command('commits')
    .description('List the revisions of a gist')
    .argument('<gistId>', 'Gist ID')
    .option('--stats', 'Summarize change statistics across all revisions')
    .action(async (gistId: string, flags: CommitsFlags) => {
      out().print(
        flags.stats ? await api().commits.getStats(gistId) : await api().commits.list(gistId)
      );
    });
}
