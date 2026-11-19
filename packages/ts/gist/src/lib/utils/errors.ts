/**
 * @fileoverview Error taxonomy for the Gist API client.
 * @module lib/utils/errors
 */

/** Base class for every error this package throws. */
export class GistAPIError extends Error {
  readonly statusCode: number;
  readonly response: unknown;

  constructor(message: string, statusCode = 500, response: unknown = null) {
    super(message);
    this.name = 'GistAPIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/** 401 — no credentials, or credentials GitHub rejected. */
export class AuthenticationError extends GistAPIError {
  constructor(message = 'Authentication required', response: unknown = null) {
    super(message, 401, response);
    this.name = 'AuthenticationError';
  }
}

/**
 * 429 — the primary rate limit is exhausted.
 *
 * `resetTime` is the reset instant as epoch **milliseconds** (`0` when unknown),
 * the same unit every `@internal/github-sdk-*` `RateLimitError` uses.
 */
export class RateLimitError extends GistAPIError {
  readonly resetTime: number;
  readonly limit: number;
  readonly remaining: number;

  constructor(resetTime: number, limit: number, remaining: number, response: unknown = null) {
    super(
      resetTime > 0
        ? `Rate limit exceeded. Resets at ${new Date(resetTime).toISOString()}`
        : 'Rate limit exceeded',
      429,
      response
    );
    this.name = 'RateLimitError';
    this.resetTime = resetTime;
    this.limit = limit;
    this.remaining = remaining;
  }

  /** The reset instant, or `null` when GitHub did not report one. */
  get resetAt(): Date | null {
    return this.resetTime > 0 ? new Date(this.resetTime) : null;
  }

  /** Milliseconds until the limit resets (`0` when unknown or already past). */
  getTimeUntilReset(): number {
    return this.resetTime > 0 ? Math.max(0, this.resetTime - Date.now()) : 0;
  }
}

/** 422 — the request was well-formed but semantically rejected. */
export class ValidationError extends GistAPIError {
  readonly errors: unknown[];

  constructor(message: string, errors: unknown[] = [], response: unknown = null) {
    super(message, 422, response);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/** 404 — the named resource does not exist (or is not visible to this token). */
export class NotFoundError extends GistAPIError {
  constructor(resource = 'Resource', response: unknown = null) {
    super(`${resource} not found`, 404, response);
    this.name = 'NotFoundError';
  }
}

/** 403 — authenticated, but not permitted. */
export class ForbiddenError extends GistAPIError {
  constructor(message = 'Access forbidden', response: unknown = null) {
    super(message, 403, response);
    this.name = 'ForbiddenError';
  }
}

/**
 * The subset of a fetch `Response` this module reads. Declared structurally so a
 * real `Response`, a `node-fetch` response, or a test double all satisfy it.
 */
export interface ErrorResponseLike {
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null | undefined };
}

/** Read a string field off an unknown JSON body. */
function messageOf(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const value = (body as { message?: unknown }).message;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/**
 * Translate a non-2xx response into the matching error class and throw it.
 *
 * @throws {GistAPIError} always — the return type is `never`.
 */
export function handleAPIError(response: ErrorResponseLike, responseBody: unknown = null): never {
  const message = messageOf(responseBody) ?? response.statusText ?? 'Request failed';

  switch (response.status) {
    case 401:
      throw new AuthenticationError(message, responseBody);

    case 403: {
      // A 403 is a rate-limit signal only when the remaining counter is exhausted;
      // otherwise it is a genuine permission failure.
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        // `x-ratelimit-reset` is epoch seconds; `RateLimitError` stores ms.
        const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000;
        const limit = Number(response.headers.get('x-ratelimit-limit') ?? 0);
        throw new RateLimitError(reset, limit, 0, responseBody);
      }
      throw new ForbiddenError(message, responseBody);
    }

    case 404:
      // GitHub's body message names the missing resource, which NotFoundError
      // formats into "<resource> not found".
      throw new NotFoundError(messageOf(responseBody) ?? 'Resource', responseBody);

    case 422: {
      const errors = (responseBody as { errors?: unknown })?.errors;
      throw new ValidationError(message, Array.isArray(errors) ? errors : [], responseBody);
    }

    default:
      throw new GistAPIError(message, response.status, responseBody);
  }
}
