/**
 * @fileoverview Reading GitHub's rate-limit headers off whatever shape the
 * caller's HTTP client hands us, and parsing them without the `|| 0` coalescing
 * that makes a missing budget look like an exhausted one (R1).
 * @module headers
 */

import { FALLBACK_RESOURCE, type ResourceState } from './types.js';

/** GitHub's five rate-limit headers, plus `Retry-After` (R1, R4). */
export const HEADER = {
  limit: 'x-ratelimit-limit',
  remaining: 'x-ratelimit-remaining',
  reset: 'x-ratelimit-reset',
  used: 'x-ratelimit-used',
  resource: 'x-ratelimit-resource',
  retryAfter: 'retry-after',
} as const;

/**
 * Read one header from a `Headers` instance, a `Map`, or a plain object,
 * case-insensitively.
 *
 * Returns `undefined` for absent headers so callers can tell "not reported"
 * from "reported as empty" — a distinction R1 depends on.
 */
export function readHeader(headers: unknown, name: string): string | undefined {
  if (headers === null || headers === undefined) {
    return undefined;
  }

  const lower = name.toLowerCase();

  // fetch `Headers`, node-fetch `Headers`, and `Map` all expose `.get`.
  const withGet = headers as { get?: (key: string) => unknown };
  if (typeof withGet.get === 'function') {
    const direct = withGet.get.call(headers, lower) ?? withGet.get.call(headers, name);
    if (direct !== null && direct !== undefined) {
      return normalizeValue(direct);
    }
    // A `Map` keyed with original casing needs a scan; `Headers` never gets here.
    if (typeof (headers as { forEach?: unknown }).forEach === 'function' && !isHeadersLike(headers)) {
      let found: string | undefined;
      (headers as { forEach: (cb: (v: unknown, k: unknown) => void) => void }).forEach((v, k) => {
        if (found === undefined && String(k).toLowerCase() === lower) {
          found = normalizeValue(v);
        }
      });
      return found;
    }
    return undefined;
  }

  if (typeof headers !== 'object') {
    return undefined;
  }

  const record = headers as Record<string, unknown>;
  // Axios lowercases response header keys, so the fast path hits first.
  if (Object.prototype.hasOwnProperty.call(record, lower)) {
    return normalizeValue(record[lower]);
  }
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) {
      return normalizeValue(record[key]);
    }
  }
  return undefined;
}

function isHeadersLike(headers: unknown): boolean {
  return typeof (headers as { append?: unknown }).append === 'function';
}

function normalizeValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    // Node's raw headers can repeat; the first value is the operative one.
    return value.length > 0 ? normalizeValue(value[0]) : undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return String(value);
}

/**
 * Parse a header expected to hold a non-negative integer.
 *
 * Absent, empty, whitespace, or non-numeric all yield `undefined` — never `0`.
 * `parseInt('abc') || 0` is exactly the behavior R1 forbids: it reports a
 * budget of zero for a response that said nothing about the budget at all.
 */
export function parseIntegerHeader(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  // Reject anything that is not a bare integer: `12abc`, `1.5`, `1e3`, `+1`.
  if (!/^-?\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

/**
 * Parse `Retry-After` in both forms the RFC allows: delay-seconds, and an
 * HTTP-date. Returns milliseconds, or `undefined` when malformed so the caller
 * falls back to the reset-derived delay rather than failing (R4).
 */
export function parseRetryAfter(value: string | undefined, nowMs: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  // delay-seconds
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds)) {
      return undefined;
    }
    return seconds * 1000;
  }

  // HTTP-date
  const parsed = parseHttpDate(trimmed, nowMs);
  if (parsed === undefined) {
    return undefined;
  }
  // A date already in the past means "retry now", not "travel backwards" (R6).
  return Math.max(0, parsed - nowMs);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH = `(${MONTHS.join('|')})`;
const TIME = '(\\d{2}):(\\d{2}):(\\d{2})';
/** `Sun, 06 Nov 1994 08:49:37 GMT` */
const IMF_FIXDATE = new RegExp(`^(?:${DAY_NAMES.join('|')}), (\\d{2}) ${MONTH} (\\d{4}) ${TIME} GMT$`);
/** `Sunday, 06-Nov-94 08:49:37 GMT` */
const RFC850_DATE = new RegExp(`^(?:${LONG_DAY_NAMES.join('|')}), (\\d{2})-${MONTH}-(\\d{2}) ${TIME} GMT$`);
/** `Sun Nov  6 08:49:37 1994` */
const ASCTIME_DATE = new RegExp(`^(?:${DAY_NAMES.join('|')}) ${MONTH} ( \\d|\\d{2}) ${TIME} (\\d{4})$`);

/**
 * Parse an HTTP-date into epoch milliseconds, accepting exactly the three
 * formats RFC 9110 §5.6.7 requires a recipient to accept, and nothing else.
 *
 * `Date.parse` is deliberately not used: it accepts ISO strings, `10/21/2015`,
 * numeric offsets, and zone-less dates it then reads in the *host's* timezone —
 * none of which the Python runtime accepts, and the last of which makes the
 * result depend on where the process runs. Arithmetic is done by hand (days
 * from the civil date) so both runtimes compute the identical value.
 *
 * `nowMs` only matters for the two-digit year of the obsolete RFC 850 form,
 * which RFC 9110 resolves relative to the current year.
 *
 * @returns epoch ms, or `undefined` when the value is not a valid HTTP-date.
 */
export function parseHttpDate(value: string, nowMs: number): number | undefined {
  const text = value.trim();
  let day: number;
  let month: number;
  let year: number;
  let time: [string, string, string];

  let match = IMF_FIXDATE.exec(text);
  if (match !== null) {
    day = Number(match[1]);
    month = MONTHS.indexOf(match[2] as string) + 1;
    year = Number(match[3]);
    time = [match[4] as string, match[5] as string, match[6] as string];
  } else if ((match = RFC850_DATE.exec(text)) !== null) {
    day = Number(match[1]);
    month = MONTHS.indexOf(match[2] as string) + 1;
    year = expandTwoDigitYear(Number(match[3]), nowMs);
    time = [match[4] as string, match[5] as string, match[6] as string];
  } else if ((match = ASCTIME_DATE.exec(text)) !== null) {
    month = MONTHS.indexOf(match[1] as string) + 1;
    day = Number((match[2] as string).trim());
    time = [match[3] as string, match[4] as string, match[5] as string];
    year = Number(match[6]);
  } else {
    return undefined;
  }

  const [hour, minute, second] = time.map(Number) as [number, number, number];
  if (day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 60) {
    return undefined;
  }

  const days = daysFromCivil(year, month, day);
  return ((days * 24 + hour) * 60 + minute) * 60_000 + second * 1000;
}

/** RFC 9110: a two-digit year more than 50 years in the future is in the past. */
function expandTwoDigitYear(twoDigits: number, nowMs: number): number {
  const currentYear = Number.isFinite(nowMs) ? new Date(nowMs).getUTCFullYear() : 1970;
  let year = currentYear - (currentYear % 100) + twoDigits;
  if (year > currentYear + 50) {
    year -= 100;
  }
  return year;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's algorithm). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/**
 * Extract everything GitHub reported about the budget on this response.
 *
 * Fields the response did not carry are left `undefined`; the caller merges
 * rather than overwrites, so a response with no rate-limit headers at all
 * leaves prior state untouched (R1).
 */
export function parseRateLimitHeaders(headers: unknown, fallbackResource?: string): Partial<ResourceState> {
  const resource = readHeader(headers, HEADER.resource)?.trim();

  const parsed: Partial<ResourceState> = {
    limit: parseIntegerHeader(readHeader(headers, HEADER.limit)),
    remaining: parseIntegerHeader(readHeader(headers, HEADER.remaining)),
    used: parseIntegerHeader(readHeader(headers, HEADER.used)),
    reset: parseIntegerHeader(readHeader(headers, HEADER.reset)),
  };

  if (resource !== undefined && resource !== '') {
    parsed.resource = resource;
  } else if (fallbackResource !== undefined) {
    parsed.resource = fallbackResource;
  }

  return parsed;
}

/** True when a response carried none of the rate-limit headers. */
export function hasNoRateLimitHeaders(parsed: Partial<ResourceState>): boolean {
  return (
    parsed.limit === undefined &&
    parsed.remaining === undefined &&
    parsed.used === undefined &&
    parsed.reset === undefined
  );
}

/**
 * The API-relative, lowercased path of a request URL, with the scheme, host,
 * query string and a GitHub Enterprise Server `/api/v3` prefix removed.
 *
 * Used both to guess a bucket and as the key under which the limiter remembers
 * which bucket GitHub actually reported for a route.
 */
export function routeFromUrl(url: string | undefined): string {
  if (!url) {
    return '/';
  }

  let path = url;
  const schemeIndex = path.indexOf('://');
  if (schemeIndex >= 0) {
    const afterScheme = path.slice(schemeIndex + 3);
    const slash = afterScheme.indexOf('/');
    path = slash >= 0 ? afterScheme.slice(slash) : '/';
  }
  const query = path.indexOf('?');
  if (query >= 0) {
    path = path.slice(0, query);
  }
  const fragment = path.indexOf('#');
  if (fragment >= 0) {
    path = path.slice(0, fragment);
  }
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  let lower = path.toLowerCase();

  // GitHub Enterprise Server serves REST under `/api/v3`; without stripping it
  // every GHES request would look like `core`, search included.
  if (lower === '/api/v3') {
    return '/';
  }
  if (lower.startsWith('/api/v3/')) {
    lower = lower.slice('/api/v3'.length);
  } else if (lower === '/api/graphql' || lower.startsWith('/api/graphql/')) {
    // GHES serves GraphQL at `/api/graphql`.
    lower = lower.slice('/api'.length);
  }
  return lower;
}

/**
 * Derive the bucket a request will be metered under from its URL, for use
 * before any response has named one (R2).
 *
 * GitHub reports the authoritative value in `x-ratelimit-resource`; this is the
 * pre-flight guess, and it is what stops `/search/*` traffic from being paced
 * against `core`'s far larger budget. Where the guess is wrong for a route, the
 * limiter remembers the reported bucket and paces that route against it from
 * then on.
 */
export function resourceFromUrl(url: string | undefined): string {
  if (!url) {
    return 'core';
  }

  const lower = routeFromUrl(url);

  // Code search has its own, much smaller budget (`code_search`); every other
  // `/search/*` endpoint is metered under `search`.
  if (lower === '/search/code') {
    return 'code_search';
  }
  if (lower === '/search' || lower.startsWith('/search/')) {
    return 'search';
  }
  if (lower === '/graphql' || lower.startsWith('/graphql/')) {
    return 'graphql';
  }
  if (lower.startsWith('/app-manifests/')) {
    return 'integration_manifest';
  }
  return 'core';
}

export { FALLBACK_RESOURCE };
