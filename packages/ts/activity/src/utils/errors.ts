/**
 * Error handling utilities
 * @module utils/errors
 */

/**
 * A single validation error entry returned by the API.
 */
export interface ValidationErrorDetail {
  field?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Base error class for API errors
 */
export class APIError extends Error {
  statusCode: number;
  errors: ValidationErrorDetail[];
  documentationUrl: string | null;

  constructor(
    message: string,
    statusCode: number,
    errors: ValidationErrorDetail[] = [],
    documentationUrl: string | null = null
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.documentationUrl = documentationUrl;
  }

  /**
   * Get formatted error message
   */
  override toString(): string {
    let msg = `${this.name}: ${this.message} (Status: ${this.statusCode})`;

    if (this.errors.length > 0) {
      msg += '\nValidation Errors:';
      for (const error of this.errors) {
        msg += `\n  - ${error.field}: ${error.code} - ${error.message}`;
      }
    }

    if (this.documentationUrl) {
      msg += `\nDocumentation: ${this.documentationUrl}`;
    }

    return msg;
  }
}

/**
 * Rate limit error
 *
 * `retryAfter` is milliseconds and `resetTime` is the reset instant as epoch
 * **milliseconds** (`0` when unknown), the same unit every
 * `@internal/github-sdk-*` `RateLimitError` uses.
 */
export class RateLimitError extends APIError {
  retryAfter: number;
  resetTime: number;

  constructor(message: string, retryAfter: number, resetTime: number) {
    super(message, 403);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.resetTime = resetTime;
  }

  /**
   * Get seconds until rate limit resets
   */
  getSecondsUntilReset(): number {
    return Math.max(0, Math.ceil(this.retryAfter / 1000));
  }

  /** The reset instant, or `null` when GitHub did not report one. */
  get resetAt(): Date | null {
    return this.resetTime > 0 ? new Date(this.resetTime) : null;
  }

  /**
   * Milliseconds until the limit resets — numeric, like every other package's
   * `RateLimitError.getTimeUntilReset()`. Use `getTimeUntilResetString()` for
   * the human-readable form.
   */
  getTimeUntilReset(): number {
    return Math.max(0, this.retryAfter);
  }

  /**
   * Get formatted time until reset (e.g. `"2 minutes"`)
   */
  getTimeUntilResetString(): string {
    const seconds = this.getSecondsUntilReset();

    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends APIError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends APIError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends APIError {
  constructor(message: string, errors: ValidationErrorDetail[] = []) {
    super(message, 422, errors);
    this.name = 'ValidationError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (error instanceof APIError) {
    // Retry on server errors
    return error.statusCode >= 500;
  }

  // Retry on network errors
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED';
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Details passed to a {@link retryWithBackoff} `onRetry` callback. */
export interface RetryInfo {
  error: unknown;
  delayMs: number;
  attempt: number;
  maxRetries: number;
}

/**
 * Retry a function with exponential backoff
 *
 * `onRetry` is called before each wait; without it a one-line notice goes to
 * stderr (never stdout, which a CLI's `--json` output owns).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  onRetry?: (info: RetryInfo) => void
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted retries
      if (i === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = baseDelay * Math.pow(2, i);

      // If rate limited, wait until reset
      if (error instanceof RateLimitError) {
        delay = Math.max(delay, error.retryAfter);
      }

      if (onRetry) {
        onRetry({ error, delayMs: delay, attempt: i + 1, maxRetries });
      } else {
        console.error(`Request failed, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
      }
      await sleep(delay);
    }
  }

  throw lastError;
}
