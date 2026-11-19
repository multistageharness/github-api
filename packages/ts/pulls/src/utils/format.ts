import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Format utilities for CLI output
 */

/** A pull request label as returned by the GitHub API (used subset). */
export interface PullRequestLabel {
  name: string;
  color: string;
}

/**
 * Loosely-typed pull request shape used for formatting. GitHub returns a much
 * larger object; only the fields the formatters read are modeled, with an index
 * signature for the rest.
 */
export interface FormattablePullRequest {
  number?: number;
  title?: string;
  state?: string;
  user?: { login?: string } | null;
  created_at?: string;
  updated_at?: string;
  labels?: PullRequestLabel[];
  comments?: number;
  review_comments?: number;
  additions?: number;
  deletions?: number;
  [key: string]: unknown;
}

/** A changed file entry used by formatFileChanges. */
export interface FormattableFile {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  [key: string]: unknown;
}

/** Options accepted by the pull-request formatters. */
export interface FormatOptions {
  showCounts?: boolean;
  showChanges?: boolean;
  colorize?: boolean;
  pretty?: boolean;
  // cli-table3 constructor options passed through verbatim.
  tableOptions?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Format date string
 */
export function formatDate(dateString: string | null | undefined, relative = false): string {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);

  if (relative) {
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  return date.toLocaleDateString();
}

/**
 * Format pull request state with color
 */
export function formatState(state: string | null | undefined, colorize = true): string {
  if (!colorize) return state ?? '';

  switch (state?.toLowerCase()) {
    case 'open':
      return chalk.green(state as string);
    case 'closed':
      return chalk.red(state as string);
    case 'merged':
      return chalk.magenta(state as string);
    case 'draft':
      return chalk.gray(state as string);
    default:
      return state ?? '';
  }
}

/**
 * Format pull request for display
 */
export function formatPullRequest(pr: FormattablePullRequest, options: FormatOptions = {}): string {
  const parts: string[] = [];

  // Number and title
  parts.push(chalk.bold(`#${pr.number}`) + ` ${pr.title}`);

  // State and author
  parts.push(`  ${formatState(pr.state)} by @${pr.user?.login || 'unknown'}`);

  // Dates
  if (pr.created_at) {
    parts.push(`  Created: ${formatDate(pr.created_at, true)}`);
  }

  if (pr.updated_at && pr.updated_at !== pr.created_at) {
    parts.push(`  Updated: ${formatDate(pr.updated_at, true)}`);
  }

  // Labels
  if (pr.labels && pr.labels.length > 0) {
    const labels = pr.labels.map((l) => chalk.hex(l.color)(`[${l.name}]`)).join(' ');
    parts.push(`  Labels: ${labels}`);
  }

  // Reviews and comments
  if (options.showCounts) {
    const counts: string[] = [];
    if (pr.comments && pr.comments > 0) counts.push(`${pr.comments} comments`);
    if (pr.review_comments && pr.review_comments > 0)
      counts.push(`${pr.review_comments} review comments`);
    if (counts.length > 0) {
      parts.push(`  ${counts.join(', ')}`);
    }
  }

  // Changes
  if (options.showChanges && (pr.additions || pr.deletions)) {
    parts.push(`  Changes: ${chalk.green(`+${pr.additions || 0}`)} ${chalk.red(`-${pr.deletions || 0}`)}`);
  }

  return parts.join('\n');
}

/**
 * Format pull request as table row
 */
export function formatPullRequestRow(
  pr: FormattablePullRequest
): Array<string | number | undefined> {
  const title = pr.title ?? '';
  return [
    pr.number,
    title.length > 50 ? title.substring(0, 47) + '...' : title,
    formatState(pr.state, true),
    pr.user?.login || 'unknown',
    formatDate(pr.created_at, true)
  ];
}

/**
 * Create table for pull requests
 */
export function createPullRequestTable(
  pullRequests: FormattablePullRequest[],
  options: FormatOptions = {}
): string {
  const table = new Table({
    head: ['#', 'Title', 'State', 'Author', 'Created'],
    style: {
      head: ['cyan']
    },
    ...options.tableOptions
  });

  for (const pr of pullRequests) {
    // cli-table3 rows accept mixed primitive cells.
    table.push(formatPullRequestRow(pr) as unknown as string[]);
  }

  return table.toString();
}

/**
 * Format review state
 */
export function formatReviewState(state: string | null | undefined, colorize = true): string {
  if (!colorize) return state ?? '';

  switch (state) {
    case 'APPROVED':
      return chalk.green('✓ Approved');
    case 'CHANGES_REQUESTED':
      return chalk.red('✗ Changes requested');
    case 'COMMENTED':
      return chalk.blue('💬 Commented');
    case 'DISMISSED':
      return chalk.gray('Dismissed');
    case 'PENDING':
      return chalk.yellow('⏳ Pending');
    default:
      return state ?? '';
  }
}

/**
 * Format file changes
 */
export function formatFileChanges(
  files: FormattableFile[] | null | undefined,
  options: FormatOptions = {}
): string {
  if (!files || files.length === 0) {
    return 'No files changed';
  }

  const lines: string[] = [];

  for (const file of files) {
    let line = '';

    // Status indicator
    switch (file.status) {
      case 'added':
        line += chalk.green('[A] ');
        break;
      case 'modified':
        line += chalk.yellow('[M] ');
        break;
      case 'removed':
        line += chalk.red('[D] ');
        break;
      case 'renamed':
        line += chalk.blue('[R] ');
        break;
      default:
        line += '[?] ';
    }

    // Filename
    line += file.filename;

    // Changes
    if (options.showChanges) {
      line += ` (${chalk.green(`+${file.additions || 0}`)} ${chalk.red(`-${file.deletions || 0}`)})`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Format JSON output
 */
export function formatJson(data: unknown, pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

/**
 * Format output based on format type
 */
export function formatOutput(data: unknown, format: string, options: FormatOptions = {}): string {
  switch (format) {
    case 'json':
      return formatJson(data, options.pretty !== false);

    case 'table':
      if (Array.isArray(data)) {
        return createPullRequestTable(data as FormattablePullRequest[], options);
      }
      return formatJson(data, true);

    case 'text':
    default:
      if (Array.isArray(data)) {
        return (data as FormattablePullRequest[]).map((pr) => formatPullRequest(pr, options)).join('\n\n');
      }
      if (data && typeof data === 'object' && (data as FormattablePullRequest).number) {
        return formatPullRequest(data as FormattablePullRequest, {
          ...options,
          showCounts: true,
          showChanges: true
        });
      }
      return formatJson(data, true);
  }
}

/**
 * Truncate text
 */
export function truncate(
  text: string | null | undefined,
  maxLength: number,
  suffix = '...'
): string | null | undefined {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Format URL for display
 */
export function formatUrl(url: string | null | undefined, colorize = true): string {
  if (!url) return '';
  return colorize ? chalk.cyan.underline(url) : url;
}

export default {
  formatDate,
  formatState,
  formatPullRequest,
  formatPullRequestRow,
  createPullRequestTable,
  formatReviewState,
  formatFileChanges,
  formatJson,
  formatOutput,
  truncate,
  formatUrl
};
