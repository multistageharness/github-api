/**
 * @fileoverview Finding the status and headers on whatever a governed task
 * returned or threw. The package governs requests it is handed; it does not
 * dictate the transport that makes them (R13).
 * @module extract
 */

import type { ResponseLike } from './types.js';

/**
 * Coerce a value into something with `status` and `headers`, or `null` if it
 * carries no HTTP response at all.
 *
 * Recognized without configuration:
 *
 * - `fetch` / `node-fetch` `Response` — `status` + `Headers`
 * - Axios `AxiosResponse` — `status` + a lowercased header object
 * - Axios `AxiosError` — the same, nested under `.response`
 * - `httpx`-shaped shims — `status_code` + `headers`
 * - Any error carrying `status` or `statusCode` alongside `headers`
 *
 * Consumers whose transport matches none of these pass `extractResponse`.
 *
 * **`fetch` consumers:** a `Response`'s `body` is an unread `ReadableStream`, so
 * GitHub's secondary-limit wording in the body is invisible here. A `403` that
 * carries `Retry-After` is still classified as secondary, but one without it
 * looks like a permission failure. To see the wording, read the body inside
 * the task and return it alongside the response — for example
 * `{ status: res.status, headers: res.headers, data: res.status === 403 || res.status === 429 ? await res.clone().json().catch(() => undefined) : undefined }`
 * — or pass an `extractResponse` that does the equivalent.
 */
export function defaultExtractResponse(value: unknown): ResponseLike | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null;
  }

  const direct = asResponse(value);
  if (direct !== null) {
    return direct;
  }

  // Axios and several SDKs nest the real response on the error.
  const nested = (value as { response?: unknown }).response;
  if (nested !== null && nested !== undefined && typeof nested === 'object') {
    const fromNested = asResponse(nested);
    if (fromNested !== null) {
      return fromNested;
    }
  }

  return null;
}

function asResponse(value: object): ResponseLike | null {
  const record = value as {
    status?: unknown;
    statusCode?: unknown;
    status_code?: unknown;
    headers?: unknown;
    data?: unknown;
    body?: unknown;
  };

  const status = firstNumber(record.status, record.statusCode, record.status_code);
  if (status === undefined) {
    return null;
  }
  if (record.headers === null || record.headers === undefined) {
    return null;
  }

  // `data` is only read to spot GitHub's secondary-limit wording; a body the
  // caller has not parsed simply means that signal is unavailable.
  const data = record.data ?? record.body;

  return data === undefined
    ? { status, headers: record.headers }
    : { status, headers: record.headers, data };
}

function firstNumber(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/** Methods safe to replay without the caller saying so (R9). */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Whether a request may be retried.
 *
 * Reads are replayable. Writes are not, unless the consumer opts in — a rate
 * limit can arrive *after* the write landed, and replaying it would duplicate
 * the effect.
 */
export function isIdempotent(method: string | undefined, explicit: boolean | undefined): boolean {
  if (explicit !== undefined) {
    return explicit;
  }
  if (method === undefined) {
    // No method given: assume a read, which is what every paginating client does.
    return true;
  }
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}
