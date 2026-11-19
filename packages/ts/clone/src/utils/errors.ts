/**
 * @fileoverview Custom error classes for Git operations
 * @module errors
 */

/** Arbitrary context bag attached to an error. */
export interface ErrorContext {
  [key: string]: unknown;
}

/** Minimal shape of a serialized original error. */
export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
}

/** JSON representation of a {@link GitError}. */
export interface GitErrorJSON {
  name: string;
  message: string;
  stack?: string;
  timestamp: string;
  context: ErrorContext;
  originalError?: ErrorDetails | null;
}

/** Details about a value that failed validation. */
export interface ValidationDetails {
  field?: string;
  value?: unknown;
  type?: string;
  [key: string]: unknown;
}

/**
 * Base error class for all Git-related errors
 */
export class GitError extends Error {
  override name: string;
  originalError?: Error;
  context: ErrorContext;
  timestamp: string;

  /**
   * Create a GitError
   * @param message - Error message
   * @param originalError - Original error that caused this error
   * @param context - Additional context information
   */
  constructor(message: string, originalError?: Error, context: ErrorContext = {}) {
    super(message);
    this.name = 'GitError';
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitError);
    }
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): GitErrorJSON {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      timestamp: this.timestamp,
      context: this.context,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack
          }
        : null
    };
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthError extends GitError {
  /**
   * Create an AuthError
   * @param message - Error message
   * @param originalError - Original error
   * @param context - Additional context
   */
  constructor(message: string, originalError?: Error, context: ErrorContext = {}) {
    super(message, originalError, context);
    this.name = 'AuthError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends GitError {
  validationDetails: ValidationDetails;

  /**
   * Create a ValidationError
   * @param message - Error message
   * @param validationDetails - Details about what failed validation
   * @param context - Additional context
   */
  constructor(message: string, validationDetails: ValidationDetails = {}, context: ErrorContext = {}) {
    super(message, undefined, context);
    this.name = 'ValidationError';
    this.validationDetails = validationDetails;
  }

  /**
   * Convert error to JSON representation
   */
  override toJSON(): GitErrorJSON & { validationDetails: ValidationDetails } {
    return {
      ...super.toJSON(),
      validationDetails: this.validationDetails
    };
  }
}

/**
 * Error thrown when a repository operation fails
 */
export class RepositoryError extends GitError {
  repoName?: string;
  operation?: string;

  /**
   * Create a RepositoryError
   * @param message - Error message
   * @param repoName - Repository name
   * @param operation - Operation that failed
   * @param originalError - Original error
   * @param context - Additional context
   */
  constructor(
    message: string,
    repoName?: string,
    operation?: string,
    originalError?: Error,
    context: ErrorContext = {}
  ) {
    super(message, originalError, context);
    this.name = 'RepositoryError';
    this.repoName = repoName;
    this.operation = operation;
  }

  /**
   * Convert error to JSON representation
   */
  override toJSON(): GitErrorJSON & { repoName?: string; operation?: string } {
    return {
      ...super.toJSON(),
      repoName: this.repoName,
      operation: this.operation
    };
  }
}

/**
 * Error thrown when a clone operation fails
 */
export class CloneError extends RepositoryError {
  repoUrl?: string;
  targetDir?: string;

  /**
   * Create a CloneError
   * @param message - Error message
   * @param repoUrl - Repository URL
   * @param targetDir - Target directory
   * @param originalError - Original error
   * @param context - Additional context
   */
  constructor(
    message: string,
    repoUrl?: string,
    targetDir?: string,
    originalError?: Error,
    context: ErrorContext = {}
  ) {
    super(message, targetDir, 'clone', originalError, context);
    this.name = 'CloneError';
    this.repoUrl = repoUrl;
    this.targetDir = targetDir;
  }

  /**
   * Convert error to JSON representation
   */
  override toJSON(): GitErrorJSON & {
    repoName?: string;
    operation?: string;
    repoUrl?: string;
    targetDir?: string;
  } {
    return {
      ...super.toJSON(),
      repoUrl: this.repoUrl,
      targetDir: this.targetDir
    };
  }
}

/**
 * Error thrown when network operations fail
 */
export class NetworkError extends GitError {
  url?: string;
  statusCode?: number;

  /**
   * Create a NetworkError
   * @param message - Error message
   * @param url - URL that failed
   * @param statusCode - HTTP status code if applicable
   * @param originalError - Original error
   * @param context - Additional context
   */
  constructor(
    message: string,
    url?: string,
    statusCode?: number,
    originalError?: Error,
    context: ErrorContext = {}
  ) {
    super(message, originalError, context);
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }

  /**
   * Convert error to JSON representation
   */
  override toJSON(): GitErrorJSON & { url?: string; statusCode?: number } {
    return {
      ...super.toJSON(),
      url: this.url,
      statusCode: this.statusCode
    };
  }
}

/**
 * Error thrown when file system operations fail
 */
export class FileSystemError extends GitError {
  path?: string;
  operation?: string;

  /**
   * Create a FileSystemError
   * @param message - Error message
   * @param path - File system path
   * @param operation - File operation that failed
   * @param originalError - Original error
   * @param context - Additional context
   */
  constructor(
    message: string,
    path?: string,
    operation?: string,
    originalError?: Error,
    context: ErrorContext = {}
  ) {
    super(message, originalError, context);
    this.name = 'FileSystemError';
    this.path = path;
    this.operation = operation;
  }

  /**
   * Convert error to JSON representation
   */
  override toJSON(): GitErrorJSON & { path?: string; operation?: string } {
    return {
      ...super.toJSON(),
      path: this.path,
      operation: this.operation
    };
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigError extends GitError {
  configKey?: string;
  configValue?: unknown;

  /**
   * Create a ConfigError
   * @param message - Error message
   * @param configKey - Configuration key that's invalid
   * @param configValue - Configuration value that's invalid
   * @param context - Additional context
   */
  constructor(message: string, configKey?: string, configValue?: unknown, context: ErrorContext = {}) {
    super(message, undefined, context);
    this.name = 'ConfigError';
    this.configKey = configKey;
    this.configValue = configValue;
  }

  /**
   * Convert error to JSON representation
   */
  override toJSON(): GitErrorJSON & { configKey?: string; configValue?: unknown } {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
      configValue: this.configValue
    };
  }
}

/**
 * Utility function to handle and wrap errors
 * @param error - Original error
 * @param operation - Operation that failed
 * @param context - Additional context
 * @returns Wrapped error
 */
export function wrapError(error: Error, operation: string, context: ErrorContext = {}): GitError {
  // If it's already a GitError, return it as-is
  if (error instanceof GitError) {
    return error;
  }

  // Map common error patterns to specific error types
  const message = error.message || 'Unknown error';

  // Authentication errors
  if (
    message.includes('Authentication failed') ||
    message.includes('Permission denied') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return new AuthError(`${operation} failed: ${message}`, error, context);
  }

  // Network errors
  if (
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED') ||
    message.includes('timeout') ||
    message.includes('network')
  ) {
    return new NetworkError(
      `${operation} failed: ${message}`,
      context['url'] as string | undefined,
      undefined,
      error,
      context
    );
  }

  // File system errors
  if (
    message.includes('ENOENT') ||
    message.includes('EACCES') ||
    message.includes('EPERM') ||
    message.includes('file') ||
    message.includes('directory')
  ) {
    return new FileSystemError(
      `${operation} failed: ${message}`,
      context['path'] as string | undefined,
      operation,
      error,
      context
    );
  }

  // Repository-specific errors
  if (
    message.includes('not a git repository') ||
    message.includes('repository') ||
    message.includes('clone') ||
    message.includes('push') ||
    message.includes('pull')
  ) {
    return new RepositoryError(
      `${operation} failed: ${message}`,
      context['repoName'] as string | undefined,
      operation,
      error,
      context
    );
  }

  // Default to generic GitError
  return new GitError(`${operation} failed: ${message}`, error, context);
}

/**
 * Utility function to check if an error is of a specific type
 * @param error - Error to check
 * @param errorClass - Error class to check against
 * @returns True if error is of the specified type
 */
export function isErrorType(
  error: Error,
  errorClass: new (...args: never[]) => Error
): boolean {
  return error instanceof errorClass;
}

/**
 * Extract useful information from an error for logging
 * @param error - Error to extract info from
 * @returns Error information suitable for logging
 */
export function getErrorInfo(
  error: Error
): GitErrorJSON | { name: string; message: string; stack?: string; timestamp: string } {
  if (error instanceof GitError) {
    return error.toJSON();
  }

  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    stack: error.stack,
    timestamp: new Date().toISOString()
  };
}
