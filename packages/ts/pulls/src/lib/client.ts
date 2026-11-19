/**
 * Reconstructed `src/lib/client.ts` for `@internal/github-sdk-pulls`.
 *
 * `PullRequestClient` — every capability in INTERFACE.md § Capabilities, over the GitHub REST API.
 *
 * Two details are load-bearing and easy to get subtly wrong:
 *
 *  - **`Authorization: token <auth>`**, not `Bearer`. INTERFACE.md is explicit, and GitHub accepts
 *    both for PATs but not for every credential type.
 *  - **`request()` returns `null`** on 204 *or* `content-length: 0`. A `.json()` on an empty body
 *    throws a `SyntaxError` that surfaces far from its cause; `isMerged` depends on the 204 path.
 *
 * Error mapping is delegated wholesale to `handleApiError` in `../utils/errors.js`, which already
 * exists in the package and encodes the status → class table. Re-deriving it here would create a
 * second mapping that eventually disagrees with the exported error classes.
 */

import {
  GitHubFetchError,
  GitHubHttpError,
  GitHubRestClient,
} from '@internal/github-sdk-fetch-rest-api';
import { isRateLimitError } from '@internal/github-sdk-ratelimit';

import { ApiError, RateLimitError, ValidationError, handleApiError } from '../utils/errors.js';
import type {
  Commit,
  CreateData,
  ListOptions,
  MergeOptions,
  MergeResult,
  PageOptions,
  PullRequest,
  PullRequestClientOptions,
  PullRequestFile,
  RepoTarget,
  ResolvedRepo,
  Review,
  ReviewComment,
  ReviewCommentData,
  ReviewCommentListOptions,
  ReviewData,
  ReviewerData,
  SearchOptions,
  SearchResult,
  UpdateBranchOptions,
  UpdateData,
} from './types.js';

export const DEFAULT_BASE_URL = 'https://api.github.com';

/** The `Accept` GitHub's v3 REST API expects. */
const ACCEPT = 'application/vnd.github.v3+json';

/**
 * A GitHub Pull Requests API client.
 *
 * `owner` and `repo` given to the constructor are defaults; every method takes per-call overrides.
 */
export class PullRequestClient {
  baseUrl: string;
  auth: string | null | undefined;
  owner: string | undefined;
  repo: string | undefined;
  /**
   * The transport (PRD 0002, R13).
   *
   * This package used `node-fetch`, which honors no undici dispatcher and so
   * could not be proxied by anything this repository configures — the gap that
   * made `gh-pr --proxy` the one flag of eleven that would have done nothing.
   * Every request now goes through the one fetch layer, so it proxies like the
   * rest.
   *
   * What did **not** change: the `Authorization: token <auth>` scheme, the
   * `null`-on-204 rule, and the error taxonomy. Those are this package's
   * contract and are still applied here.
   */
  private readonly http: GitHubRestClient;

  constructor(options: PullRequestClientOptions = {}) {
    this.baseUrl = (options.baseUrl as string) || DEFAULT_BASE_URL;
    // `'auth' in options` rather than `options.auth ?? env`: passing `auth: null` explicitly means
    // "unauthenticated even though the environment has a token", and coalescing would ignore that.
    this.auth = 'auth' in options ? options.auth : process.env.GITHUB_TOKEN;
    this.owner = options.owner as string | undefined;
    this.repo = options.repo as string | undefined;

    this.http = new GitHubRestClient({
      // This class builds `Authorization: token <auth>` itself — INTERFACE.md is
      // explicit that it is `token`, not `Bearer`. `token: null` stops the layer
      // resolving a second one from the environment under the other scheme.
      token: null,
      baseUrl: this.baseUrl,
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });

    if (!this.auth) {
      console.warn('No authentication token provided. API rate limits will be restrictive.');
    }
  }

  /** Release the transport's limiter and any proxy connection pool. */
  close(): void {
    this.http.close();
  }

  /**
   * Resolve and validate the repository for a call.
   *
   * Throws rather than defaulting, because there is no safe default: guessing a repository would
   * mean reading — or worse, acting on — the wrong one.
   */
  validateRepo(options: RepoTarget = {}): ResolvedRepo {
    const owner = options.owner || this.owner;
    const repo = options.repo || this.repo;

    if (!owner) throw new ValidationError('Repository owner is required');
    if (!repo) throw new ValidationError('Repository name is required');

    return { owner, repo };
  }

  /** Build a query string from defined values only, so an unset option is absent rather than empty. */
  buildQuery(params: Record<string, unknown> = {}): string {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.append(key, String(value));
    }

    const query = search.toString();
    return query ? `?${query}` : '';
  }

  /**
   * The low-level request. Every method routes through it, and it is the documented escape hatch.
   *
   * @param endpoint a path (prefixed with `baseUrl`) or an absolute URL
   */
  async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Accept: ACCEPT,
      'Content-Type': 'application/json',
      'User-Agent': 'github-sdk-pulls',
    };
    // Only when present: sending an empty Authorization header is worse than sending none — GitHub
    // treats it as a malformed credential rather than as anonymous.
    if (this.auth) headers.Authorization = `token ${this.auth}`;

    let response: Response;
    try {
      const result = await this.http.request<unknown>(`${method.toUpperCase()} ${url}`, {}, {
        headers,
        ...(body === undefined ? {} : { body }),
        // The layer is told not to read the body: the `204`-or-`content-length:
        // 0` rule below is this package's, and `isMerged` depends on it. Handing
        // the body over twice is how a stream gets consumed before its owner
        // reads it.
        responseType: 'stream',
      });
      response = result.response;
    } catch (error) {
      // The limiter classifies a 403 whose remaining counter is zero as a rate
      // limit and raises before the HTTP-error path is reached. That is the same
      // condition this package's `handleApiError` used to detect off the
      // headers, so it maps onto the same error class — a caller must not have
      // to learn which layer noticed first.
      if (isRateLimitError(error)) {
        throw new RateLimitError(
          'API rate limit exceeded',
          error.resetAt === null ? null : error.resetAt.getTime(),
          null,
        );
      }
      // A non-2xx still has a response, and it goes through this package's own
      // status → error-class table rather than the layer's.
      if (error instanceof GitHubHttpError) {
        await handleApiError(error.response);
        throw error; // `handleApiError` always throws; this informs the compiler.
      }
      // A transport failure is not an HTTP status, so it cannot go through `handleApiError`.
      // `status: 0` is the package's documented signal for it. A dead proxy lands
      // here, and the layer's message names the proxy rather than GitHub (N9).
      if (error instanceof GitHubFetchError) {
        throw new ApiError(`Network error: ${error.message}`, 0, null);
      }
      throw new ApiError(`Network error: ${(error as Error).message}`, 0, null);
    }

    // 204, or a 200 that genuinely carries nothing. `.json()` on either throws a SyntaxError that
    // surfaces far from its cause.
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null;
    }

    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new ApiError(`Failed to parse response: ${(error as Error).message}`, response.status, null);
    }
  }

  /* ---------------------------------------------------------------- *
   * Pull requests
   * ---------------------------------------------------------------- */

  async list(options: ListOptions = {}): Promise<PullRequest[]> {
    const { owner, repo } = this.validateRepo(options);

    const query = this.buildQuery({
      state: options.state ?? 'open',
      sort: options.sort ?? 'created',
      direction: options.direction ?? 'desc',
      per_page: options.per_page ?? 30,
      page: options.page ?? 1,
      base: options.base,
      head: options.head,
    });

    return (await this.request('GET', `/repos/${owner}/${repo}/pulls${query}`)) as PullRequest[];
  }

  /**
   * Auto-paginating `list`.
   *
   * Stops on a short page rather than on an empty one: GitHub returns fewer than `per_page` items
   * only on the last page, so waiting for an empty page costs one extra round trip every time.
   */
  async *listAll(options: ListOptions = {}): AsyncGenerator<PullRequest, void, unknown> {
    const perPage = options.per_page ?? 100;
    let page = 1;

    for (;;) {
      const results = await this.list({ ...options, per_page: perPage, page });
      if (!Array.isArray(results) || results.length === 0) return;

      for (const pull of results) yield pull;

      if (results.length < perPage) return;
      page += 1;
    }
  }

  async get(pullNumber: number, options: RepoTarget = {}): Promise<PullRequest> {
    const { owner, repo } = this.validateRepo(options);
    return (await this.request('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}`)) as PullRequest;
  }

  async create(data: CreateData = {}): Promise<PullRequest> {
    const { owner, repo } = this.validateRepo(data);

    // `issue` creates a PR from an existing issue, which supplies the title — so the usual three
    // required fields do not apply in that mode.
    if (data.issue === undefined && (!data.title || !data.head || !data.base)) {
      throw new ValidationError('Title, head, and base are required to create a pull request');
    }

    const body: Record<string, unknown> = {};
    for (const key of ['title', 'head', 'base', 'body', 'draft', 'issue', 'maintainer_can_modify'] as const) {
      if (data[key] !== undefined) body[key] = data[key];
    }

    return (await this.request('POST', `/repos/${owner}/${repo}/pulls`, body)) as PullRequest;
  }

  async update(pullNumber: number, data: UpdateData = {}): Promise<PullRequest> {
    const { owner, repo } = this.validateRepo(data);

    const body: Record<string, unknown> = {};
    for (const key of ['title', 'body', 'base', 'state', 'maintainer_can_modify'] as const) {
      if (data[key] !== undefined) body[key] = data[key];
    }

    return (await this.request(
      'PATCH',
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      body,
    )) as PullRequest;
  }

  async updateBranch(pullNumber: number, options: UpdateBranchOptions = {}): Promise<unknown> {
    const { owner, repo } = this.validateRepo(options);

    const body: Record<string, unknown> = {};
    if (options.expected_head_sha !== undefined) body.expected_head_sha = options.expected_head_sha;

    return this.request('PUT', `/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`, body);
  }

  /* ---------------------------------------------------------------- *
   * Merge
   * ---------------------------------------------------------------- */

  async merge(pullNumber: number, options: MergeOptions = {}): Promise<MergeResult> {
    const { owner, repo } = this.validateRepo(options);

    const body: Record<string, unknown> = { merge_method: options.merge_method ?? 'merge' };
    for (const key of ['commit_title', 'commit_message', 'sha'] as const) {
      if (options[key] !== undefined) body[key] = options[key];
    }

    return (await this.request(
      'PUT',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      body,
    )) as MergeResult;
  }

  /**
   * Whether a pull request is merged.
   *
   * GitHub answers this endpoint with 204 for merged and 404 for not — so a 404 is an *answer* here
   * rather than an error, and only a 404 is swallowed. Anything else re-throws, because an auth
   * failure reported as "not merged" would be a confident wrong answer.
   */
  async isMerged(pullNumber: number, options: RepoTarget = {}): Promise<boolean> {
    const { owner, repo } = this.validateRepo(options);

    try {
      await this.request('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`);
      return true;
    } catch (error) {
      if ((error as ApiError).status === 404) return false;
      throw error;
    }
  }

  /* ---------------------------------------------------------------- *
   * Commits and files
   * ---------------------------------------------------------------- */

  async listCommits(pullNumber: number, options: PageOptions = {}): Promise<Commit[]> {
    const { owner, repo } = this.validateRepo(options);
    const query = this.buildQuery({ per_page: options.per_page ?? 30, page: options.page ?? 1 });

    return (await this.request(
      'GET',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/commits${query}`,
    )) as Commit[];
  }

  async listFiles(pullNumber: number, options: PageOptions = {}): Promise<PullRequestFile[]> {
    const { owner, repo } = this.validateRepo(options);
    const query = this.buildQuery({ per_page: options.per_page ?? 30, page: options.page ?? 1 });

    return (await this.request(
      'GET',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files${query}`,
    )) as PullRequestFile[];
  }

  /* ---------------------------------------------------------------- *
   * Reviews
   * ---------------------------------------------------------------- */

  async listReviews(pullNumber: number, options: PageOptions = {}): Promise<Review[]> {
    const { owner, repo } = this.validateRepo(options);
    const query = this.buildQuery({ per_page: options.per_page ?? 30, page: options.page ?? 1 });

    return (await this.request(
      'GET',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews${query}`,
    )) as Review[];
  }

  async createReview(pullNumber: number, reviewData: ReviewData = {}): Promise<Review> {
    const { owner, repo } = this.validateRepo(reviewData);

    // Forwarded verbatim, minus the routing keys — INTERFACE.md documents this as a free-form
    // GitHub payload, so filtering it to a known field list would reject valid requests.
    const { owner: _owner, repo: _repo, ...body } = reviewData;

    return (await this.request(
      'POST',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
      body,
    )) as Review;
  }

  /* ---------------------------------------------------------------- *
   * Review comments
   * ---------------------------------------------------------------- */

  async listReviewComments(
    pullNumber: number,
    options: ReviewCommentListOptions = {},
  ): Promise<ReviewComment[]> {
    const { owner, repo } = this.validateRepo(options);

    const query = this.buildQuery({
      sort: options.sort ?? 'created',
      direction: options.direction ?? 'desc',
      per_page: options.per_page ?? 30,
      page: options.page ?? 1,
      since: options.since,
    });

    return (await this.request(
      'GET',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/comments${query}`,
    )) as ReviewComment[];
  }

  async createReviewComment(
    pullNumber: number,
    commentData: ReviewCommentData = {},
  ): Promise<ReviewComment> {
    const { owner, repo } = this.validateRepo(commentData);
    const { owner: _owner, repo: _repo, ...body } = commentData;

    return (await this.request(
      'POST',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
      body,
    )) as ReviewComment;
  }

  /* ---------------------------------------------------------------- *
   * Requested reviewers
   * ---------------------------------------------------------------- */

  async requestReviewers(pullNumber: number, reviewerData: ReviewerData = {}): Promise<PullRequest> {
    const { owner, repo } = this.validateRepo(reviewerData);
    const { owner: _owner, repo: _repo, ...body } = reviewerData;

    return (await this.request(
      'POST',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
      body,
    )) as PullRequest;
  }

  async removeRequestedReviewers(
    pullNumber: number,
    reviewerData: ReviewerData = {},
  ): Promise<PullRequest> {
    const { owner, repo } = this.validateRepo(reviewerData);
    const { owner: _owner, repo: _repo, ...body } = reviewerData;

    // A DELETE with a body — unusual, but it is what this GitHub endpoint takes.
    return (await this.request(
      'DELETE',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
      body,
    )) as PullRequest;
  }

  /* ---------------------------------------------------------------- *
   * Search
   * ---------------------------------------------------------------- */

  /**
   * Search pull requests through the issues-search endpoint.
   *
   * Repository-scoped by nothing: `q` carries the whole query, including any `repo:owner/name`
   * qualifier, so this method deliberately does **not** call `validateRepo`.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const search = this.buildQuery({
      q: query,
      sort: options.sort ?? 'created',
      order: options.order ?? 'desc',
      per_page: options.per_page ?? 30,
      page: options.page ?? 1,
    });

    return (await this.request('GET', `/search/issues${search}`)) as SearchResult;
  }
}

export default PullRequestClient;
