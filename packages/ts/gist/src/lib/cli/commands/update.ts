/**
 * @fileoverview `gist update` — edit an existing gist.
 * @module lib/cli/commands/update
 */

import fs from 'node:fs';
import { basename } from 'node:path';
import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface UpdateFlags {
  description?: string;
  file?: string[];
}

/** Register `update`. */
export function createUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update a gist')
    .argument('<gistId>', 'Gist ID')
    .option('-d, --description <description>', 'New description')
    .option('-f, --file <path...>', 'File(s) to add or replace')
    .action(async (gistId: string, flags: UpdateFlags) => {
      const files: Record<string, { content: string }> = {};
      for (const path of flags.file ?? []) {
        files[basename(path)] = { content: fs.readFileSync(path, 'utf8') };
      }

      const gist = await api().gists.update(gistId, {
        ...(flags.description === undefined ? {} : { description: flags.description }),
        ...(Object.keys(files).length > 0 ? { files } : {}),
      });
      out().print(gist);
    });
}
