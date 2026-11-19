/**
 * Base command class for CLI commands
 * @module commands/base
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ErrorHandler } from '../core/errors.js';
import type { Config } from '../core/types.js';

/**
 * Common CLI options shared by all reaction commands.
 */
export interface CommonOptions {
  token?: string;
  output?: string;
  perPage?: string;
  page?: string;
  allPages?: boolean;
  verbose?: boolean;
}

/**
 * Resource-targeting options shared by list/create/delete commands.
 */
export interface ResourceOptions extends CommonOptions {
  owner?: string;
  repo?: string;
  org?: string;
  teamSlug?: string;
  issueNumber?: string;
  commentId?: string;
  releaseId?: string;
  discussionNumber?: string;
  commentNumber?: string;
  content?: string;
  resource?: string;
  reactionId?: string;
}

/**
 * Parsed pagination options derived from CLI flags.
 */
export interface ParsedPaginationOptions {
  perPage: number;
  page: number;
  autoPage: boolean;
}

/**
 * A reaction-like item the table renderer understands.
 */
interface ReactionItemLike {
  id?: number;
  user?: { login?: string } | null;
  content?: string;
  created_at?: string;
}

/**
 * A handler bound to {@link BaseCommand.action}. Receives commander's variadic
 * action arguments; the final argument is the parsed options/command object.
 */
// commander passes a dynamic variadic argument list to action handlers; the
// bound `this` is a concrete BaseCommand subclass, so it is left unconstrained.
type ActionHandler = (this: any, ...args: any[]) => Promise<void> | void;

export class BaseCommand {
  program: Command;

  constructor(name: string, description: string) {
    this.program = new Command(name);
    this.program.description(description);
  }

  /**
   * Add common options to the command
   */
  addCommonOptions(): this {
    this.program
      .option('-t, --token <token>', 'GitHub personal access token')
      .option('-o, --output <format>', 'Output format (json, table)', 'table')
      .option('--per-page <number>', 'Results per page (max 100)', '30')
      .option('--page <number>', 'Page number to fetch', '1')
      .option('--all-pages', 'Fetch all pages automatically')
      .option('-v, --verbose', 'Enable verbose output');

    return this;
  }

  /**
   * Handle command execution with error handling
   */
  action(handler: ActionHandler): Command {
    // commander invokes the action with a dynamic, variadic argument list
    this.program.action(async (...args: any[]) => {
      try {
        await handler.apply(this, args);
      } catch (error) {
        const handledError = ErrorHandler.handle(error);

        console.error(chalk.red(`Error: ${handledError.message}`));

        if (args[args.length - 1]?.opts?.()?.verbose) {
          console.error(chalk.gray(handledError.stack));
        }

        process.exit(1);
      }
    });

    return this.program;
  }

  /**
   * Format and display output
   */
  displayOutput(data: unknown, format = 'table'): void {
    if (format === 'json') {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Default table format for reactions
    if (Array.isArray(data)) {
      this.displayTable(data as ReactionItemLike[]);
    } else {
      this.displayTable([data as ReactionItemLike]);
    }
  }

  /**
   * Display data in table format
   */
  displayTable(data: ReactionItemLike[]): void {
    if (!data || data.length === 0) {
      console.log(chalk.yellow('No data found'));
      return;
    }

    // Simple table implementation for reactions
    const reactions = data.map((item) => ({
      ID: item.id,
      User: item.user?.login || 'N/A',
      Content: this.formatReactionEmoji(item.content ?? ''),
      'Created At': new Date(item.created_at ?? '').toLocaleString()
    }));

    console.table(reactions);
  }

  /**
   * Format reaction content with emoji
   */
  formatReactionEmoji(content: string): string {
    const emojiMap: Record<string, string> = {
      '+1': '👍 +1',
      '-1': '👎 -1',
      'laugh': '😄 laugh',
      'confused': '😕 confused',
      'heart': '❤️ heart',
      'hooray': '🎉 hooray',
      'rocket': '🚀 rocket',
      'eyes': '👀 eyes'
    };

    return emojiMap[content] || content;
  }

  /**
   * Parse pagination options from command line
   */
  parsePaginationOptions(options: CommonOptions): ParsedPaginationOptions {
    return {
      perPage: parseInt(options.perPage ?? '') || 30,
      page: parseInt(options.page ?? '') || 1,
      autoPage: Boolean(options.allPages)
    };
  }

  /**
   * Build configuration from command line options
   */
  buildConfig(options: CommonOptions): Config {
    const config: Config = {};

    if (options.token) {
      config.token = options.token;
    }

    if (options.verbose) {
      config.logging = { level: 'debug' };
    }

    return config;
  }
}
