/**
 * @fileoverview Reading a response body, and writing a request one (R7, R11).
 *
 * The rules here exist once each because each of them exists once in the
 * repository today: `repos` degrades unparseable JSON to text and nothing else
 * does; `teams` returns `null` for `204` and nothing else does; `users` mutates
 * the parsed body by attaching `_pagination` onto it, which corrupts every
 * endpoint that returns an array or a primitive.
 * @module body
 */

import { DEFAULT_CONTENT_TYPE } from './defaults.js';
import type { ResponseType } from './types.js';

/**
 * Media types whose payload is text, beyond `text/*`.
 *
 * GitHub's raw, diff, patch and sha media types are `application/vnd.github.*`
 * and would otherwise fall through to the bytes branch (R11).
 */
const TEXTUAL = [
  'application/vnd.github.raw',
  'application/vnd.github.diff',
  'application/vnd.github.patch',
  'application/vnd.github.sha',
  'application/vnd.github.html',
  'application/xml',
  'application/javascript',
  'application/graphql',
  '+xml',
];

/** Whether a content type is JSON, including `+json` suffixed vendor types. */
export function isJsonType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes('application/json') || lower.includes('+json');
}

function isTextualType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  if (lower.startsWith('text/')) return true;
  return TEXTUAL.some((type) => lower.includes(type));
}

/**
 * Read a response body according to `responseType` (R7, R11).
 *
 * `204 No Content`, `205`, `304` and a zero-length body all yield `null` — a
 * defined value, never a parse error. A body that claims JSON but does not
 * parse degrades to text rather than throwing, because GitHub does occasionally
 * answer with an HTML error page carrying a JSON content type, and losing the
 * page's text loses the only diagnostic there is.
 */
export async function readBody(response: Response, responseType: ResponseType): Promise<unknown> {
  if (responseType === 'stream') return null;

  // No body by definition. Reading one here is what turns a successful DELETE
  // into a `SyntaxError: Unexpected end of JSON input`.
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return null;
  }
  if (response.headers.get('content-length') === '0') return null;

  const contentType = response.headers.get('content-type') ?? '';

  if (responseType === 'arrayBuffer') return await response.arrayBuffer();
  if (responseType === 'text') return await response.text();

  if (responseType === 'json' || (responseType === 'auto' && isJsonType(contentType))) {
    const text = await response.text();
    if (text.trim() === '') return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // Claimed JSON, was not. The text is worth more than the exception.
      return text;
    }
  }

  if (contentType === '' || isTextualType(contentType)) {
    const text = await response.text();
    return text === '' ? null : text;
  }

  return await response.arrayBuffer();
}

/** A request body that must be sent verbatim rather than JSON-serialized (R11). */
function isRawBody(body: unknown): boolean {
  if (typeof body === 'string') return true;
  if (body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(body)) return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return true;
  return false;
}

/** A serialized request body and the `Content-Type` it implies, if any. */
export interface EncodedBody {
  body: BodyInit | undefined;
  contentType: string | undefined;
}

/**
 * Encode a request body (R11).
 *
 * A string, `URLSearchParams`, buffer, blob, form or stream goes out verbatim
 * and this function names no `Content-Type` — the caller's stays authoritative,
 * and `URLSearchParams`/`FormData` set their own. Anything else is JSON.
 */
export function encodeBody(body: unknown): EncodedBody {
  if (body === undefined || body === null) return { body: undefined, contentType: undefined };
  if (isRawBody(body)) return { body: body as BodyInit, contentType: undefined };
  return { body: JSON.stringify(body), contentType: DEFAULT_CONTENT_TYPE };
}
