/**
 * Custom error classes for GitHub Pull Request API
 */

// Was a type-only import of `node-fetch`'s `Response`. That dependency is retired
// (PRD 0002, R15); this is the platform `Response` — exactly what
// `@internal/github-sdk-fetch-rest-api` issues and hands back — so these
// signatures already accept what the layer produces when this package's client
// tier is built on it (Q4). `lib: DOM` in this package's tsconfig supplies the
// type; nothing is imported, and no HTTP dependency is declared.

/**
 * A single validation error entry as returned by the GitHub API. Entries are
 * dynamically shaped (string, object, or other primitives), so the union stays
 * loose to mirror the source runtime behavior.
 */
export type ValidationErrorEntry =
  | string
  | { field?: string; message?: string; code?: string; [key: string]: unknown }
  | null
  | undefined
  | number
  | boolean;

/**
 * Base API Error
 */
export class ApiError extends Error {
  status: number;
  // Error payloads are endpoint-dependent JSON; modeled as unknown.
  data: unknown;

  constructor(message: string, status = 0, data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Authentication Error
 */
export class AuthError extends ApiError {
  constructor(message: string, data: unknown = null) {
    super(message, 401, data);
    this.name = 'AuthError';
  }
}

/**
 * Validation Error
 */
export class ValidationError extends ApiError {
  errors: ValidationErrorEntry[];

  constructor(message: string, errors: ValidationErrorEntry[] = [], data: unknown = null) {
    super(message, 422, data);
    this.name = 'ValidationError';
    this.errors = errors;
  }

  /**
   * Get formatted error messages
   */
  getErrorMessages(): string[] {
    if (!this.errors || !Array.isArray(this.errors) || this.errors.length === 0) {
      return [this.message];
    }

    return this.errors
      .map((error) => {
        if (typeof error === 'string') {
          return error;
        }

        // Handle null/undefined errors
        if (error === null || error === undefined) {
          return '';
        }

        // Handle object errors
        if (error && typeof error === 'object') {
          if (error.message) {
            if (error.field) {
              return `${error.field}: ${error.message}`;
            }
            return error.message;
          }
          return JSON.stringify(error);
        }

        // Handle other types (number, boolean, etc.)
        return String(error);
      })
      .filter((msg) => msg !== ''); // Remove empty strings
  }
}

/**
 * Rate Limit Error
 *
 * `resetTime` is the reset instant as epoch **milliseconds** (`null` when
 * unknown), the same unit every `@internal/github-sdk-*` `RateLimitError` uses.
 */
export class RateLimitError extends ApiError {
  resetTime: number | null;

  constructor(message: string, resetTime: number | null = null, data: unknown = null) {
    super(message, 403, data);
    this.name = 'RateLimitError';
    this.resetTime = resetTime;
  }

  /** The reset instant, or `null` when GitHub did not report one. */
  get resetAt(): Date | null {
    return this.resetTime ? new Date(this.resetTime) : null;
  }

  /**
   * Milliseconds until the rate limit resets (`0` when unknown or already past).
   */
  getTimeUntilReset(): number {
    if (!this.resetTime) {
      return 0;
    }

    return Math.max(0, this.resetTime - Date.now());
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends ApiError {
  constructor(message: string, data: unknown = null) {
    super(message, 404, data);
    this.name = 'NotFoundError';
  }
}

/**
 * Permission Error
 */
export class PermissionError extends ApiError {
  constructor(message: string, data: unknown = null) {
    super(message, 403, data);
    this.name = 'PermissionError';
  }
}

/**
 * Conflict Error
 */
export class ConflictError extends ApiError {
  constructor(message: string, data: unknown = null) {
    super(message, 409, data);
    this.name = 'ConflictError';
  }
}

/**
 * The subset of a fetch `Response` that error handling reads. Declared
 * structurally so both the global (undici) `Response` and `node-fetch`'s — which
 * are nominally distinct types — satisfy it.
 */
export interface ErrorResponseLike {
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/**
 * Handle API errors and throw appropriate error type
 * @throws {ApiError} Appropriate error type
 */
export async function handleApiError(
  response: ErrorResponseLike,
  errorData: unknown = null
): Promise<never> {
  const data: unknown =
    errorData || (await (response.json() as Promise<unknown>).catch(() => null));
  const record = (data && typeof data === 'object' ? (data as Record<string, unknown>) : null);
  const message =
    (record && typeof record.message === 'string' ? record.message : undefined) ||
    response.statusText ||
    'API request failed';

  switch (response.status) {
    case 401:
      throw new AuthError(message, data);

    case 403: {
      // Check if it's a rate limit error
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');

      if (rateLimitRemaining === '0') {
        throw new RateLimitError(
          'API rate limit exceeded',
          // `x-ratelimit-reset` is epoch seconds; `RateLimitError` stores ms.
          rateLimitReset ? parseInt(rateLimitReset, 10) * 1000 : null,
          data
        );
      }
      throw new PermissionError(message, data);
    }

    case 404:
      throw new NotFoundError(message, data);

    case 409:
      throw new ConflictError(message, data);

    case 422: {
      const errors = (record && Array.isArray(record.errors)
        ? (record.errors as ValidationErrorEntry[])
        : []);
      throw new ValidationError(message, errors, data);
    }

    default:
      throw new ApiError(message, response.status, data);
  }
}

/**
 * Format error for CLI output
 */
export function formatError(error: unknown): string {
  if (error instanceof ValidationError) {
    const messages = error.getErrorMessages();
    return `Validation failed:\n  - ${messages.join('\n  - ')}`;
  }

  if (error instanceof RateLimitError) {
    const timeUntilReset = error.getTimeUntilReset();
    if (timeUntilReset > 0) {
      const minutes = Math.ceil(timeUntilReset / 60_000);
      return `${error.message}. Rate limit resets in ${minutes} minute(s).`;
    }
    return error.message;
  }

  if (error instanceof ApiError) {
    if (error.status) {
      return `${error.message} (HTTP ${error.status})`;
    }
    return error.message;
  }

  const message = error && (error as { message?: string }).message;
  return (typeof message === 'string' && message) || 'An unknown error occurred';
}

export default {
  ApiError,
  AuthError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  PermissionError,
  ConflictError,
  handleApiError,
  formatError
};
