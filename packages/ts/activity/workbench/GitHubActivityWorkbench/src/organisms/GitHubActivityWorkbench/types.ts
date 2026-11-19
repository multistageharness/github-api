// Structural data contracts for the workbench (abstraction #2). These are the
// load-bearing schema the rest of the organism, its parts, and the dev pages
// respect — extend the type first, then populate; never render a one-off shape.

export type HttpMethod = 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';

export type ParamIn = 'path' | 'query' | 'body' | 'accept';

export type ParamType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'accept';

export interface Param {
  name: string;
  type: ParamType;
  in: ParamIn;
  required?: boolean;
  eg?: string;
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  options?: string[];
  /** Accept-header media type, used when `in: 'accept'`. */
  value?: string;
  /** Seed default for the field. */
  default?: unknown;
}

export interface Capability {
  id: string;
  module: string;
  label: string;
  method: HttpMethod;
  path: string;
  params: Param[];
  note?: string;
  mutating?: boolean;
  /** Read-back interpretation key for special endpoints. */
  interpret?: 'starred' | 'stargazers_count' | 'subscribers_count';
  /** Treat a 404 as a non-error (e.g. "not subscribed"). */
  allow404?: boolean;
  /** Body merged in verbatim for fixed-intent mutations (watch/ignore). */
  fixedBody?: Record<string, unknown>;
}

/** Parsed RFC-5988 Link header rels → URL. */
export type PaginationLinks = Record<string, string> | null;

export interface RateLimitSnapshot {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
  used: string | null;
  resource: string | null;
}

export interface ApiErrorShape {
  kind:
    | 'RateLimitError'
    | 'AuthenticationError'
    | 'NotFoundError'
    | 'ValidationError'
    | 'ServerError'
    | 'APIError';
  statusCode: number;
  message: string;
  errors: Array<Record<string, unknown>>;
  documentationUrl: string | null;
  resetTime: string | null;
}

/** The full temporal-state result rendered by the response panel (abstraction #3). */
export interface RequestResult {
  status?: number;
  statusText?: string;
  ok?: boolean;
  body?: unknown;
  rl?: RateLimitSnapshot;
  link?: PaginationLinks;
  duration: number;
  interpreted?: string | null;
  error?: ApiErrorShape | null;
  networkError?: string;
}

export interface BuiltRequest {
  url: string;
  path: string;
  qs: string;
  body: Record<string, unknown>;
  hasBody: boolean;
  accept: string;
  missing: string[];
}

export type FieldValue = string | number | boolean | undefined;
export type FieldValues = Record<string, FieldValue>;

/** Whoami probe result for the top bar. */
export type Whoami =
  | { ok: true; login?: string; avatar?: string }
  | { ok: false; msg: string }
  | null;
