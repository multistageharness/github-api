/**
 * Main SDK entry point for GitHub Reactions API
 * @module index
 */

// Re-export main functionality
export { ReactionsClient } from './client/ReactionsClient.js';
export { createClient, Container } from './bootstrap.js';

// Re-export types and constants
export {
  REACTION_CONTENT,
  RELEASE_REACTION_CONTENT,
  Types
} from './core/types.js';

// Re-export type definitions
export type {
  Config,
  PaginationOptions,
  LoggingOptions,
  SimpleUser,
  Reaction,
  ReactionContent,
  ReleaseReactionContent,
  BasicError,
  ValidationErrorItem,
  ValidationErrorBody,
  ListReactionsOptions,
  ListReleaseReactionsOptions,
  CreateReactionOptions,
  CreateReleaseReactionOptions,
  PaginatedResponse,
  PaginationInfo
} from './core/types.js';

// Re-export errors
export {
  GitHubReactionsError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  ErrorHandler
} from './core/errors.js';

// Re-export utilities
export { loadConfig } from './utils/config.js';
export { createLogger } from './utils/logger.js';

// Default export
export { createClient as default } from './bootstrap.js';
