/**
 * Error taxonomy for the GitHub Search SDK.
 * @module utils/errors
 */

/**
 * Base error for all search-client failures.
 */
export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchError';
  }
}

/**
 * Raised when authentication is missing or rejected.
 */
export class AuthError extends SearchError {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Raised when the GitHub API returns a non-2xx response.
 */
export class APIError extends SearchError {
  status: number;
  documentationUrl: string | null;

  constructor(message: string, status: number, documentationUrl: string | null = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.documentationUrl = documentationUrl;
  }
}

/**
 * Raised when the GitHub rate limit has been exhausted.
 */
export class RateLimitError extends APIError {
  retryAfter: number;
  resetTime: number;

  constructor(message: string, retryAfter: number, resetTime: number) {
    super(message, 403, null);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.resetTime = resetTime;
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
