/**
 * @fileoverview Shared data contracts for the Gist API package.
 * @module lib/utils/types
 */

/** Options accepted by {@link GistClient} and {@link GistAPI}. */
export interface ClientOptions {
  /** GitHub PAT. Falls back to `GITHUB_TOKEN`, then `GH_TOKEN`. */
  token?: string | undefined;
  /** API root. Defaults to `https://api.github.com`. */
  baseURL?: string | undefined;
  /** Per-request timeout in milliseconds. Default `30000`. */
  timeout?: number | undefined;
  /** Total attempts for a transient failure, including the first. Default `3`. */
  retryAttempts?: number | undefined;
  /** Milliseconds between retries. Default `1000`. */
  retryDelay?: number | undefined;
  /**
   * HTTP proxy every request is routed through (PRD 0002, R6, R13).
   *
   * Resolved from `GITHUB_PROXY`, then `https_proxy`/`HTTPS_PROXY`, when
   * omitted. `null` forces a direct connection.
   */
  proxy?: string | null | undefined;
  /** Hosts reached directly even when a proxy is configured — curl's `NO_PROXY` rules (R2). */
  proxyBypass?: string | readonly string[] | null | undefined;
}

/** Per-request overrides. */
export interface RequestOptions {
  method?: string;
  /** JSON-serialized and sent with `Content-Type: application/json`. */
  body?: unknown;
  /** Overrides the `Accept` header, e.g. `application/vnd.github.raw`. */
  mediaType?: string;
  /** Query parameters; `null`/`undefined` entries are dropped. */
  params?: Record<string, string | number | boolean | null | undefined>;
}

/** What every request resolves to. */
export interface GistResponse<T = unknown> {
  data: T;
  status: number;
  headers: { get(name: string): string | null | undefined };
}

/** A file inside a gist. */
export interface GistFile {
  filename?: string;
  type?: string;
  language?: string | null;
  raw_url?: string;
  size?: number;
  truncated?: boolean;
  content?: string;
}

/** Input shape when creating or updating gist files. */
export type GistFileInput = Record<string, { content: string } | { filename?: string } | null>;

/** GitHub account summary as embedded in gist payloads. */
export interface GistOwner {
  login?: string;
  id?: number;
  avatar_url?: string;
  html_url?: string;
  type?: string;
}

/** A gist as returned by the API. */
export interface Gist {
  id?: string;
  node_id?: string;
  url?: string;
  html_url?: string;
  git_pull_url?: string;
  git_push_url?: string;
  description?: string | null;
  public?: boolean;
  created_at?: string;
  updated_at?: string;
  comments?: number;
  owner?: GistOwner;
  files?: Record<string, GistFile>;
  truncated?: boolean;
}

/** A comment on a gist. */
export interface GistComment {
  id?: number;
  node_id?: string;
  url?: string;
  body?: string;
  user?: GistOwner;
  created_at?: string;
  updated_at?: string;
}

/** One revision of a gist. */
export interface GistCommit {
  version?: string;
  url?: string;
  user?: GistOwner;
  committed_at?: string;
  change_status?: { total?: number; additions?: number; deletions?: number };
}

/** A fork of a gist. */
export interface GistFork {
  id?: string;
  url?: string;
  user?: GistOwner;
  created_at?: string;
  updated_at?: string;
}

/** Pagination parameters shared by the list endpoints. */
export interface ListOptions {
  page?: number;
  per_page?: number;
  since?: string;
}
