/**
 * @fileoverview The one rate-limit error contract for the TypeScript runtime.
 * Eight incompatible `RateLimitError` classes exist across this repository; this
 * is the type they map onto (R11).
 * @module errors
 */

import type { Classification, LimitKind, ResponseLike } from './types.js';

/**
 * Brand used by {@link isRateLimitError}.
 *
 * `Symbol.for` is registry-global, so the check succeeds across two copies of
 * this package loaded at different paths — the situation where a plain
 * `instanceof` silently returns `false` and a rate limit gets reported as a
 * generic failure. `search-cli/src/render.ts` documents that
 * hazard in prose; this resolves it in code (R11).
 */
const BRAND: unique symbol = Symbol.for('@internal/github-sdk-ratelimit.RateLimitError') as never;

/** Everything a consumer needs to decide what to do about a limit. */
export interface RateLimitErrorDetail {
  /** Which bucket was limited. */
  resource: string;
  /** Primary (budget spent) or secondary (burst throttle). */
  kind: Exclude<LimitKind, 'none'>;
  /** HTTP status GitHub returned. */
  status: number;
  /** When the window resets, or `null` if GitHub did not say. */
  resetAt: Date | null;
  /** Wait GitHub advised, in ms, or `null` if none could be derived. */
  retryAfterMs: number | null;
  /** Whether the limiter already replayed the request before giving up. */
  retried: boolean;
  /** How many attempts were made in total. */
  attempts: number;
  /**
   * True when the honest wait was longer than the configured ceiling, so the
   * limiter refused to sleep it out and surfaced this instead (R6).
   */
  exceededWaitCeiling: boolean;
  /**
   * The response the limiter gave up on, as it classified it.
   *
   * Carried because the limiter swallows that response — a consumer that would
   * otherwise have built its own error from GitHub's body (its `message`, its
   * `documentation_url`) can no longer reach it any other way, and would be
   * forced to replace GitHub's wording with the limiter's.
   */
  response?: ResponseLike;
}

/**
 * A GitHub rate limit, primary or secondary.
 *
 * Distinguishable from an authentication or permission failure **by type**, not
 * by matching on a message string — the check at `users/src/client/http.ts:215`
 * that this replaces.
 */
export class GitHubRateLimitError extends Error implements RateLimitErrorDetail {
  override readonly name: string = 'GitHubRateLimitError';

  readonly resource: string;
  readonly kind: Exclude<LimitKind, 'none'>;
  readonly status: number;
  readonly resetAt: Date | null;
  readonly retryAfterMs: number | null;
  readonly retried: boolean;
  readonly attempts: number;
  readonly exceededWaitCeiling: boolean;
  readonly response: ResponseLike | undefined;

  constructor(message: string, detail: RateLimitErrorDetail, options?: { cause?: unknown }) {
    super(message);
    this.resource = detail.resource;
    this.kind = detail.kind;
    this.status = detail.status;
    this.resetAt = detail.resetAt;
    this.retryAfterMs = detail.retryAfterMs;
    this.retried = detail.retried;
    this.attempts = detail.attempts;
    this.exceededWaitCeiling = detail.exceededWaitCeiling;
    this.response = detail.response;

    if (options?.cause !== undefined) {
      // `cause` is ES2022; assigned rather than passed so the class works on
      // hosts whose `Error` constructor ignores the options bag.
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Restores the prototype chain when a consumer's build targets ES5, which
    // is the usual reason a subclass stops answering `instanceof`.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** True for primary limits: the budget is spent and the window must roll over. */
  get isPrimary(): boolean {
    return this.kind === 'primary';
  }

  /** True for secondary limits: burst throttling, not budget exhaustion. */
  get isSecondary(): boolean {
    return this.kind === 'secondary';
  }

  /** Seconds until the window resets, or `null` when unknown. */
  secondsUntilReset(nowMs: number = Date.now()): number | null {
    if (this.resetAt === null) {
      return null;
    }
    return Math.max(0, Math.ceil((this.resetAt.getTime() - nowMs) / 1000));
  }

  /** A plain object suitable for structured logging (N9 — the package never prints). */
  toJSON(): RateLimitErrorDetail & { name: string; message: string } {
    return {
      name: this.name,
      message: this.message,
      resource: this.resource,
      kind: this.kind,
      status: this.status,
      resetAt: this.resetAt,
      retryAfterMs: this.retryAfterMs,
      retried: this.retried,
      attempts: this.attempts,
      exceededWaitCeiling: this.exceededWaitCeiling,
    };
  }
}

// Brand the prototype so subclasses in consumer packages inherit it and stay
// recognizable to `isRateLimitError` without importing this class.
Object.defineProperty(GitHubRateLimitError.prototype, BRAND, {
  value: true,
  enumerable: false,
});

/**
 * Type guard for a rate-limit failure.
 *
 * Prefer this to `instanceof`: it holds for subclasses a consumer defines, and
 * across duplicate copies of this package, which `instanceof` does not.
 */
export function isRateLimitError(error: unknown): error is GitHubRateLimitError {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as Record<PropertyKey, unknown>)[BRAND] === true
  );
}

/**
 * GitHub's own wording for this failure, if the caller parsed a body.
 *
 * Preferred over the limiter's generic message: "API rate limit exceeded for
 * user ID 1234" is what GitHub said and what a consumer's existing error text
 * has always carried.
 */
export function githubMessageOf(response: ResponseLike | undefined): string | undefined {
  const data = response?.data;
  if (data !== null && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') {
      return message;
    }
  }
  return undefined;
}

/** Build the error for a classification the limiter has decided to give up on. */
export function rateLimitErrorFrom(
  classification: Classification,
  detail: Pick<
    RateLimitErrorDetail,
    'retried' | 'attempts' | 'exceededWaitCeiling' | 'response'
  >,
  options?: { cause?: unknown; message?: string },
): GitHubRateLimitError {
  const kind: Exclude<LimitKind, 'none'> = classification.kind === 'secondary' ? 'secondary' : 'primary';
  const resetAt = classification.resetAtMs === undefined ? null : new Date(classification.resetAtMs);

  const message =
    options?.message ??
    githubMessageOf(detail.response) ??
    (kind === 'secondary'
      ? `GitHub secondary rate limit on '${classification.resource}' (status ${classification.status})`
      : `GitHub rate limit exceeded for '${classification.resource}' (status ${classification.status})`);

  return new GitHubRateLimitError(
    message,
    {
      resource: classification.resource,
      kind,
      status: classification.status,
      resetAt,
      retryAfterMs: classification.retryAfterMs ?? null,
      ...detail,
    },
    options?.cause === undefined ? undefined : { cause: options.cause },
  );
}
