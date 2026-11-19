/**
 * Files command - show changed files in a pull request
 */

import chalk from 'chalk';
import { formatFileChanges } from '../utils/format.js';
import type PullRequestClient from '../lib/client.js';
import type { PullRequestFile } from '../lib/types.js';

/** Options for the files command. */
export interface FilesOptions {
  number: number;
  namesOnly?: boolean;
  stats?: boolean;
  [key: string]: unknown;
}

/** Aggregated file statistics returned with --stats. */
export interface FileStats {
  total_files: number;
  additions: number;
  deletions: number;
  files: Array<{
    filename: string;
    status?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
  }>;
}

export default async function filesCommand(
  client: PullRequestClient,
  options: FilesOptions
): Promise<string[] | FileStats | PullRequestFile[]> {
  const files = await client.listFiles(options.number);

  if (options.namesOnly) {
    // Just return file names
    return files.map((f) => f.filename);
  }

  if (options.stats) {
    // Return with statistics
    const stats: FileStats = {
      total_files: files.length,
      additions: files.reduce((sum, f) => sum + (f.additions || 0), 0),
      deletions: files.reduce((sum, f) => sum + (f.deletions || 0), 0),
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes
      }))
    };

    console.log(chalk.bold(`\nFiles changed: ${stats.total_files}`));
    console.log(chalk.green(`+${stats.additions} additions`));
    console.log(chalk.red(`-${stats.deletions} deletions`));
    console.log('');

    return stats;
  }

  // Default: formatted file list
  console.log(formatFileChanges(files, { showChanges: true }));
  return files;
}
