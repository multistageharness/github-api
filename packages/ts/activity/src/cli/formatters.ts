/**
 * CLI Output Formatters
 * @module cli/formatters
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { VERSION } from '../version.js';

/**
 * Supported output formats.
 */
export type OutputFormat = 'json' | 'table' | 'csv' | string;

/** Inner width of the banner box. */
const BANNER_WIDTH = 38;

/** Center `text` within the banner's inner width. */
function bannerLine(text: string): string {
  const left = Math.max(0, Math.floor((BANNER_WIDTH - text.length) / 2));
  return `║${' '.repeat(left)}${text}${' '.repeat(Math.max(0, BANNER_WIDTH - left - text.length))}║`;
}

/**
 * Display banner
 */
export function displayBanner(version: string = VERSION): void {
  console.log(
    chalk.cyan.bold(`
╔${'═'.repeat(BANNER_WIDTH)}╗
${bannerLine(`GitHub Activity CLI v${version}`)}
${bannerLine('Manage events, notifications & more')}
╚${'═'.repeat(BANNER_WIDTH)}╝
  `)
  );
}

/**
 * Whether the CLI should print its banner: only to an interactive terminal, and
 * never for `--version` / `--quiet`, so piped and `-o json` output stays
 * machine-readable.
 */
export function shouldShowBanner(
  argv: readonly string[] = process.argv.slice(2),
  isTTY: boolean = process.stdout.isTTY === true
): boolean {
  if (!isTTY) return false;
  return !argv.some((arg) => ['-V', '--version', '-q', '--quiet'].includes(arg));
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

/**
 * Display error message
 */
export function displayError(error: unknown): void {
  if (error instanceof Error) {
    console.error(chalk.red('✗'), error.message);
    if (process.env['DEBUG'] === 'true') {
      console.error(chalk.gray(error.stack));
    }
  } else {
    console.error(chalk.red('✗'), error);
  }
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Format output based on format type
 */
export function formatOutput(data: unknown, format: OutputFormat = 'table'): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(data, null, 2));
      break;
    case 'csv':
      displayCSV(data);
      break;
    case 'table':
    default:
      displayTable(data);
      break;
  }
}

/**
 * Display data as table
 */
function displayTable(data: unknown): void {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    displayInfo('No data to display');
    return;
  }

  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : [data as Record<string, unknown>];

  const first = rows[0];
  if (!first) {
    displayInfo('No data to display');
    return;
  }

  const table = new Table({
    head: Object.keys(first).map((key) => chalk.cyan(key)),
    wordWrap: true
  });

  for (const item of rows) {
    const row = Object.values(item).map((value) => {
      if (value === null || value === undefined) {
        return chalk.gray('null');
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
    table.push(row);
  }

  console.log(table.toString());
}

/**
 * Display data as CSV
 */
function displayCSV(data: unknown): void {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return;
  }

  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : [data as Record<string, unknown>];

  const first = rows[0];
  if (!first) {
    return;
  }

  // Header
  console.log(Object.keys(first).join(','));

  // Rows
  for (const item of rows) {
    const row = Object.values(item).map((value) => {
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    console.log(row.join(','));
  }
}

/**
 * Display events
 */
export function displayEvents(
  events: Record<string, any>[],
  format: OutputFormat = 'table'
): void {
  // events are dynamic GitHub event records from the API
  if (format === 'json') {
    formatOutput(events, 'json');
    return;
  }

  if (!events || events.length === 0) {
    displayInfo('No events to display');
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Type'),
      chalk.cyan('Actor'),
      chalk.cyan('Repository'),
      chalk.cyan('Created')
    ],
    colWidths: [15, 20, 20, 30, 20]
  });

  for (const event of events) {
    table.push([
      event['id'].substring(0, 10) + '...',
      chalk.yellow(event['type'] || 'unknown'),
      chalk.blue(event['actor']?.login || 'unknown'),
      event['repo']?.name || 'unknown',
      new Date(event['created_at']).toLocaleString()
    ]);
  }

  console.log(table.toString());
}

/**
 * Display notifications
 */
export function displayNotifications(
  notifications: Record<string, any>[],
  format: OutputFormat = 'table'
): void {
  // notifications are dynamic GitHub notification records from the API
  if (format === 'json') {
    formatOutput(notifications, 'json');
    return;
  }

  if (!notifications || notifications.length === 0) {
    displayInfo('No notifications to display');
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Repository'),
      chalk.cyan('Subject'),
      chalk.cyan('Reason'),
      chalk.cyan('Unread'),
      chalk.cyan('Updated')
    ],
    colWidths: [10, 25, 30, 15, 8, 20]
  });

  for (const notification of notifications) {
    table.push([
      notification['id'].substring(0, 8) + '...',
      notification['repository'].full_name,
      `${notification['subject'].type}: ${notification['subject'].title.substring(0, 25)}...`,
      notification['reason'],
      notification['unread'] ? chalk.red('●') : chalk.green('○'),
      new Date(notification['updated_at']).toLocaleString()
    ]);
  }

  console.log(table.toString());
}

/**
 * Display stars/stargazers
 */
export function displayStars(
  stars: Record<string, any>[],
  format: OutputFormat = 'table',
  withTimestamps = false
): void {
  // stars are dynamic GitHub stargazer records from the API
  if (format === 'json') {
    formatOutput(stars, 'json');
    return;
  }

  if (!stars || stars.length === 0) {
    displayInfo('No stars to display');
    return;
  }

  const headers = [chalk.cyan('Login'), chalk.cyan('ID'), chalk.cyan('Type')];
  const colWidths = [25, 15, 15];

  if (withTimestamps && stars[0]?.['starred_at']) {
    headers.push(chalk.cyan('Starred At'));
    colWidths.push(25);
  }

  const table = new Table({ head: headers, colWidths });

  for (const star of stars) {
    const user = star['user'] || star;
    const row = [chalk.blue(user.login), user.id, user.type];

    if (withTimestamps && star['starred_at']) {
      row.push(new Date(star['starred_at']).toLocaleString());
    }

    table.push(row);
  }

  console.log(table.toString());
}

/**
 * Display watchers
 */
export function displayWatchers(
  watchers: Record<string, any>[],
  format: OutputFormat = 'table'
): void {
  // watchers are dynamic GitHub user records from the API
  if (format === 'json') {
    formatOutput(watchers, 'json');
    return;
  }

  if (!watchers || watchers.length === 0) {
    displayInfo('No watchers to display');
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('Login'),
      chalk.cyan('ID'),
      chalk.cyan('Type'),
      chalk.cyan('Site Admin')
    ],
    colWidths: [25, 15, 15, 12]
  });

  for (const watcher of watchers) {
    table.push([
      chalk.blue(watcher['login']),
      watcher['id'],
      watcher['type'],
      watcher['site_admin'] ? chalk.green('Yes') : chalk.gray('No')
    ]);
  }

  console.log(table.toString());
}

/**
 * Display feeds
 */
export function displayFeeds(
  feeds: Record<string, any>[],
  format: OutputFormat = 'table'
): void {
  // feeds are dynamic feed descriptors
  if (format === 'json') {
    formatOutput(feeds, 'json');
    return;
  }

  if (!feeds || feeds.length === 0) {
    displayInfo('No feeds available');
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('Name'),
      chalk.cyan('Type'),
      chalk.cyan('Public'),
      chalk.cyan('URL')
    ],
    colWidths: [25, 20, 8, 50]
  });

  for (const feed of feeds) {
    table.push([
      feed['name'],
      chalk.yellow(feed['type']),
      feed['public'] ? chalk.green('Yes') : chalk.red('No'),
      chalk.gray(feed['url'].substring(0, 47) + '...')
    ]);
  }

  console.log(table.toString());
}

/**
 * Display repository info
 */
export function displayRepository(repo: Record<string, any>): void {
  // repo is a dynamic GitHub repository record from the API
  console.log(chalk.bold('\nRepository Information:'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.blue('Name:'), repo['full_name']);
  console.log(chalk.blue('Description:'), repo['description'] || chalk.gray('No description'));
  console.log(chalk.blue('Stars:'), chalk.yellow('★'), repo['stargazers_count']);
  console.log(chalk.blue('Watchers:'), chalk.cyan('👁'), repo['watchers_count']);
  console.log(chalk.blue('Forks:'), repo['forks_count']);
  console.log(chalk.blue('Open Issues:'), repo['open_issues_count']);
  console.log(chalk.blue('Language:'), repo['language'] || chalk.gray('Not specified'));
  console.log(chalk.blue('License:'), repo['license']?.name || chalk.gray('No license'));
  console.log(chalk.blue('Created:'), new Date(repo['created_at']).toLocaleString());
  console.log(chalk.blue('Updated:'), new Date(repo['updated_at']).toLocaleString());
  console.log(chalk.blue('URL:'), chalk.underline(repo['html_url']));
}

/**
 * Display rate limit info
 */
export function displayRateLimit(rateLimit: Record<string, any>): void {
  // rateLimit is a dynamic GitHub rate-limit record from the API
  const core = rateLimit['resources']?.core || rateLimit['rate'];
  const remaining = core.remaining;
  const limit = core.limit;
  const reset = new Date(core.reset * 1000);
  const percentUsed = (((limit - remaining) / limit) * 100).toFixed(1);

  console.log(chalk.bold('\nRate Limit Status:'));
  console.log(chalk.gray('─'.repeat(40)));

  // Progress bar
  const barLength = 30;
  const filledLength = Math.round((remaining / limit) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  const color =
    remaining < limit * 0.1 ? chalk.red : remaining < limit * 0.3 ? chalk.yellow : chalk.green;

  console.log(chalk.blue('Core API:'));
  console.log(`  ${color(bar)} ${remaining}/${limit} (${percentUsed}% used)`);
  console.log(`  Resets: ${reset.toLocaleString()}`);

  if (rateLimit['resources']) {
    for (const [name, resource] of Object.entries(rateLimit['resources'])) {
      if (name !== 'core') {
        const res = resource as { remaining: number; limit: number };
        console.log(chalk.blue(`\n${name}:`));
        console.log(`  Remaining: ${res.remaining}/${res.limit}`);
      }
    }
  }
}
