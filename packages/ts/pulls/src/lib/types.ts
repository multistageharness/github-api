/**
 * Reconstructed `src/lib/types.ts` for `@internal/github-sdk-pulls`.
 *
 * See ../README.md for why this file exists and where its contract comes from.
 *
 * Every response interface documents the subset the SDK's own code and tests rely on, and carries an
 * index signature — INTERFACE.md is explicit that responses are "loosely typed (documented subset
 * fields + an index signature preserving every other key GitHub returns)". Dropping the index
 * signature would make the types *stricter* than the package documents and would break callers that
 * read a field this file does not enumerate.
 */

/** A repository target. Every method accepts these; they fall back to the constructor's values. */
export interface RepoTarget {
  owner?: string;
  repo?: string;
}

/** `owner`/`repo` after `validateRepo` has resolved and checked them. */
export interface ResolvedRepo {
  owner: string;
  repo: string;
}

export interface PageOptions extends RepoTarget {
  per_page?: number;
  page?: number;
}

/** A GitHub user, as embedded in a pull request, review or comment. */
export interface User {
  login?: string;
  id?: number;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

/** One end of a pull request — `head` or `base`. */
export interface GitRef {
  ref?: string;
  sha?: string;
  label?: string;
  user?: User;
  repo?: unknown;
  [key: string]: unknown;
}

export interface Label {
  name?: string;
  color?: string;
  [key: string]: unknown;
}

export interface PullRequest {
  id?: number;
  number?: number;
  title?: string;
  body?: string | null;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  /** `null` while GitHub is still computing mergeability — not the same as `false`. */
  mergeable?: boolean | null;
  mergeable_state?: string;
  head?: GitRef;
  base?: GitRef;
  user?: User;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  merged_at?: string | null;
  html_url?: string;
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  labels?: Label[];
  requested_reviewers?: User[];
  [key: string]: unknown;
}

export interface Review {
  id?: number;
  user?: User;
  body?: string;
  /** `APPROVED` · `CHANGES_REQUESTED` · `COMMENTED` · `DISMISSED` · `PENDING` */
  state?: string;
  submitted_at?: string;
  commit_id?: string;
  html_url?: string;
  [key: string]: unknown;
}

export interface ReviewComment {
  id?: number;
  user?: User;
  body?: string;
  created_at?: string;
  updated_at?: string;
  path?: string;
  line?: number | null;
  side?: string;
  start_line?: number | null;
  position?: number | null;
  commit_id?: string;
  in_reply_to_id?: number;
  html_url?: string;
  [key: string]: unknown;
}

export interface CommitAuthor {
  name?: string;
  email?: string;
  date?: string;
  [key: string]: unknown;
}

export interface Commit {
  sha?: string;
  commit?: {
    author?: CommitAuthor;
    committer?: CommitAuthor;
    message?: string;
    [key: string]: unknown;
  };
  author?: User | null;
  committer?: User | null;
  html_url?: string;
  [key: string]: unknown;
}

export interface PullRequestFile {
  /**
   * Required, not optional.
   *
   * INTERFACE.md writes this one without a `?` while marking every sibling optional, and
   * `src/commands/files.ts` relies on it: `--names-only` maps straight to `string[]`. Widening it
   * would make the reconstruction *looser* than the package documents and break upstream code that
   * is already written against the documented shape.
   */
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string;
  sha?: string;
  blob_url?: string;
  raw_url?: string;
  previous_filename?: string;
  [key: string]: unknown;
}

export interface SearchResult {
  /** All three are required in INTERFACE.md; `src/commands/search.ts` returns `items` directly. */
  total_count: number;
  incomplete_results: boolean;
  items: PullRequest[];
  [key: string]: unknown;
}

/** The response body of `PUT /pulls/{n}/merge`. */
export interface MergeResult {
  merged?: boolean;
  sha?: string;
  message?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ *
 * Request option shapes
 * ------------------------------------------------------------------ */

export interface ListOptions extends PageOptions {
  /** `open` · `closed` · `all`. Default `open`. */
  state?: string;
  /** `created` · `updated` · `popularity` · `long-running`. Default `created`. */
  sort?: string;
  /** `asc` · `desc`. Default `desc`. */
  direction?: string;
  /** Base-branch filter. Sent only when set. */
  base?: string;
  /** Head filter, `user:ref`. Sent only when set. */
  head?: string;
  [key: string]: unknown;
}

export interface CreateData extends RepoTarget {
  title?: string;
  head?: string;
  base?: string;
  body?: string;
  draft?: boolean;
  /** Create from an existing issue; when set, `title`/`head`/`base` are not required. */
  issue?: number;
  maintainer_can_modify?: boolean;
  [key: string]: unknown;
}

export interface UpdateData extends RepoTarget {
  title?: string;
  body?: string;
  base?: string;
  /** `open` · `closed`. */
  state?: string;
  maintainer_can_modify?: boolean;
  [key: string]: unknown;
}

export interface MergeOptions extends RepoTarget {
  /** `merge` · `squash` · `rebase`. Default `merge`. */
  merge_method?: string;
  commit_title?: string;
  commit_message?: string;
  /** Require this SHA to be at HEAD; the merge fails if it moved. */
  sha?: string;
  [key: string]: unknown;
}

export interface UpdateBranchOptions extends RepoTarget {
  expected_head_sha?: string;
  [key: string]: unknown;
}

export interface ReviewCommentListOptions extends PageOptions {
  /** `created` · `updated`. Default `created`. */
  sort?: string;
  /** `asc` · `desc`. Default `desc`. */
  direction?: string;
  /** ISO-8601. Sent only when set. */
  since?: string;
  [key: string]: unknown;
}

export interface SearchOptions {
  /** `created` · `updated` · `comments` · … Default `created`. */
  sort?: string;
  /** `asc` · `desc`. Default `desc`. */
  order?: string;
  per_page?: number;
  page?: number;
  [key: string]: unknown;
}

/**
 * Free-form GitHub payloads.
 *
 * `createReview`, `createReviewComment`, `requestReviewers` and
 * `removeRequestedReviewers` forward their body verbatim — INTERFACE.md says so explicitly — so
 * narrowing these would reject payloads the API accepts.
 */
export type ReviewData = Record<string, unknown> & RepoTarget;
export type ReviewCommentData = Record<string, unknown> & RepoTarget;
export type ReviewerData = Record<string, unknown> & RepoTarget;

/** Constructor options for both client tiers. */
export interface PullRequestClientOptions {
  /** `null` forces unauthenticated even when the environment has a token. */
  auth?: string | null;
  baseUrl?: string;
  owner?: string;
  repo?: string;
  /**
   * HTTP proxy every request is routed through (PRD 0002, R6, R13).
   *
   * Resolved from `GITHUB_PROXY`, then `https_proxy`/`HTTPS_PROXY`, when
   * omitted. `null` forces a direct connection.
   */
  proxy?: string | null;
  /** Hosts reached directly even when a proxy is configured — curl's `NO_PROXY` rules (R2). */
  proxyBypass?: string | readonly string[] | null;
  [key: string]: unknown;
}
