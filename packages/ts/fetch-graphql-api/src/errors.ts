/**
 * @fileoverview GraphQL's error contract, which is not REST's (R12).
 *
 * GraphQL's defining difference from REST is that a `200` may carry an `errors`
 * array and null `data`. A client that tests `response.ok` and returns the body
 * silently hands back garbage — the single most common way a naive GraphQL
 * client fails. That is why this is a separate error rather than a flag on the
 * REST one.
 * @module errors
 */

/** One entry of GraphQL's `errors` array. */
export interface GraphQLErrorDetail {
  message: string;
  type?: string;
  path?: (string | number)[];
  locations?: { line: number; column: number }[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The envelope GitHub's GraphQL endpoint returns, on success and failure alike. */
export interface GraphQLEnvelope<T = unknown> {
  data?: T | null;
  errors?: GraphQLErrorDetail[];
  extensions?: Record<string, unknown>;
}

/**
 * A `200` carrying an `errors` array (R12).
 *
 * Carries **both** halves of a partial response: GitHub may return usable
 * `data` alongside errors for the fields it could not resolve, and which of
 * those matters is the caller's decision, not this layer's. Raising without
 * `data` attached would make that decision for them.
 */
export class GitHubGraphQLError<T = unknown> extends Error {
  /** Every error GitHub reported. */
  readonly errors: GraphQLErrorDetail[];
  /** Whatever GitHub did resolve. `null` when it resolved nothing. */
  readonly data: T | null;
  /** GitHub's `extensions`, which is where its rate-limit cost accounting appears. */
  readonly extensions: Record<string, unknown> | undefined;
  /** HTTP status of the transporting response — `200` for the ordinary case. */
  readonly status: number;
  /** `x-github-request-id`, when present. */
  readonly requestId: string | null;
  /** The query that produced it, for a caller building a diagnostic. */
  readonly query: string;

  constructor(init: {
    errors: GraphQLErrorDetail[];
    data: T | null;
    extensions?: Record<string, unknown>;
    status: number;
    requestId: string | null;
    query: string;
  }) {
    super(init.errors[0]?.message ?? 'GraphQL request failed');
    this.name = 'GitHubGraphQLError';
    this.errors = init.errors;
    this.data = init.data;
    this.extensions = init.extensions;
    this.status = init.status;
    this.requestId = init.requestId;
    this.query = init.query;
  }

  /** Whether GitHub resolved anything at all — a partial response rather than a total failure. */
  get isPartial(): boolean {
    return this.data !== null && this.data !== undefined;
  }

  /** Serializable form. The query is included; a token never is (N8). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      requestId: this.requestId,
      isPartial: this.isPartial,
      errors: this.errors,
    };
  }
}

/** Whether `value` is a GraphQL-level failure, as opposed to an HTTP or transport one. */
export function isGraphQLError(value: unknown): value is GitHubGraphQLError {
  return value instanceof GitHubGraphQLError;
}
