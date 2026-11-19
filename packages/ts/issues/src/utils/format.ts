/**
 * Formatting utilities for GitHub Issues CLI
 */

import chalk from 'chalk';
import { table } from 'table';

/** A GitHub user reference as accessed by the formatters. */
export interface UserRef {
  login?: string;
  name?: string;
  [key: string]: unknown;
}

/** A label as accessed by the formatters (object or bare name handled separately). */
export interface LabelObject {
  name: string;
  color?: string;
  [key: string]: unknown;
}

/** An issue shape as accessed by the formatters. */
export interface IssueLike {
  number: number;
  title: string;
  state: string;
  user?: UserRef;
  created_at: string;
  updated_at?: string;
  assignees?: UserRef[];
  labels?: LabelObject[];
  milestone?: MilestoneLike;
  body?: string;
  comments: number;
  html_url?: string;
  [key: string]: unknown;
}

/** A comment shape as accessed by the formatters. */
export interface CommentLike {
  user?: UserRef;
  created_at: string;
  updated_at?: string;
  body?: string;
  [key: string]: unknown;
}

/** A milestone shape as accessed by the formatters. */
export interface MilestoneLike {
  title: string;
  description?: string;
  closed_issues: number;
  open_issues: number;
  due_on?: string;
  [key: string]: unknown;
}

/** Options accepted by formatOutput. */
export interface FormatOutputOptions {
  output?: string;
  json?: boolean;
  [key: string]: unknown;
}

/**
 * Format issue for display
 */
export function formatIssue(issue: IssueLike, format = 'text'): string {
  switch (format) {
    case 'json':
      return JSON.stringify(issue, null, 2);

    case 'table':
      return formatIssueTable([issue]);

    case 'text':
    default:
      return formatIssueText(issue);
  }
}

/**
 * Format issue as text
 */
export function formatIssueText(issue: IssueLike): string {
  const parts: string[] = [];

  parts.push(chalk.bold.green(`#${issue.number}`) + ' ' + chalk.bold(issue.title));
  parts.push(chalk.gray(`State: ${getStateIcon(issue.state)} ${issue.state}`));
  parts.push(chalk.gray(`Author: @${issue.user?.login || 'unknown'}`));
  parts.push(chalk.gray(`Created: ${formatDate(issue.created_at)}`));

  if (issue.assignees && issue.assignees.length > 0) {
    parts.push(chalk.gray(`Assignees: ${issue.assignees.map((a) => '@' + a.login).join(', ')}`));
  }

  if (issue.labels && issue.labels.length > 0) {
    parts.push(chalk.gray(`Labels: ${issue.labels.map((l) => formatLabel(l)).join(' ')}`));
  }

  if (issue.milestone) {
    parts.push(chalk.gray(`Milestone: ${issue.milestone.title}`));
  }

  if (issue.body) {
    parts.push('');
    parts.push(issue.body);
  }

  parts.push('');
  parts.push(chalk.gray(`${issue.comments} comments`));
  parts.push(chalk.blue.underline(issue.html_url ?? ''));

  return parts.join('\n');
}

/**
 * Format issues as table
 */
export function formatIssueTable(issues: IssueLike[]): string {
  const data: string[][] = [['#', 'Title', 'State', 'Author', 'Labels', 'Comments', 'Updated']];

  for (const issue of issues) {
    data.push([
      chalk.green(`#${issue.number}`),
      truncate(issue.title, 50),
      getStateIcon(issue.state) + ' ' + issue.state,
      '@' + (issue.user?.login || 'unknown'),
      (issue.labels || []).map((l) => l.name).join(', ') || '-',
      issue.comments.toString(),
      formatDate(issue.updated_at, true)
    ]);
  }

  return table(data, {
    border: {
      topBody: '─',
      topJoin: '┬',
      topLeft: '┌',
      topRight: '┐',
      bottomBody: '─',
      bottomJoin: '┴',
      bottomLeft: '└',
      bottomRight: '┘',
      bodyLeft: '│',
      bodyRight: '│',
      bodyJoin: '│',
      joinBody: '─',
      joinLeft: '├',
      joinRight: '┤',
      joinJoin: '┼'
    }
  });
}

/**
 * Format issue comment
 */
export function formatComment(comment: CommentLike): string {
  const parts: string[] = [];

  parts.push(
    chalk.bold(`@${comment.user?.login || 'unknown'}`) + ' ' + chalk.gray(formatDate(comment.created_at))
  );

  if (comment.updated_at !== comment.created_at) {
    parts.push(chalk.gray(`(edited ${formatDate(comment.updated_at)})`));
  }

  parts.push('');
  parts.push(comment.body ?? '');

  return parts.join('\n');
}

/**
 * Format label with color
 */
export function formatLabel(label: LabelObject | string): string {
  if (typeof label === 'string') {
    return chalk.bgGray.white(` ${label} `);
  }

  const color = label.color ? `#${label.color}` : '#cccccc';
  return chalk.bgHex(color).white(` ${label.name} `);
}

/**
 * Format milestone
 */
export function formatMilestone(milestone: MilestoneLike): string {
  const parts: string[] = [];

  parts.push(chalk.bold(milestone.title));

  if (milestone.description) {
    parts.push(chalk.gray(milestone.description));
  }

  const progress = (milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100;
  parts.push(
    chalk.gray(
      `Progress: ${milestone.closed_issues}/${milestone.open_issues + milestone.closed_issues} (${progress.toFixed(0)}%)`
    )
  );

  if (milestone.due_on) {
    parts.push(chalk.gray(`Due: ${formatDate(milestone.due_on)}`));
  }

  return parts.join('\n');
}

/**
 * Error shape as accessed by formatError.
 */
export interface FormatErrorLike {
  message: string;
  name?: string;
  errors?: Array<{ message?: string; code?: string } | string>;
  minutesUntilReset?: number;
}

/**
 * Format error for display
 */
export function formatError(error: FormatErrorLike): string {
  let message = chalk.red.bold('Error: ') + error.message;

  if (error.name === 'ValidationError' && error.errors) {
    message += '\n' + chalk.yellow('Validation errors:');
    for (const err of error.errors) {
      if (typeof err === 'string') {
        message += '\n  - ' + err;
      } else {
        message += '\n  - ' + (err.message || err.code || err);
      }
    }
  }

  if (error.name === 'RateLimitError' && error.minutesUntilReset) {
    message += '\n' + chalk.yellow(`Rate limit resets in ${error.minutesUntilReset} minutes`);
  }

  return message;
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return chalk.green('✓ ') + message;
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return chalk.yellow('⚠ ') + message;
}

/**
 * Format date
 */
export function formatDate(dateStr: string | null | undefined, relative = false): string {
  if (!dateStr) return '-';

  const date = new Date(dateStr);

  if (relative) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 30) return date.toLocaleDateString();
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  return date.toLocaleString();
}

/**
 * Get state icon
 */
export function getStateIcon(state: string): string {
  switch (state) {
    case 'open':
      return chalk.green('●');
    case 'closed':
      return chalk.red('✓');
    default:
      return chalk.gray('○');
  }
}

/**
 * Truncate string
 */
export function truncate(str: string | null | undefined, length: number): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
}

/**
 * Format output based on options
 */
// Data is dynamically an issue, an array of issues, or arbitrary search results.
export function formatOutput(data: unknown, options: FormatOutputOptions = {}): string {
  if (options.output === 'json' || options.json) {
    return JSON.stringify(data, null, 2);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return chalk.gray('No results found');
    }

    if (options.output === 'table') {
      return formatIssueTable(data as IssueLike[]);
    }

    return (data as IssueLike[]).map((item) => formatIssue(item, options.output || 'text')).join('\n\n');
  }

  return formatIssue(data as IssueLike, options.output || 'text');
}
