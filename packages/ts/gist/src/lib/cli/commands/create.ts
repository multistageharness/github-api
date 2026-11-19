/**
 * @fileoverview `gist create` — create a gist from local files.
 * @module lib/cli/commands/create
 */

import fs from 'node:fs';
import { basename } from 'node:path';
import type { Command } from 'commander';
import { api, out } from '../globals.js';

interface CreateFlags {
  description?: string;
  public?: boolean;
  file?: string[];
}

/** Register `create`. */
export function createCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Create a new gist from one or more local files')
    .option('-d, --description <description>', 'Gist description')
    .option('--public', 'Make the gist public')
    .option('-f, --file <path...>', 'File(s) to include')
    .action(async (flags: CreateFlags) => {
      const paths = flags.file ?? [];
      if (paths.length === 0) throw new Error('At least one --file is required');

      // The gist filename is the basename; the path is only how we read it.
      const files: Record<string, { content: string }> = {};
      for (const path of paths) {
        files[basename(path)] = { content: fs.readFileSync(path, 'utf8') };
      }

      const gist = await api().gists.create({
        ...(flags.description === undefined ? {} : { description: flags.description }),
        public: !!flags.public,
        files,
      });
      out().print(gist);
    });
}
