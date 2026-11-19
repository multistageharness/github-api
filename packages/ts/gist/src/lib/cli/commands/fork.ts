/**
 * @fileoverview `gist fork` — fork a gist.
 * @module lib/cli/commands/fork
 */

import type { Command } from 'commander';
import { api, out } from '../globals.js';

/** Register `fork`. */
export function createForkCommand(program: Command): void {
  program
    .command('fork')
    .description('Fork a gist')
    .argument('<gistId>', 'Gist ID')
    .action(async (gistId: string) => {
      out().print(await api().forks.create(gistId));
    });
}
