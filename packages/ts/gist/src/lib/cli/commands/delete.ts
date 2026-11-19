/**
 * @fileoverview `gist delete` — remove a gist.
 * @module lib/cli/commands/delete
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import { api, out } from '../globals.js';

interface DeleteFlags {
  force?: boolean;
}

/** Register `delete` (alias `rm`). */
export function createDeleteCommand(program: Command): void {
  program
    .command('delete')
    .alias('rm')
    .description('Delete a gist')
    .argument('<gistId>', 'Gist ID')
    .option('--force', 'Skip the confirmation prompt')
    .action(async (gistId: string, flags: DeleteFlags) => {
      if (!flags.force) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Delete gist ${gistId}? This cannot be undone.`,
            default: false,
          },
        ]);
        if (!answers['confirmed']) return;
      }

      await api().gists.delete(gistId);
      out().print({ deleted: true, id: gistId });
    });
}
