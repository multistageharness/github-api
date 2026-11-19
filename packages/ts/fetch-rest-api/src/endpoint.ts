/**
 * @fileoverview The one request contract: a route plus a parameter object
 * becomes a URL, a method and a body (R3).
 *
 * Every rule here is one that a package in this repository either applies alone
 * or gets wrong alone. `search` skips `undefined` parameters and documents why;
 * `issues` interpolates `options.sort || ''` and sends `&sort=&order=undefined`.
 * Encoding path parameters is the difference between a branch named
 * `feature/x` addressing a branch and addressing a path.
 * @module endpoint
 */

import type { RequestParameters } from './types.js';

/** A parsed route: the verb, the path template, and nothing else. */
export interface ParsedRoute {
  method: string;
  /** Path template, still carrying its `{placeholder}`s. May be an absolute URL. */
  path: string;
}

/** Everything the transport needs, derived from a route and its parameters. */
export interface BuiltRequest {
  method: string;
  url: string;
  /** Parameters that became a JSON body, or `undefined` when there is none. */
  bodyParameters: Record<string, unknown> | undefined;
}

const ROUTE_PATTERN = /^([A-Za-z]+)\s+(\S+)$/;
const PLACEHOLDER = /\{([^{}]+)\}/g;

/** Whether a path is already absolute, and so must not be joined to the base URL. */
export function isAbsoluteUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

/**
 * Split `"GET /repos/{owner}/{repo}"` into its verb and path.
 *
 * A route with no verb is treated as `GET`, which is what a bare `Link`-header
 * URL always is.
 */
export function parseRoute(route: string): ParsedRoute {
  const match = ROUTE_PATTERN.exec(route.trim());
  if (match !== null) {
    return { method: (match[1] as string).toUpperCase(), path: match[2] as string };
  }
  return { method: 'GET', path: route.trim() };
}

/**
 * Whether a method carries its parameters in the query string rather than a body.
 *
 * `DELETE` is deliberately on this list: GitHub's `DELETE` endpoints take path
 * and query parameters, and several proxies drop a `DELETE` body outright.
 */
function isQueryMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'DELETE' || method === 'OPTIONS';
}

/**
 * Serialize one query value.
 *
 * Arrays repeat the key, which is how GitHub reads `labels=a&labels=b`.
 */
function appendQuery(search: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry === undefined || entry === null) continue;
      search.append(key, String(entry));
    }
    return;
  }
  search.append(key, String(value));
}

/**
 * Turn a route and its parameters into a method, a URL and a body (R3).
 *
 * Rules, in order:
 *
 * 1. Names matching a `{placeholder}` are substituted into the path, each one
 *    `encodeURIComponent`-ed, so a `/` in a branch name or a `#` in a query
 *    cannot corrupt the path. A `+` in a placeholder name (`{+path}`) marks a
 *    path segment that must **not** be encoded — GitHub uses it for file paths.
 * 2. An absolute path is used verbatim, so a `Link`-header URL is followed
 *    rather than rebuilt.
 * 3. Remaining parameters become query parameters for `GET`/`HEAD`/`DELETE`/
 *    `OPTIONS`, and a JSON body for everything else.
 * 4. `undefined` and `null` are dropped, never serialized.
 *
 * @param hasExplicitBody - Whether the caller supplied a body of their own. If
 *   so, leftover parameters cannot be the body and become **query parameters**
 *   even on a `POST` — the alternative is dropping them silently, and "body
 *   plus query" is a real shape (`POST /x?page=2` with a JSON payload).
 */
export function buildRequest(
  route: string,
  parameters: RequestParameters = {},
  baseUrl: string,
  hasExplicitBody = false,
): BuiltRequest {
  const { method, path } = parseRoute(route);
  const remaining: Record<string, unknown> = { ...parameters };

  const substituted = path.replace(PLACEHOLDER, (whole, rawName: string) => {
    const raw = rawName.startsWith('+');
    const name = raw ? rawName.slice(1) : rawName;
    if (!(name in remaining)) return whole;
    const value = remaining[name];
    delete remaining[name];
    if (value === undefined || value === null) return whole;
    const asString = String(value);
    return raw ? asString.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(asString);
  });

  const url = isAbsoluteUrl(substituted)
    ? new URL(substituted)
    : new URL(joinPath(baseUrl, substituted));

  let bodyParameters: Record<string, unknown> | undefined;

  if (isQueryMethod(method) || hasExplicitBody) {
    for (const [key, value] of Object.entries(remaining)) {
      appendQuery(url.searchParams, key, value);
    }
  } else {
    const body: Record<string, unknown> = {};
    let any = false;
    for (const [key, value] of Object.entries(remaining)) {
      // Dropped, never serialized — the same rule the query path applies.
      if (value === undefined) continue;
      body[key] = value;
      any = true;
    }
    bodyParameters = any ? body : undefined;
  }

  return { method, url: url.toString(), bodyParameters };
}

/**
 * Join a base URL and a path without losing either's segments.
 *
 * `new URL('/repos/x', 'https://host/api/v3')` discards `/api/v3`; this does
 * not, which is what keeps a base-URL override from silently dropping a path
 * prefix.
 */
export function joinPath(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
