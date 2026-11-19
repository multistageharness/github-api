/**
 * Public type surface for `@internal/github-sdk-repos`.
 *
 * Re-exports the interfaces consumers may want to import via the `./types`
 * subpath. The source `.mjs` package had no separate types module; this thin
 * barrel exists so the package.json `./types` export resolves to a real
 * emitted module.
 */

export type { RepoClientOptions, PingResult, RepoPaginator } from '../client/RepoClient.js';
export type {
  HTTPClientConfig,
  HTTPClientOptions,
  RateLimitingConfig,
  RateLimitStatus,
  RequestOptions,
} from '../client/http.js';
export type { AuthManagerOptions, AuthTypeValue, RepoPermissions } from '../client/auth.js';
export type {
  RepositoryData,
  PaginationValidationOptions,
  SortValidationOptions,
  WebhookConfigData,
  ValidationRule,
} from '../utils/validation.js';
export type { PaginationOptions, PaginationInfo, PaginationLinks } from '../utils/pagination.js';
export type { ErrorResponseLike, ErrorBodyLike } from '../utils/errors.js';
