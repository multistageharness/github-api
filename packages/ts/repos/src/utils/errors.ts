/**
 * @fileoverview Custom error classes for GitHub Repository API
 * @module errors
 */

/**
 * Minimal shape of an HTTP response (node-fetch Response or a GitHub error body)
 * as consumed by the error helpers. Header access is optional because some
 * call-sites pass a plain parsed body object rather than a real Response.
 */
export interface ErrorResponseLike {
  status?: number;
  statusText?: string;
  documentation_url?: string;
  headers?: { get(name: string): string | null };
}

/**
 * Shape of a parsed GitHub error body.
 */
export interface ErrorBodyLike {
  message?: string;
  errors?: unknown[];
  resource?: string;
  [key: string]: unknown;
}

/**
 * Base error class for repository operations
 */
export class RepoError extends Error {
  statusCode: number | null;
  response: ErrorResponseLike | null;

  constructor(
    message: string,
    statusCode: number | null = null,
    response: ErrorResponseLike | null = null
  ) {
    super(message);
    this.name = 'RepoError';
    this.statusCode = statusCode;
    this.response = response;

    // Maintain proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RepoError);
    }
  }

  /**
   * Create error from HTTP response
   */
  static fromResponse(response: ErrorResponseLike, body?: ErrorBodyLike | null): RepoError {
    const message = body?.message || `HTTP ${response.status}: ${response.statusText}`;
    return new RepoError(message, response.status ?? null, response);
  }
}

/**
 * Authentication related errors
 */
export class AuthError extends RepoError {
  constructor(message: string, statusCode = 401, response: ErrorResponseLike | null = null) {
    super(message, statusCode, response);
    this.name = 'AuthError';
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends RepoError {
  field: unknown;
  value: unknown;

  constructor(message: string, field: unknown = null, value: unknown = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Rate limiting errors
 *
 * `resetTime` is the reset instant as epoch **milliseconds** (`null` when
 * unknown), the same unit every `@internal/github-sdk-*` `RateLimitError` uses.
 */
export class RateLimitError extends RepoError {
  resetTime: number | null;
  remaining: unknown;

  constructor(message: string, resetTime: number | null = null, remaining: unknown = null) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.resetTime = resetTime;
    this.remaining = remaining;
  }

  /** The reset instant, or `null` when GitHub did not report one. */
  get resetAt(): Date | null {
    return this.resetTime ? new Date(this.resetTime) : null;
  }

  /** Milliseconds until the limit resets (`0` when unknown or already past). */
  getTimeUntilReset(): number {
    return this.resetTime ? Math.max(0, this.resetTime - Date.now()) : 0;
  }
}

/**
 * `x-ratelimit-reset` is epoch seconds; `RateLimitError` stores epoch ms.
 */
function resetHeaderToMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * Network/connectivity errors
 */
export class NetworkError extends RepoError {
  originalError: unknown;

  constructor(message: string, originalError: unknown = null) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends RepoError {
  resource: string;
  identifier: string | null;

  constructor(resource: string, identifier: string | null = null) {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Permission/access denied errors
 */
export class ForbiddenError extends RepoError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Conflict errors (e.g., resource already exists)
 */
export class ConflictError extends RepoError {
  resource: string | null;

  constructor(message: string, resource: string | null = null) {
    super(message, 409);
    this.name = 'ConflictError';
    this.resource = resource;
  }
}

/**
 * GitHub API specific errors
 */
export class GitHubAPIError extends RepoError {
  errors: unknown[];
  documentation_url: string | undefined;

  constructor(
    message: string,
    statusCode: number,
    response: ErrorResponseLike | null,
    errors: unknown[] = []
  ) {
    super(message, statusCode, response);
    this.name = 'GitHubAPIError';
    this.errors = errors;
    this.documentation_url = response?.documentation_url;
  }

  /**
   * Create from GitHub API error response
   */
  static fromGitHubResponse(response: ErrorResponseLike, body?: ErrorBodyLike | null): GitHubAPIError {
    const message = body?.message || `GitHub API error: ${response.status}`;
    const errors = body?.errors || [];

    return new GitHubAPIError(message, response.status ?? 0, response, errors);
  }

  /**
   * Check if error is due to rate limiting
   */
  isRateLimit(): boolean {
    return (
      this.statusCode === 429 ||
      (this.statusCode === 403 && this.message.toLowerCase().includes('rate limit'))
    );
  }

  /**
   * Check if error is due to missing permissions
   */
  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  /**
   * Check if error is due to resource not found
   */
  isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

/**
 * Error factory to create appropriate error instances
 */
export class ErrorFactory {
  /**
   * Create error from HTTP response
   */
  static fromResponse(response: ErrorResponseLike, body: ErrorBodyLike | null = null): RepoError {
    const status = response.status ?? 0;
    const message = body?.message || response.statusText || 'Unknown error';

    switch (status) {
      case 401:
        return new AuthError(message, status, response);

      case 403:
        if (message.toLowerCase().includes('rate limit')) {
          const resetTime = resetHeaderToMs(response.headers?.get('x-ratelimit-reset'));
          const remaining = response.headers?.get('x-ratelimit-remaining');
          return new RateLimitError(message, resetTime, remaining);
        }
        return new ForbiddenError(message);

      case 404:
        return new NotFoundError('Resource', (body?.resource as string | undefined) ?? null);

      case 409:
        return new ConflictError(message, (body?.resource as string | undefined) ?? null);

      case 422:
        return new ValidationError(message);

      case 429: {
        const resetTime = resetHeaderToMs(response.headers?.get('x-ratelimit-reset'));
        const remaining = response.headers?.get('x-ratelimit-remaining');
        return new RateLimitError(message, resetTime, remaining);
      }

      default:
        if (status >= 500) {
          return new RepoError(`Server error: ${message}`, status, response);
        }
        return new GitHubAPIError(message, status, response, body?.errors);
    }
  }

  /**
   * Create error from network failure
   */
  static fromNetworkError(originalError: Error, url: string | null = null): NetworkError {
    const message = url
      ? `Network error accessing ${url}: ${originalError.message}`
      : `Network error: ${originalError.message}`;
    return new NetworkError(message, originalError);
  }
}

/**
 * Error handler utility functions
 */
export const errorUtils = {
  /**
   * Check if error is retryable
   */
  isRetryable(error: unknown): boolean {
    if (error instanceof NetworkError) return true;
    if (error instanceof RateLimitError) return true;
    if (error instanceof RepoError && (error.statusCode ?? 0) >= 500) return true;
    return false;
  },

  /**
   * Get retry delay from error (in milliseconds)
   */
  getRetryDelay(error: unknown, attempt = 1): number {
    if (error instanceof RateLimitError && error.resetTime) {
      return error.getTimeUntilReset();
    }

    // Exponential backoff for other retryable errors
    return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  },

  /**
   * Format error for console output
   */
  formatForConsole(error: unknown): string {
    if (error instanceof ValidationError) {
      return `Validation Error: ${error.message}${error.field ? ` (field: ${String(error.field)})` : ''}`;
    }

    if (error instanceof RateLimitError) {
      const resetTime = error.resetTime
        ? new Date(error.resetTime).toLocaleTimeString()
        : 'unknown';
      return `Rate Limit Exceeded: ${error.message} (resets at ${resetTime})`;
    }

    if (error instanceof GitHubAPIError && error.errors.length > 0) {
      const errorList = error.errors
        // each error entry is a dynamic GitHub validation object
        .map((e) => `  - ${(e as { message?: string; code?: string }).message || (e as { code?: string }).code}`)
        .join('\n');
      return `${error.message}\nDetails:\n${errorList}`;
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }
};
