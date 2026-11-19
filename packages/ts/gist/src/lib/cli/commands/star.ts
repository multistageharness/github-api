/**
 * @fileoverview `gist star` — star, unstar, or check a gist.
 * @module lib/cli/commands/star
 */

import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface StarFlags {
  remove?: boolean;
  check?: boolean;
}

/** Register `star`. */
export function createStarCommand(program: Command): void {
  program
    .command('star')
    .description('Star, unstar, or check a gist')
    .argument('<gistId>', 'Gist ID')
    .option('--remove', 'Unstar instead of star')
    .option('--check', 'Report the current star state without changing it')
    .action(async (gistId: string, flags: StarFlags) => {
      if (flags.check) {
        out().print({ id: gistId, starred: await api().stars.check(gistId) });
        return;
      }
      if (flags.remove) {
        await api().stars.remove(gistId);
        out().print({ id: gistId, starred: false });
        return;
      }
      await api().stars.add(gistId);
      out().print({ id: gistId, starred: true });
    });
}
