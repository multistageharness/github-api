/**
 * GitHub Activity SDK
 * @module github-activity-sdk
 */

// Main client
import { ActivityClient } from './client/ActivityClient.js';
import type { ActivityClientOptions } from './client/ActivityClient.js';
export { ActivityClient } from './client/ActivityClient.js';

// HTTP client and auth
export { HttpClient } from './client/http.js';
export { AuthConfig, createAuthConfig } from './client/auth.js';

// API modules
import { EventsAPI } from './api/events.js';
import { NotificationsAPI } from './api/notifications.js';
import { FeedsAPI } from './api/feeds.js';
import { StarsAPI } from './api/stars.js';
import { WatchingAPI } from './api/watching.js';
export { EventsAPI } from './api/events.js';
export { NotificationsAPI } from './api/notifications.js';
export { FeedsAPI } from './api/feeds.js';
export { StarsAPI } from './api/stars.js';
export { WatchingAPI } from './api/watching.js';

// Utilities
export { Paginator, parseLinkHeader, buildPaginationParams } from './utils/pagination.js';
export {
  APIError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ConfigurationError,
  isRetryableError,
  retryWithBackoff,
  sleep
} from './utils/errors.js';
export type { RetryInfo } from './utils/errors.js';
export type { StreamOptions } from './api/events.js';

// Types
import { Types } from './models/types.js';
export { Types } from './models/types.js';

// Factory function for quick client creation
export async function createClient(
  options: ActivityClientOptions = {}
): Promise<ActivityClient> {
  const { ActivityClient } = await import('./client/ActivityClient.js');

  // Try to create from environment if no options provided
  if (!options.token && !options.configPath) {
    return ActivityClient.fromEnvironment(options);
  }

  // Create from config file if path provided
  if (options.configPath) {
    return ActivityClient.fromConfig(options.configPath, options);
  }

  // Create with provided options
  return new ActivityClient(options);
}

// Default export
export default {
  ActivityClient,
  createClient,
  EventsAPI,
  NotificationsAPI,
  FeedsAPI,
  StarsAPI,
  WatchingAPI,
  Types
};
