/**
 * @fileoverview Formatting utilities for GitHub Users CLI output
 * @module formatting
 */

import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Shared options for the formatting helpers.
 */
export interface FormatOptions {
  json?: boolean;
  symbols?: boolean;
}

// GitHub API user/email/context payloads are dynamically shaped; modeled as open records at the display boundary.
type UserLike = Record<string, any>;
type EmailLike = Record<string, any>;
type ContextLike = Record<string, any>;

/**
 * Pagination info shape consumed by {@link formatPaginationInfo}.
 */
export interface PaginationDisplayInfo {
  totalCount?: number | null;
  hasNext?: boolean;
}

/**
 * Spinner configuration returned by {@link createSpinner}.
 */
export interface SpinnerConfig {
  text: string;
  color: string;
  spinner: string;
}

const TABLE_CHARS = {
  top: '═',
  'top-mid': '╤',
  'top-left': '╔',
  'top-right': '╗',
  bottom: '═',
  'bottom-mid': '╧',
  'bottom-left': '╚',
  'bottom-right': '╝',
  left: '║',
  'left-mid': '╟',
  mid: '─',
  'mid-mid': '┼',
  right: '║',
  'right-mid': '╢',
  middle: '│'
};

/**
 * Format user information for display
 */
export function formatUser(user: UserLike, options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(user, null, 2);
  }

  const output: string[] = [];

  // Header with username
  output.push(chalk.bold.blue(`👤 ${user.login}${user.name ? ` (${user.name})` : ''}`));

  if (user.bio) {
    output.push(chalk.italic(user.bio));
  }

  // Basic info
  const info: string[] = [];
  if (user.company) info.push(`🏢 ${user.company}`);
  if (user.location) info.push(`📍 ${user.location}`);
  if (user.blog) info.push(`🔗 ${user.blog}`);
  if (user.twitter_username) info.push(`🐦 @${user.twitter_username}`);

  if (info.length > 0) {
    output.push('');
    output.push(...info);
  }

  // Stats (if available)
  if (user.public_repos !== undefined || user.followers !== undefined) {
    output.push('');
    const stats: string[] = [];
    if (user.public_repos !== undefined) stats.push(`📚 ${user.public_repos} repos`);
    if (user.public_gists !== undefined) stats.push(`📝 ${user.public_gists} gists`);
    if (user.followers !== undefined) stats.push(`👥 ${user.followers} followers`);
    if (user.following !== undefined) stats.push(`👤 ${user.following} following`);
    output.push(stats.join('  '));
  }

  // URLs
  output.push('');
  output.push(`GitHub: ${chalk.cyan(user.html_url)}`);
  output.push(`API: ${chalk.gray(user.url)}`);

  // Account info
  if (user.created_at) {
    output.push(`Created: ${formatDate(user.created_at)}`);
  }

  if (user.updated_at) {
    output.push(`Updated: ${formatDate(user.updated_at)}`);
  }

  return output.join('\n');
}

/**
 * Format user list as table
 */
export function formatUserTable(users: UserLike[], options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(users, null, 2);
  }

  if (!Array.isArray(users) || users.length === 0) {
    return chalk.yellow('No users found.');
  }

  const table = new Table({
    head: ['Username', 'Name', 'Type', 'ID'].map((h) => chalk.bold(h)),
    chars: TABLE_CHARS
  });

  users.forEach((user) => {
    table.push([
      chalk.cyan(user.login),
      user.name || chalk.gray('N/A'),
      user.type === 'User' ? '👤 User' : '🏢 Org',
      chalk.gray(user.id)
    ]);
  });

  return table.toString();
}

/**
 * Format email addresses
 */
export function formatEmails(emails: EmailLike[], options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(emails, null, 2);
  }

  if (!Array.isArray(emails) || emails.length === 0) {
    return chalk.yellow('No email addresses found.');
  }

  const table = new Table({
    head: ['Email', 'Primary', 'Verified', 'Visibility'].map((h) => chalk.bold(h)),
    chars: TABLE_CHARS
  });

  emails.forEach((email) => {
    table.push([
      email.email,
      email.primary ? chalk.green('✓') : chalk.gray('○'),
      email.verified ? chalk.green('✓') : chalk.red('✗'),
      email.visibility || chalk.gray('N/A')
    ]);
  });

  return table.toString();
}

/**
 * Format user context/hovercard information
 */
export function formatUserContext(context: ContextLike, options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(context, null, 2);
  }

  const output: string[] = [];

  // Contexts array
  if (context.contexts && context.contexts.length > 0) {
    output.push(chalk.bold('User Context:'));

    context.contexts.forEach((ctx: ContextLike) => {
      output.push(`\n${chalk.cyan(ctx.message)}`);
      if (ctx.octicon) {
        output.push(`Icon: ${ctx.octicon}`);
      }
    });
  } else {
    output.push(chalk.yellow('No context information available.'));
  }

  return output.join('\n');
}

/**
 * Format date for display
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  }
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format boolean value with colors
 */
export function formatBoolean(value: boolean, options: FormatOptions = {}): string {
  if (value === true) {
    return options.symbols ? chalk.green('✓') : chalk.green('true');
  } else if (value === false) {
    return options.symbols ? chalk.red('✗') : chalk.red('false');
  }
  return chalk.gray('N/A');
}

/**
 * Format loading spinner message
 */
export function createSpinner(message: string): SpinnerConfig {
  return {
    text: message,
    color: 'cyan',
    spinner: 'dots'
  };
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return chalk.green(`✓ ${message}`);
}

/**
 * Format error message
 */
export function formatError(error: string | Error): string {
  const message = typeof error === 'string' ? error : error.message;
  return chalk.red(`✗ ${message}`);
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return chalk.blue(`ℹ ${message}`);
}

/**
 * Format pagination info
 */
export function formatPaginationInfo(pagination: PaginationDisplayInfo | null | undefined): string {
  if (!pagination) return '';

  const parts: string[] = [];

  if (pagination.totalCount) {
    parts.push(`Total: ${pagination.totalCount}`);
  }

  if (pagination.hasNext) {
    parts.push(chalk.cyan('Has more pages'));
  }

  if (parts.length === 0) return '';

  return chalk.gray(`(${parts.join(', ')})`);
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength = 50): string {
  if (!text || typeof text !== 'string') return '';

  if (text.length <= maxLength) return text;

  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create a formatted header
 */
export function createHeader(title: string, subtitle = ''): string {
  const output: string[] = [];
  output.push(chalk.bold.magenta(title));

  if (subtitle) {
    output.push(chalk.gray(subtitle));
  }

  output.push(''); // Empty line
  return output.join('\n');
}
