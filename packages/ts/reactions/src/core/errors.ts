/**
 * Custom error classes for GitHub Reactions API
 * @module core/errors
 */

/**
 * Serialized representation of a {@link GitHubReactionsError}.
 */
export interface GitHubReactionsErrorJSON {
  name: string;
  message: string;
  code: string;
  statusCode: number;
  details: unknown;
  stack: string | undefined;
}

export class GitHubReactionsError extends Error {
  code: string;
  statusCode: number;
  details: unknown;

  constructor(
    message: string,
    code = 'UNKNOWN_ERROR',
    statusCode = 500,
    details: unknown = undefined
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): GitHubReactionsErrorJSON {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

export class ValidationError extends GitHubReactionsError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends GitHubReactionsError {
  constructor(message = 'GitHub token is required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class NotFoundError extends GitHubReactionsError {
  constructor(resource: string, identifier?: string) {
    super(
      `${resource} not found${identifier ? `: ${identifier}` : ''}`,
      'NOT_FOUND',
      404,
      { resource, identifier }
    );
  }
}

export class ForbiddenError extends GitHubReactionsError {
  constructor(message = 'Forbidden - insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
  }
}

/**
 * `resetTime` is the reset instant as epoch **milliseconds** (`0`/`NaN` when
 * unknown), the same unit every `@internal/github-sdk-*` `RateLimitError` uses.
 * It is exposed both as `resetTime` and, as before, under `details.resetTime`.
 */
export class RateLimitError extends GitHubReactionsError {
  resetTime: number;

  constructor(resetTime: number) {
    const known = Number.isFinite(resetTime) && resetTime > 0;
    super(
      known
        ? `Rate limit exceeded. Resets at ${new Date(resetTime).toISOString()}`
        : 'Rate limit exceeded',
      'RATE_LIMIT_ERROR',
      429,
      { resetTime }
    );
    this.resetTime = resetTime;
  }

  /** The reset instant, or `null` when GitHub did not report one. */
  get resetAt(): Date | null {
    return Number.isFinite(this.resetTime) && this.resetTime > 0 ? new Date(this.resetTime) : null;
  }

  /** Milliseconds until the limit resets (`0` when unknown or already past). */
  getTimeUntilReset(): number {
    const at = this.resetAt;
    return at === null ? 0 : Math.max(0, at.getTime() - Date.now());
  }
}

export class NetworkError extends GitHubReactionsError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', 503, details);
  }
}

export class TimeoutError extends GitHubReactionsError {
  constructor(timeout: number) {
    super(`Request timeout after ${timeout}ms`, 'TIMEOUT_ERROR', 408, { timeout });
  }
}

export class ConfigurationError extends GitHubReactionsError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
  }
}

/**
 * Loosely-typed view of an error that may carry a GitHub API response, an
 * error code, and/or a timeout — matching the dynamic shapes the source
 * handler inspected.
 */
interface ErrorLike {
  response?: {
    status: number;
    data?: { message?: string; errors?: unknown } | null;
    headers: { [key: string]: string } & { get?(name: string): string | null };
  };
  code?: string;
  message?: string;
  timeout?: number;
  name?: string;
}

// Error handler utility
export class ErrorHandler {
  /**
   * Convert any error to a GitHubReactionsError
   */
  static handle(error: unknown): GitHubReactionsError {
    if (error instanceof GitHubReactionsError) {
      return error;
    }

    const err = error as ErrorLike;

    // Handle GitHub API errors
    if (err.response) {
      const { status, data } = err.response;

      switch (status) {
        case 401:
          return new AuthenticationError(data?.message || 'Authentication required');
        case 403:
          return new ForbiddenError(data?.message || 'Forbidden');
        case 404:
          return new NotFoundError('Resource', data?.message || 'Not found');
        case 422:
          return new ValidationError(data?.message || 'Validation failed', data?.errors);
        case 429:
          // `x-ratelimit-reset` is epoch seconds; `RateLimitError` stores ms.
          return new RateLimitError(
            Number(err.response.headers['x-ratelimit-reset']) * 1000
          );
        default:
          return new GitHubReactionsError(
            data?.message || `HTTP ${status}`,
            'API_ERROR',
            status,
            data
          );
      }
    }

    // Handle network errors
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return new NetworkError(err.message ?? '', { code: err.code });
    }

    // Handle timeout errors
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return new TimeoutError(err.timeout || 30000);
    }

    if (error instanceof Error) {
      return new GitHubReactionsError(error.message, 'WRAPPED_ERROR', 500, {
        originalError: error.name,
        stack: error.stack,
      });
    }

    return new GitHubReactionsError(String(error), 'UNKNOWN_ERROR', 500);
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: GitHubReactionsError): boolean {
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'RATE_LIMIT_ERROR'];
    return retryableCodes.includes(error.code) || error.statusCode >= 500;
  }
}
