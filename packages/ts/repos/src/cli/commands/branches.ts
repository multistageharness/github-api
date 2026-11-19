/**
 * @fileoverview Branch command handlers for CLI
 * @module cli/commands/branches
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type { DisplayOptions } from './repositories.js';

// GitHub branch payloads are dynamically shaped; modeled loosely here.
type BranchLike = Record<string, any>;

/**
 * Display list of branches
 */
export async function displayBranchList(
  branches: BranchLike[],
  options: DisplayOptions = {}
): Promise<void> {
  if (options.json) {
    console.log(JSON.stringify(branches, null, 2));
    return;
  }

  if (branches.length === 0) {
    console.log(chalk.yellow('No branches found.'));
    return;
  }

  const table = new Table({
    head: ['Name', 'Protected', 'SHA', 'Commit Message'],
    colWidths: [25, 12, 12, 40],
    wordWrap: true
  });

  for (const branch of branches) {
    const isProtected = branch.protected ? chalk.green('✓') : chalk.dim('✗');
    const sha = branch.commit.sha.substring(0, 8);
    const message = branch.commit.commit.message.split('\n')[0];
    const shortMessage = message.length > 35 ? message.substring(0, 32) + '...' : message;

    table.push([branch.name, isProtected, chalk.dim(sha), shortMessage]);
  }

  console.log(table.toString());

  console.log();
  console.log(chalk.dim(`Total: ${branches.length} branches`));
  console.log(chalk.dim(`Protected: ${branches.filter((b) => b.protected).length}`));
}
