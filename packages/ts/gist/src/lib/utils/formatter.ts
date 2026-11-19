/**
 * @fileoverview Output rendering for the CLI.
 * @module lib/utils/formatter
 */

import yaml from 'js-yaml';

/** Supported render formats. */
export type OutputFormat = 'json' | 'yaml' | 'table';

/** A value renderable as a table cell. */
type Primitive = string | number | boolean | null | undefined;

function isFlatRecord(value: unknown): value is Record<string, Primitive> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v)
  );
}

/** Renders data as JSON, YAML, or a plain-text table. */
export class Formatter {
  constructor(private readonly format: OutputFormat = 'json') {}

  /**
   * Render `data` in the configured format.
   *
   * Table mode only applies to arrays of flat objects; anything else falls back
   * to JSON, since a nested value has no honest single-cell representation.
   */
  format_data(data: unknown): string {
    switch (this.format) {
      case 'yaml':
        return yaml.dump(data);
      case 'table':
        return this.toTable(data);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /** Render an array of flat objects as an aligned table. */
  toTable(data: unknown): string {
    if (!Array.isArray(data) || data.length === 0 || !data.every(isFlatRecord)) {
      return JSON.stringify(data, null, 2);
    }

    const rows = data as Record<string, Primitive>[];
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (value: Primitive): string => (value === null || value === undefined ? '' : String(value));

    const widths = columns.map((column) =>
      Math.max(column.length, ...rows.map((row) => cell(row[column]).length))
    );

    const line = (values: string[]): string =>
      values.map((value, i) => value.padEnd(widths[i] ?? 0)).join('  ').trimEnd();

    return [
      line(columns),
      line(widths.map((w) => '-'.repeat(w))),
      ...rows.map((row) => line(columns.map((column) => cell(row[column])))),
    ].join('\n');
  }

  /** Render and write to stdout. */
  print(data: unknown): void {
    // eslint-disable-next-line no-console
    console.log(this.format_data(data));
  }
}

export default Formatter;
