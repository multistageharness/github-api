/**
 * @fileoverview Core types shared by every module in the package.
 * @module types
 */

/**
 * A GitHub rate-limit resource ("bucket"). GitHub meters these independently,
 * each with its own limit and its own reset clock (R2).
 *
 * The union is open on purpose: GitHub adds resources over time, and an
 * unrecognized one is tracked under its reported name rather than folded into
 * `core`.
 */
export type ResourceName =
  | 'core'
  | 'search'
  | 'graphql'
  | 'code_search'
  | 'integration_manifest'
  | 'source_import'
  | 'code_scanning_upload'
  | 'dependency_snapshots'
  | 'audit_log'
  | (string & {});

/** The resource used when a request's bucket cannot be determined. */
export const FALLBACK_RESOURCE = 'unknown';

/** Resources tracked eagerly so `snapshot()` is stable across runs. */
export const WELL_KNOWN_RESOURCES: readonly ResourceName[] = [
  'core',
  'search',
  'graphql',
  FALLBACK_RESOURCE,
];

/**
 * What GitHub last reported about one resource's budget.
 *
 * Every numeric field is optional and stays `undefined` until a response
 * actually carries it. A missing or unparseable header never becomes `0` —
 * that conflation is the defect R1 exists to correct.
 */
export interface ResourceState {
  /** Bucket name, e.g. `core`. */
  resource: string;
  /** Total requests allowed in the current window. */
  limit?: number;
  /** Requests left in the current window. */
  remaining?: number;
  /** Requests spent in the current window. */
  used?: number;
  /** Window reset time, epoch **seconds** (GitHub's own unit). */
  reset?: number;
  /** When this state was recorded, epoch **milliseconds**. */
  observedAt?: number;
}

/** A read-only view of one resource's budget, with derived fields. */
export interface RateLimitStatus extends ResourceState {
  /** Window reset time as a `Date`, or `null` when unknown. */
  resetAt: Date | null;
  /** Milliseconds until reset; `undefined` when unknown, never negative. */
  millisecondsUntilReset?: number;
  /** Seconds until reset; `undefined` when unknown, never negative. */
  secondsUntilReset?: number;
  /** True when `remaining` is known and `0`. */
  exhausted: boolean;
}

/** Which kind of limit GitHub signalled, if any. */
export type LimitKind = 'none' | 'primary' | 'secondary';

/** The verdict on a single response (R3, R4, R5). */
export interface Classification {
  /** `primary` — budget spent. `secondary` — burst/abuse throttle. `none` — not a rate limit. */
  kind: LimitKind;
  /** Convenience: `kind !== 'none'`. */
  isRateLimit: boolean;
  /** Bucket the response belongs to. */
  resource: string;
  /** HTTP status that produced the verdict. */
  status: number;
  /** Wait advised by `Retry-After`, in ms. Takes precedence over `resetAtMs` (R4). */
  retryAfterMs?: number;
  /** Window reset, epoch ms, derived from `x-ratelimit-reset`. */
  resetAtMs?: number;
  /** Human-readable justification — for logs and events, never for control flow. */
  reason: string;
}

/**
 * Anything the limiter can read a status and headers off: a `fetch` `Response`,
 * an `AxiosResponse`, an `httpx.Response` shim, or a plain object. The package
 * never constructs one and never requires a particular HTTP client (R13).
 */
export interface ResponseLike {
  status: number;
  headers: unknown;
  /** Parsed error body, when the caller has one. Used only to spot GitHub's secondary-limit wording. */
  data?: unknown;
}

/** Monotonic-enough time plus a cancellable sleep, injectable for tests (R13). */
export interface Clock {
  /** Current time, epoch milliseconds. */
  now(): number;
  /**
   * Resolve after `ms`. Must reject promptly with an `AbortError` if `signal`
   * aborts, and must clear its timer when it does. A pending wait should keep
   * the process alive: it is the work still to be done.
   */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Per-request knobs handed to {@link GitHubRateLimiter.execute}. */
export interface ExecuteOptions {
  /** Force the bucket. Otherwise derived from `url`, then from the response. */
  resource?: ResourceName;
  /** Request URL or path — used to derive the bucket when `resource` is absent. */
  url?: string;
  /** HTTP method. Decides retry eligibility together with `idempotent`. */
  method?: string;
  /**
   * Whether the request may be replayed. Defaults to `true` for
   * GET/HEAD/OPTIONS and `false` otherwise; set explicitly to override (R9).
   */
  idempotent?: boolean;
  /** Skip proactive pacing for a latency-critical call. Explicit by design (R7). */
  skipPacing?: boolean;
  /** Caller's cancellation signal. Aborts pacing, waiting and backoff (R6). */
  signal?: AbortSignal;
}

/** Events emitted by the limiter (R10). */
export interface RateLimiterEvents {
  /** Proactive pacing delayed a request before it was sent. */
  throttle: { resource: string; delayMs: number; reason: 'min-interval' | 'adaptive' };
  /** The limiter slept in response to a limit GitHub reported. */
  wait: { resource: string; waitMs: number; kind: LimitKind; retryAfterUsed: boolean };
  /** A request is about to be replayed. */
  retry: { resource: string; attempt: number; delayMs: number; kind: LimitKind };
  /** A response was classified as a rate limit. */
  limit: Classification;
  /** Per-resource state changed after a response was observed. */
  state: ResourceState;
  /** Concurrency cap moved, up or down. */
  concurrency: { limit: number; inFlight: number; queued: number; reason: string };
  /** Remaining budget crossed below the configured threshold. */
  exhaustion: { resource: string; remaining: number; limit?: number; threshold: number };
}

/** Name of any emitted event. */
export type RateLimiterEventName = keyof RateLimiterEvents;

/** Listener for a given event. */
export type RateLimiterListener<K extends RateLimiterEventName> = (
  payload: RateLimiterEvents[K],
) => void;
