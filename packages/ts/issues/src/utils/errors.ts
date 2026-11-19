/**
 * Custom error classes for GitHub Issues API
 */

/**
 * Base API Error
 */
export class ApiError extends Error {
  statusCode: number;
  // GitHub error bodies are dynamically shaped; preserved verbatim from source.
  details: unknown;

  constructor(message: string, statusCode = 0, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Authentication Error
 */
export class AuthError extends ApiError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthError';
  }
}

/**
 * Validation Error
 */
export class ValidationError extends ApiError {
  // Individual validation error entries are dynamically shaped by GitHub.
  errors: unknown[];

  constructor(message: string, errors: unknown[] = [], details: unknown = null) {
    super(message, 422, details);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Rate Limit Error
 *
 * `resetTime` is the reset instant as epoch **milliseconds** (`null`/`0` when
 * unknown), the same unit every `@internal/github-sdk-*` `RateLimitError` uses.
 */
export class RateLimitError extends ApiError {
  resetTime: number | null;
  resetDate?: Date;
  minutesUntilReset?: number;

  constructor(message = 'Rate limit exceeded', resetTime: number | null = null) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.resetTime = resetTime;
    if (resetTime) {
      this.resetDate = new Date(resetTime);
      this.minutesUntilReset = Math.ceil((this.resetDate.getTime() - new Date().getTime()) / 60000);
    }
  }

  /** The reset instant, or `null` when GitHub did not report one. */
  get resetAt(): Date | null {
    return this.resetDate ?? null;
  }

  /** Milliseconds until the limit resets (`0` when unknown or already past). */
  getTimeUntilReset(): number {
    return this.resetTime ? Math.max(0, this.resetTime - Date.now()) : 0;
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends ApiError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Permission Error
 */
export class PermissionError extends ApiError {
  constructor(message = 'Permission denied') {
    super(message, 403);
    this.name = 'PermissionError';
  }
}

/**
 * Conflict Error
 */
export class ConflictError extends ApiError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Network Error
 */
export class NetworkError extends ApiError {
  constructor(message = 'Network error occurred') {
    super(message, 0);
    this.name = 'NetworkError';
  }
}
