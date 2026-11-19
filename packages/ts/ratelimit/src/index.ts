/**
 * @fileoverview `@internal/github-sdk-ratelimit` — GitHub rate limiting for the
 * TypeScript runtime.
 *
 * One implementation, governed by the shared conformance specification in
 * `../../conformance/`, which the Python package executes too. Zero runtime
 * dependencies: this sits beneath every SDK in the monorepo, and its footprint
 * is inherited by all of them (N3).
 * @module @internal/github-sdk-ratelimit
 */

export { GitHubRateLimiter, createRateLimiter } from './limiter.js';

export {
  GitHubRateLimitError,
  isRateLimitError,
  rateLimitErrorFrom,
  type RateLimitErrorDetail,
} from './errors.js';

export {
  DEFAULTS,
  DEFAULT_BACKOFF,
  RateLimiterConfigError,
  resolveConfig,
  type RateLimiterOptions,
  type ResolvedConfig,
} from './config.js';

export {
  AbortError,
  ManualClock,
  SystemClock,
  isAbortError,
  type SystemClockOptions,
} from './clock.js';

export {
  HEADER,
  hasNoRateLimitHeaders,
  parseHttpDate,
  parseIntegerHeader,
  parseRateLimitHeaders,
  parseRetryAfter,
  readHeader,
  resourceFromUrl,
  routeFromUrl,
} from './headers.js';

export { classifyResponse } from './classify.js';
export { computeWait, type WaitDecision, type WaitInput } from './wait.js';
export { computeBackoff, type BackoffConfig, type JitterMode } from './backoff.js';
export {
  computePacing,
  PacingTracker,
  type PacingConfig,
  type PacingDecision,
  type PacingInput,
} from './pacer.js';
export { Semaphore } from './semaphore.js';
export { EventBus } from './events.js';
export { RateLimitStore, isApproachingLimit, toStatus } from './state.js';
export { defaultExtractResponse, isIdempotent } from './extract.js';

export {
  FALLBACK_RESOURCE,
  WELL_KNOWN_RESOURCES,
  type Classification,
  type Clock,
  type ExecuteOptions,
  type LimitKind,
  type RateLimitStatus,
  type RateLimiterEventName,
  type RateLimiterEvents,
  type RateLimiterListener,
  type ResourceName,
  type ResourceState,
  type ResponseLike,
} from './types.js';
