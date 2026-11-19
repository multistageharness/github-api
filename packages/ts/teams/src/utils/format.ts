/**
 * @fileoverview Display/formatting helpers used by the CLI. Faithful TypeScript
 * port of the source `utils/format.mjs`.
 * @module utils/format
 */

import chalk from 'chalk';
import type { ChalkInstance } from 'chalk';
import type { HttpError } from './http.js';

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-';

  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Error shape consumed by {@link formatError}. The `response` body is dynamic.
 */
interface ErrorResponseBody {
  message?: string;
  errors?: Array<{ field?: string; message?: string; code?: string }>;
}

export function formatError(error: HttpError | Error): string {
  const response = (error as HttpError).response as ErrorResponseBody | undefined;
  if (response) {
    if (response.message) {
      return response.message;
    }

    if (response.errors) {
      return response.errors
        .map((err) => `${err.field || 'Field'}: ${err.message || err.code}`)
        .join('\n');
    }

    return JSON.stringify(response, null, 2);
  }

  return error.message || 'Unknown error occurred';
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatPercentage(value: number, total: number): string {
  if (!total || total === 0) return '0%';

  const percentage = (value / total) * 100;
  return `${percentage.toFixed(1)}%`;
}

export function truncate(str?: string | null, maxLength = 50): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;

  return str.substring(0, maxLength - 3) + '...';
}

export function colorizeStatus(status: string): string {
  const statusColors: Record<string, ChalkInstance> = {
    active: chalk.green,
    pending: chalk.yellow,
    inactive: chalk.gray,
    error: chalk.red,
    success: chalk.green,
    warning: chalk.yellow,
    info: chalk.blue
  };

  const colorFn = statusColors[status.toLowerCase()] || chalk.white;
  return colorFn(status);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}

export function formatList(items?: string[] | null, separator = ', '): string {
  if (!items || items.length === 0) return '-';

  return items.join(separator);
}

export function formatJson(obj: unknown, indent = 2): string {
  return JSON.stringify(obj, null, indent);
}

export function formatTable(headers: string[], rows: unknown[][]): string {
  const columnWidths = headers.map((header, i) => {
    const maxLength = Math.max(header.length, ...rows.map((row) => String(row[i]).length));
    return maxLength;
  });

  const formatRow = (row: unknown[]): string => {
    return row
      .map((cell, i) => {
        const cellStr = String(cell);
        return cellStr.padEnd(columnWidths[i] as number);
      })
      .join(' | ');
  };

  const headerRow = formatRow(headers);
  const separator = columnWidths.map((w) => '-'.repeat(w)).join('-|-');
  const dataRows = rows.map(formatRow);

  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Permission flags accepted by {@link formatPermissions}.
 */
export interface PermissionFlags {
  admin?: boolean;
  maintain?: boolean;
  push?: boolean;
  triage?: boolean;
  pull?: boolean;
}

export function formatPermissions(permissions?: PermissionFlags | null): string {
  if (!permissions) return '-';

  const perms: string[] = [];
  if (permissions.admin) perms.push('admin');
  if (permissions.maintain) perms.push('maintain');
  if (permissions.push) perms.push('push');
  if (permissions.triage) perms.push('triage');
  if (permissions.pull) perms.push('pull');

  return perms.length > 0 ? perms.join(', ') : 'none';
}
