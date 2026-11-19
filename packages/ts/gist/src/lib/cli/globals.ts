/**
 * @fileoverview Ambient globals the CLI entrypoint wires up in its `preAction`
 * hook, plus typed accessors so command modules do not each re-assert them.
 * @module lib/cli/globals
 */

import type GistAPI from '../../index.js';
import type { Formatter, OutputFormat } from '../utils/formatter.js';

declare global {
  // eslint-disable-next-line no-var
  var gistAPI: GistAPI;
  // eslint-disable-next-line no-var
  var formatter: Formatter;
  // eslint-disable-next-line no-var
  var outputFormat: OutputFormat;
}

/** The API client built from the global options. */
export function api(): GistAPI {
  return globalThis.gistAPI;
}

/** The formatter for the chosen `--format`. */
export function out(): Formatter {
  return globalThis.formatter;
}
