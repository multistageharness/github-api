/**
 * Query composition, validation, and the final `SearchParams` object.
 *
 * Everything here is pure and prompt-free by construction: logic living inside
 * an awaited prompt callback cannot be unit-tested without a pseudo-TTY.
 */

import type { SafeSearchClient } from '@internal/github-sdk-search';

/**
 * The SDK's `SearchParams` (not re-exported from its entry point), recovered
 * from the client method signature that consumes it.
 */
export type SearchParams = NonNullable<Parameters<SafeSearchClient['searchRepositories']>[0]>;

/** A validator: an error message, or `undefined` when the value is valid. */
export type Validator = (value: string) => string | undefined;

/**
 * Per-endpoint `q` placeholders, lifted from the SDK's `INTERFACE.md`
 * per-type sections. A generic placeholder wastes the prompt — each endpoint
 * accepts different qualifiers.
 */
export const Q_PLACEHOLDERS: Record<string, string> = {
  repositories: 'language:typescript stars:>1000',
  code: 'addClass in:file language:js repo:jquery/jquery',
  commits: 'repo:octocat/Spoon-Knife css',
  issues: 'repo:nodejs/node is:open is:pr label:bug',
  users: 'location:berlin language:go followers:>100',
  labels: 'bug',
  topics: 'ruby',
};

/** A non-empty search query. */
export const validateQuery = (v: string | undefined): string | undefined =>
  !v || !String(v).trim() ? 'Query cannot be empty' : undefined;

/** A positive integer repository id. */
export const validateRepositoryId = (v: string | number): string | undefined =>
  !/^\d+$/.test(String(v).trim()) || Number(v) <= 0
    ? 'Must be a positive integer repo id'
    : undefined;

/** GitHub's hard ceiling is 100; catching it here beats a 422 from the API. */
export const validatePerPage = (v: string | number): string | undefined => {
  const n = Number(v);
  return !Number.isInteger(n) || n < 1 || n > 100 ? 'per_page must be an integer 1–100' : undefined;
};

/** Pages are 1-indexed. */
export const validatePage = (v: string | number): string | undefined => {
  const n = Number(v);
  return !Number.isInteger(n) || n < 1 ? 'page must be an integer >= 1' : undefined;
};

/**
 * GitHub search serves only the first 1000 results of any query. A page past
 * that window is a 422 that reads like a user error, so it is caught here.
 */
export const MAX_SEARCH_RESULTS = 1000;

/**
 * `page × per_page` must stay inside the 1000-result window. Skipped (valid)
 * when either value is itself invalid — its own validator reports that.
 */
export const validateResultWindow = (
  page: string | number,
  perPage: string | number
): string | undefined => {
  const p = Number(page);
  const n = Number(perPage);
  if (!Number.isInteger(p) || !Number.isInteger(n) || p < 1 || n < 1) return undefined;
  return p * n > MAX_SEARCH_RESULTS
    ? `GitHub serves only the first ${MAX_SEARCH_RESULTS} results: page ${p} × per_page ${n} is past that (last page is ${Math.ceil(MAX_SEARCH_RESULTS / n)})`
    : undefined;
};

/** The two sort directions GitHub accepts. */
export const ORDERS: string[] = ['desc', 'asc'];

/** A sort direction. */
export const validateOrder = (v: string): string | undefined =>
  ORDERS.includes(String(v)) ? undefined : `order must be one of: ${ORDERS.join(', ')}`;

/** The file name for the guided file+content code search. */
export const validateFileName = (v: string | undefined): string | undefined =>
  !v || !String(v).trim() ? 'File name cannot be empty' : undefined;

/**
 * The content term for the guided file+content code search.
 *
 * Mandatory: GitHub's `GET /search/code` rejects a qualifiers-only query — at
 * least one bare search term must be present. `filename:foo` alone is not a
 * valid query.
 */
export const validateContentTerm = (v: string | undefined): string | undefined =>
  !v || !String(v).trim()
    ? 'A content term is required — GitHub rejects a qualifiers-only code search'
    : undefined;

/**
 * Compose a GitHub code-search query from a file name and a content term.
 *
 * The file name is passed to the `filename:` qualifier **verbatim after
 * trimming** — it is deliberately not slugified. (Slugification belongs to the
 * `.output/` filename derivation in `output.ts` and must not leak into the
 * query.)
 *
 * @returns e.g. `lint-staged in:file filename:package.json`
 */
export function composeFileContentQuery({
  filename,
  content,
}: {
  filename: string;
  content: string;
}): string {
  return `${String(content).trim()} in:file filename:${String(filename).trim()}`;
}

/** The collected search fields `buildParams` turns into `SearchParams`. */
export interface BuildParamsInput {
  q: string;
  sort?: string | undefined;
  order?: string | undefined;
  perPage?: string | number | undefined;
  page?: string | number | undefined;
  repositoryId?: string | number | undefined;
}

/**
 * Build the `SearchParams` object the SDK receives.
 *
 * Empty/default values are **omitted**, never sent as `undefined`: a stray
 * `sort: undefined` becomes `sort=undefined` in the query string, and GitHub
 * answers with a 422 that reads like a user error.
 *
 * `repository_id` goes **inside** the params object — only the SDK's
 * `search.labels(repositoryId, query, options)` convenience helper is positional.
 */
export function buildParams({
  q,
  sort,
  order,
  perPage,
  page,
  repositoryId,
}: BuildParamsInput): SearchParams {
  const params: SearchParams = { q };
  if (repositoryId !== undefined) params.repository_id = Number(repositoryId);
  if (sort) params.sort = sort;
  // `order` is meaningless without a `sort` — GitHub's default is relevance-ranked.
  if (order && sort) params.order = order;
  if (perPage) params.per_page = Number(perPage);
  if (page) params.page = Number(page);
  return params;
}
