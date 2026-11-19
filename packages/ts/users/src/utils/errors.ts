/**
 * @fileoverview Custom error classes for GitHub Users API
 * @module errors
 */

/**
 * Minimal shape of an HTTP response as consumed by the error helpers.
 */
export interface ErrorResponseLike {
  status: number;
  statusText: string;
}

/**
 * Shape of a parsed GitHub error body (or any structured response payload
 * attached to an error). All fields are optional/dynamic.
 */
export interface ErrorBodyLike {
  message?: string;
  errors?: ValidationErrorDetail[];
  reset?: number;
  limit?: number;
  remaining?: number;
  [key: string]: unknown;
}

/**
 * A single validation error detail entry.
 */
export interface ValidationErrorDetail {
  field?: string;
  [key: string]: unknown;
}

/**
 * Base error class for GitHub Users API
 */
export class UsersError extends Error {
  status: number | null;
  response: ErrorBodyLike | null;

  /**
   * Create a new UsersError
   */
  constructor(message: string, status: number | null = null, response: ErrorBodyLike | null = null) {
    super(message);
    this.name = 'UsersError';
    this.status = status;
    this.response = response;

    // Maintain proper stack trace (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UsersError);
    }
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): { name: string; message: string; status: number | null; response: ErrorBodyLike | null } {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      response: this.response
    };
  }
}

/**
 * Authentication-related error
 */
export class AuthError extends UsersError {
  constructor(message: string, status: number | null = null, response: ErrorBodyLike | null = null) {
    super(message, status, response);
    this.name = 'AuthError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}

/**
 * Validation-related error
 */
export class ValidationError extends UsersError {
  errors: ValidationErrorDetail[];

  constructor(message: string, status: number | null = null, response: ErrorBodyLike | null = null) {
    super(message, status, response);
    this.name = 'ValidationError';
    this.errors = response?.errors || [];

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  /**
   * Get validation errors
   */
  getValidationErrors(): ValidationErrorDetail[] {
    return this.errors;
  }

  /**
   * Get errors for a specific field
   */
  getFieldErrors(field: string): ValidationErrorDetail[] {
    return this.errors.filter((error) => error.field === field);
  }
}

/**
 * Rate limit-related error
 */
export class RateLimitError extends UsersError {
  resetTime: Date | null;
  limit: number | null;
  remaining: number;

  constructor(message: string, status: number | null = null, response: ErrorBodyLike | null = null) {
    super(message, status, response);
    this.name = 'RateLimitError';
    this.resetTime = response?.reset ? new Date(response.reset * 1000) : null;
    this.limit = response?.limit || null;
    this.remaining = response?.remaining || 0;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError);
    }
  }

  /**
   * The reset instant (same value as `resetTime`). Every
   * `@internal/github-sdk-*` `RateLimitError` exposes `resetAt: Date | null`.
   */
  get resetAt(): Date | null {
    return this.resetTime;
  }

  /**
   * Milliseconds until the rate limit resets
   */
  getTimeUntilReset(): number {
    if (!this.resetTime) {
      return 0;
    }
    return Math.max(0, this.resetTime.getTime() - Date.now());
  }

  /**
   * Get human-readable time until reset
   */
  getTimeUntilResetString(): string {
    const ms = this.getTimeUntilReset();
    if (ms === 0) {
      return 'now';
    }

    const minutes = Math.ceil(ms / 60000);
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    const hours = Math.ceil(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
}

/**
 * Network-related error
 */
export class NetworkError extends UsersError {
  originalError: Error | null;

  constructor(message: string, originalError: Error | null = null) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends UsersError {
  constructor(message: string, status: number | null = 404, response: ErrorBodyLike | null = null) {
    super(message, status, response);
    this.name = 'NotFoundError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError);
    }
  }
}

/**
 * Permission denied error
 */
export class ForbiddenError extends UsersError {
  constructor(message: string, status: number | null = 403, response: ErrorBodyLike | null = null) {
    super(message, status, response);
    this.name = 'ForbiddenError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ForbiddenError);
    }
  }
}

/**
 * Create appropriate error from GitHub API response
 */
export function createErrorFromResponse(response: ErrorResponseLike, data: ErrorBodyLike): UsersError {
  const message = data.message || `HTTP ${response.status}: ${response.statusText}`;
  const status = response.status;

  switch (status) {
    case 401:
      return new AuthError(message, status, data);
    case 403:
      if (message.toLowerCase().includes('rate limit')) {
        return new RateLimitError(message, status, data);
      }
      return new ForbiddenError(message, status, data);
    case 404:
      return new NotFoundError(message, status, data);
    case 422:
      return new ValidationError(message, status, data);
    default:
      return new UsersError(message, status, data);
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof UsersError && error.status) {
    // Retry on 5xx server errors and some 4xx errors
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }

  return false;
}

/**
 * Get retry delay for error
 */
export function getRetryDelay(error: unknown, attempt = 1): number {
  if (error instanceof RateLimitError) {
    return error.getTimeUntilReset();
  }

  // Exponential backoff with jitter
  const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  const jitter = Math.random() * 1000;
  return baseDelay + jitter;
}
