/**
 * Public type surface for `@internal/github-sdk-users`.
 *
 * Re-exports the interfaces consumers may want to import via the `./types`
 * subpath. The source `.mjs` package shipped a hand-written `types/index.d.ts`
 * with no backing module; this thin barrel exists so the package.json
 * `./types` export resolves to a real emitted module.
 */

export type { UsersClientOptions, ResolvedUsersClientOptions } from '../client/UsersClient.js';
export type { HttpClientOptions, RateLimitingConfig, RequestOptions } from '../client/http.js';
export type { AuthOptions, AuthHeaders, AuthMethod } from '../client/auth.js';
export type { ValidationRule, PaginationOptions, UserUpdateData } from '../utils/validation.js';
export type {
  PaginationInfo,
  PaginationLinks,
  PaginateOptions,
  PaginatedResponse,
  PageInfo,
} from '../utils/pagination.js';
export type { ErrorResponseLike, ErrorBodyLike, ValidationErrorDetail } from '../utils/errors.js';
export type { FormatOptions } from '../utils/formatting.js';
export type { DiskUsageInfo, PermissionCheckResult } from '../api/profile.js';
export type {
  EmailListOptions,
  BulkAddResult,
  BulkDeleteResult,
  EmailStats,
} from '../api/emails.js';
export type { ListUsersOptions, UserSearchCriteria, UserStats } from '../api/discovery.js';
export type { ContextOptions, ContextSubject, ContextSummary } from '../api/context.js';
