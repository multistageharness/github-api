/**
 * Shared types for CLI command modules.
 */

import type { IssuesClient } from '../lib/client.js';

/**
 * Options bag passed to a command's `execute`. It merges config, global CLI
 * options, and command-specific flags, so it is intentionally permissive.
 */
export interface CommandOptions {
  number?: number;
  output?: string;
  json?: boolean;
  state?: string;
  sort?: string;
  direction?: string;
  limit?: number;
  labels?: string;
  assignee?: string;
  assignees?: string;
  creator?: string;
  milestone?: string;
  since?: string;
  all?: boolean;
  org?: string;
  action?: string;
  comments?: boolean;
  events?: boolean;
  timeline?: boolean;
  comment?: number;
  body?: string;
  title?: string;
  name?: string;
  color?: string;
  description?: string;
  due?: string;
  interactive?: boolean;
  [key: string]: unknown;
}

/** A CLI command module. */
export interface Command {
  execute(client: IssuesClient, options: CommandOptions): Promise<void>;
}
