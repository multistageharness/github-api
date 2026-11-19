/**
 * Output rendering: human-readable lines, `--json`, and the typed error paths.
 *
 * `log` is injected throughout so Epic 04 can assert output without capturing
 * stdout.
 */

import chalk from 'chalk';
import { AuthError, APIError, RateLimitError } from '@internal/github-sdk-search/utils';
import { isGitHubFetchError } from '@internal/github-sdk-fetch-rest-api';
import { MAX_SEARCH_RESULTS } from './query.js';

/** A line sink, `console.log`-shaped. */
export type LogFn = (line: string) => void;

/**
 * The fields of a GitHub search item the renderer reads. Every endpoint returns
 * a different shape, so all of them are optional.
 */
export interface SearchItem {
  full_name?: string;
  name?: string;
  login?: string;
  path?: string;
  stargazers_count?: number;
  sha?: string;
  number?: number;
  title?: string;
  repository_url?: string;
  pull_request?: unknown;
  repository?: { full_name?: string; [key: string]: unknown };
  commit?: { message?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** The parts of a `SearchResult` the human renderer reads. */
export interface RenderableResult {
  total_count?: number;
  incomplete_results?: boolean;
  items?: readonly SearchItem[];
}

/**
 * The generic fallback chain, for an item whose shape no per-endpoint formatter
 * recognises.
 *
 * `??`, not `||`: a `path` of `''` is plausible, and `||` would skip it into the
 * next fallback.
 */
const genericName = (item: SearchItem | undefined): string =>
  item?.full_name ?? item?.name ?? item?.login ?? item?.path ?? '<unnamed>';

/** First line of a commit message, so one commit is one output line. */
const firstLine = (text: unknown): string => (String(text ?? '').split(/\r?\n/, 1)[0] ?? '').trim();

/** `https://api.github.com/repos/owner/repo` → `owner/repo` (issue items carry no `repository`). */
const repoFromUrl = (url: unknown): string | undefined => {
  const match = /\/repos\/([^/]+\/[^/]+)\/?$/.exec(String(url ?? ''));
  return match ? match[1] : undefined;
};

type ItemFormatter = (item: SearchItem | undefined) => string | undefined;

/**
 * One formatter per endpoint, keyed by the real GitHub item shape. Each returns
 * `undefined` when the fields it needs are missing, and `itemName` then falls
 * back to the generic chain rather than printing a half-built line.
 */
const ITEM_FORMATTERS: Record<string, ItemFormatter> = {
  repositories: (item) => {
    if (item?.full_name === undefined) return undefined;
    return typeof item.stargazers_count === 'number'
      ? `${item.full_name} ★${item.stargazers_count}`
      : item.full_name;
  },
  // `name` is only the basename — `package.json` for every hit of the guided
  // file+content search. Repository + path is what tells two hits apart.
  code: (item) => {
    if (item?.path === undefined) return undefined;
    const repo = item.repository?.full_name;
    return repo ? `${repo}:${item.path}` : item.path;
  },
  commits: (item) => {
    if (!item?.sha) return undefined;
    const repo = item.repository?.full_name;
    const ref = repo ? `${repo}@${item.sha.slice(0, 7)}` : item.sha.slice(0, 7);
    const message = firstLine(item.commit?.message);
    return message ? `${ref} ${message}` : ref;
  },
  issues: (item) => {
    if (item?.number === undefined) return undefined;
    const repo = repoFromUrl(item.repository_url);
    const ref = repo ? `${repo}#${item.number}` : `#${item.number}`;
    const title = item.title ? ` ${item.title}` : '';
    return `${ref}${title}${item.pull_request ? ' [pr]' : ''}`;
  },
  users: (item) => item?.login,
  labels: (item) => item?.name,
  topics: (item) => item?.name,
};

/**
 * Pick a display name for a search item.
 *
 * Each search type returns a differently-shaped item, so the endpoint selects
 * the formatter. Without an endpoint (or for an unrecognised shape) the generic
 * fallback chain applies.
 */
export const itemName = (item: SearchItem | undefined, endpoint?: string): string =>
  (endpoint === undefined ? undefined : ITEM_FORMATTERS[endpoint])?.(item) ?? genericName(item);

/** Where a page sits in the result set. */
export interface PageInfo {
  page?: number | string | undefined;
  perPage?: number | string | undefined;
}

/**
 * `Found N results` plus, when the page size is known, where this page sits in
 * the window GitHub will actually serve (the first 1000 results).
 */
export function summaryLine(
  result: { total_count?: number } | undefined,
  { page, perPage }: PageInfo = {}
): string {
  const total = Number(result?.total_count ?? 0);
  const base = `Found ${result?.total_count} results`;
  if (!perPage) return base;
  const reachable = Math.min(total, MAX_SEARCH_RESULTS);
  const pages = Math.max(1, Math.ceil(reachable / Number(perPage)));
  const capped = total > MAX_SEARCH_RESULTS ? `; GitHub serves the first ${MAX_SEARCH_RESULTS}` : '';
  return `${base} (page ${Number(page ?? 1)}/${pages}${capped})`;
}

export interface RenderHumanOptions extends PageInfo {
  log?: LogFn;
  endpoint?: string;
}

/**
 * Human mode: a total-count line, a caution when the result set is partial, then
 * one line per item.
 */
export function renderHuman(
  result: RenderableResult,
  { log = console.log, endpoint, page, perPage }: RenderHumanOptions = {}
): void {
  log(chalk.green(summaryLine(result, { page, perPage })));
  if (result.incomplete_results) {
    // GitHub timed out mid-search. A silent partial result is worse than a slow one.
    log(chalk.yellow('⚠ incomplete_results: GitHub timed out; this page is partial.'));
  }
  for (const item of result.items ?? []) log(`  - ${itemName(item, endpoint)}`);
}

/**
 * `--json` mode: **only** the serialized result reaches stdout. A stray banner,
 * spinner frame, or outro line would corrupt a downstream `jq` pipe.
 */
export const renderJson = (result: unknown, { log = console.log }: { log?: LogFn } = {}): void =>
  log(JSON.stringify(result, null, 2));

/** `42000` → `42s`, `150000` → `2m 30s`. */
export const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
};

/** A one-line hint for the transport failures a user can act on. */
const FETCH_ERROR_HINTS: Record<string, string> = {
  GitHubProxyError: 'Check --proxy / HTTPS_PROXY, or pass --no-proxy to connect direct.',
  GitHubProxyUnavailableError: 'A proxy is configured but proxy support is not loaded.',
  GitHubTimeoutError: 'GitHub did not answer in time; retry, or narrow the query.',
  GitHubNetworkError: 'Check the network, GITHUB_API_URL / GH_HOST, and any proxy settings.',
};

/** Anything that may carry a `cause` chain and an OS-level `code`. */
interface CauseLink {
  cause?: CauseLink | null;
  code?: unknown;
}

/** The OS-level code (`ENOTFOUND`, `ECONNREFUSED`) buried in a fetch failure's cause chain. */
const causeCode = (err: CauseLink | null | undefined): string | undefined => {
  for (let cause = err?.cause, depth = 0; cause && depth < 5; cause = cause.cause, depth += 1) {
    if (typeof cause.code === 'string') return cause.code;
  }
  return undefined;
};

/** The shape a fetch-layer failure is rendered from. */
interface FetchFailure extends CauseLink {
  name: string;
  message: string;
  url: unknown;
}

/**
 * A fetch-layer failure. `instanceof` first; the `name` match covers a second
 * copy of the fetch layer (an ESM/CJS split, or a duplicate install), whose
 * classes are distinct objects.
 */
const isFetchFailure = (err: unknown): err is FetchFailure => {
  if (isGitHubFetchError(err)) return true;
  const candidate = err as { name?: unknown } | null | undefined;
  return (
    typeof candidate?.name === 'string' &&
    /^GitHub\w*Error$/.test(candidate.name) &&
    'url' in (candidate as object)
  );
};

export interface RenderErrorOptions {
  log?: LogFn;
  now?: number;
}

/**
 * Render a thrown error.
 *
 * **Order is load-bearing:** `RateLimitError extends APIError`, so an
 * `instanceof APIError` check written first makes the `RateLimitError` branch
 * unreachable — silently degrading "rate limited, resets at 14:32" into a bare
 * "403". Narrowest first.
 *
 * Always writes to stderr, so `--json` stdout stays parseable. Never prints a
 * stack trace, and never throws: a non-finite `resetTime` is skipped rather
 * than handed to `toISOString()`, whose `RangeError` would escape the
 * top-level catch as exactly the stack trace this function exists to prevent.
 */
export function renderError(
  err: unknown,
  { log = console.error, now = Date.now() }: RenderErrorOptions = {}
): void {
  if (err instanceof RateLimitError) {
    // MUST precede APIError — it is a subclass.
    const parts = [`Rate limited: ${err.message}.`];
    if (Number.isFinite(err.resetTime)) {
      parts.push(
        `Resets at ${new Date(err.resetTime).toISOString()} ` +
          `(in ${formatDuration(err.resetTime - now)}).`
      );
    }
    if (Number.isFinite(err.retryAfter)) {
      parts.push(`Retry after ${Math.ceil(err.retryAfter / 1000)}s.`);
    }
    log(chalk.red(parts.join(' ')));
  } else if (err instanceof APIError) {
    log(chalk.red(`GitHub API error ${err.status}: ${err.message}`));
    if (err.documentationUrl) log(chalk.dim(err.documentationUrl));
  } else if (err instanceof AuthError) {
    log(chalk.red(err.message));
  } else if (isFetchFailure(err)) {
    // Transport failures: DNS, refused connections, timeouts, proxies.
    const code = causeCode(err);
    log(chalk.red(code ? `${err.message} (${code})` : err.message));
    const hint = FETCH_ERROR_HINTS[err.name];
    if (hint) log(chalk.dim(hint));
  } else {
    log(chalk.red((err as { message?: unknown } | null | undefined)?.message ?? String(err)));
  }
}
