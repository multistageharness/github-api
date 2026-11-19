/**
 * @fileoverview `gist get` — fetch a single gist.
 * @module lib/cli/commands/get
 */

import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface GetFlags {
  raw?: boolean;
  base64?: boolean;
}

/** Register `get`. */
export function createGetCommand(program: Command): void {
  program
    .command('get')
    .description('Get a gist by ID')
    .argument('<gistId>', 'Gist ID')
    .option('--raw', 'Request raw file content')
    .option('--base64', 'Request base64 file content')
    .action(async (gistId: string, flags: GetFlags) => {
      out().print(await api().gists.get(gistId, flags));
    });
}
