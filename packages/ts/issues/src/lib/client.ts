/**
 * @fileoverview HTTP client for the GitHub Issues API.
 * @module lib/client
 */

import {
  DEFAULT_BASE_URL,
  GitHubFetchError,
  GitHubHttpError,
  GitHubRestClient,
} from '@internal/github-sdk-fetch-rest-api';
import { isRateLimitError } from '@internal/github-sdk-ratelimit';

import { getAuthHeader } from './auth.js';
import {
  ApiError,
  AuthError,
  ConflictError,
  NetworkError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
} from '../utils/errors.js';
import { parseLinkHeader, type LinkMap } from '../utils/pagination.js';

/** Constructor options. Permissive by design — extra keys are retained. */
export interface IssuesClientOptions {
  /** GitHub token; sent as `Authorization: token <auth>`. */
  auth?: string | undefined;
  /** API base URL. Defaults to `https://api.github.com`. */
  baseUrl?: string | undefined;
  /** Repository owner; required for repo-scoped methods. */
  owner?: string | undefined;
  /** Repository name; required for repo-scoped methods. */
  repo?: string | undefined;
  /**
   * HTTP proxy every request is routed through (PRD 0002, R6, R13).
   *
   * Resolved from `GITHUB_PROXY`, then `https_proxy`/`HTTPS_PROXY`, when
   * omitted. `null` forces a direct connection.
   */
  proxy?: string | null | undefined;
  /** Hosts reached directly even when a proxy is configured — curl's `NO_PROXY` rules (R2). */
  proxyBypass?: string | readonly string[] | null | undefined;
  [key: string]: unknown;
}

/** A list result carrying its pagination links, when `includePagination` is set. */
export interface ClientPage<T = unknown> {
  data: T;
  links: LinkMap;
}

/** Per-request overrides for {@link IssuesClient.request}. */
export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Query parameters; `null`/`undefined` entries are dropped. */
  params?: Record<string, unknown>;
  /** Resolve to `{ data, links }` instead of the raw payload. */
  includePagination?: boolean;
}

/** Query keys that are pagination controls rather than filters. */
const RESERVED_OPTION_KEYS = new Set(['includePagination']);

/** Read GitHub's `message` field off an unknown JSON body. */
function messageOf(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const value = (body as { message?: unknown }).message;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/** Map a non-2xx status onto the package's error taxonomy. */
function errorForStatus(status: number, message: string, response: unknown): ApiError {
  switch (status) {
    case 401:
      return new AuthError(message);
    case 403:
      return new PermissionError(message);
    case 404:
      // NotFoundError formats its argument as "<resource> not found", so pass
      // GitHub's message as the resource rather than double-wrapping it.
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 422: {
      const errors = (response as { errors?: unknown })?.errors;
      return new ValidationError(message, Array.isArray(errors) ? errors : [], response);
    }
    default:
      return new ApiError(message, status, response);
  }
}

/**
 * Client for the GitHub Issues API, covering issues, comments, labels,
 * assignees, and milestones.
 */
export class IssuesClient {
  readonly options: IssuesClientOptions;
  readonly auth: string | undefined;
  readonly baseUrl: string;
  readonly owner: string | undefined;
  readonly repo: string | undefined;
  /**
   * The transport (PRD 0002, R13).
   *
   * Every outbound request in this package goes through the one fetch layer, so
   * a `--proxy` flag or a `HTTPS_PROXY` reaches it. Before this it called the
   * global `fetch` directly, which no proxy setting could reach.
   */
  private readonly http: GitHubRestClient;

  constructor(options: IssuesClientOptions = {}) {
    this.options = options;
    this.auth = options.auth;
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.owner = options.owner;
    this.repo = options.repo;
    this.http = new GitHubRestClient({
      // This class builds its own `Authorization` through `getAuthHeader`, which
      // sends `token <auth>` rather than `Bearer <auth>`. `token: null` keeps the
      // layer from adding a second, differently-schemed one from the
      // environment.
      token: null,
      baseUrl: this.baseUrl,
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });
  }

  /**
   * The `{owner}/{repo}` segment for repo-scoped endpoints.
   *
   * @throws {ValidationError} when either is unset.
   */
  private repoPath(): string {
    if (!this.owner || !this.repo) {
      throw new ValidationError('Repository owner and name are required');
    }
    return `${this.owner}/${this.repo}`;
  }

  /** Serialize filter options into a query string, dropping empty values. */
  private query(options: Record<string, unknown> = {}): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options)) {
      if (RESERVED_OPTION_KEYS.has(key)) continue;
      if (value === null || value === undefined || value === '') continue;
      search.append(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : '';
  }

  /**
   * The low-level request every method routes through, and the documented
   * escape hatch.
   *
   * @throws {ApiError} subclass on a non-2xx response
   * @throws {NetworkError} on a transport failure
   */
  async request(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    const { method = 'GET', body, params, includePagination } = options;

    const url = `${this.baseUrl}${endpoint}${params ? this.query(params) : ''}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': '@internal/github-sdk-issues',
    };
    const authorization = getAuthHeader(this.auth);
    if (authorization) headers['Authorization'] = authorization;

    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let payload: unknown;
    let linkHeader: string | null;
    try {
      // The absolute URL goes through verbatim, so a `baseUrl` with a path
      // prefix and an endpoint with a query string both keep meaning what they
      // meant before this package used the fetch layer.
      const response = await this.http.request(`${method.toUpperCase()} ${url}`, {}, {
        headers,
        ...(body === undefined ? {} : { body }),
        // Matches this package's previous parsing exactly: parse as JSON, fall
        // back to the raw text, `null` for an empty body.
        responseType: 'json',
      });
      payload = response.data;
      linkHeader = response.headers.get('link');
    } catch (error) {
      // The limiter classifies an exhausted budget and raises before the
      // HTTP-error path is reached — the same condition the header check below
      // used to catch, so it maps onto the same error class.
      if (isRateLimitError(error)) {
        throw new RateLimitError(
          'API rate limit exceeded',
          error.resetAt === null ? 0 : error.resetAt.getTime(),
        );
      }
      // The layer's typed errors are mapped back onto this package's own
      // taxonomy, so no caller learns a new error class because the transport
      // changed.
      if (error instanceof GitHubHttpError) {
        const data = error.data;
        const message =
          messageOf(data) ??
          error.response.statusText ??
          `Request failed with status ${error.status}`;

        // A 403 with the remaining counter at zero is a rate limit, not a
        // permission problem — the distinction changes what a caller should do.
        if (error.status === 403 && error.headers.get('x-ratelimit-remaining') === '0') {
          throw new RateLimitError(
            'API rate limit exceeded',
            // `x-ratelimit-reset` is epoch seconds; `RateLimitError` stores ms.
            Number(error.headers.get('x-ratelimit-reset') ?? 0) * 1000,
          );
        }

        throw errorForStatus(error.status, message, data);
      }
      // A transport failure never reached GitHub, so it has no status to map.
      // A dead proxy lands here too, and the layer's message names it (N9).
      if (error instanceof GitHubFetchError) {
        throw new NetworkError(`Network error: ${error.message}`);
      }
      throw error;
    }

    if (includePagination) {
      return { data: payload, links: parseLinkHeader(linkHeader) };
    }

    return payload;
  }

  /** Release the transport's limiter and any proxy connection pool. */
  close(): void {
    this.http.close();
  }

  // ── Issues ───────────────────────────────────────────────────────────────

  /** `GET /issues` — issues assigned to the authenticated user. */
  async list(options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('/issues', { params: options, ...this.paging(options) });
  }

  /** `GET /orgs/{org}/issues` */
  async listForOrg(org: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(`/orgs/${org}/issues`, { params: options, ...this.paging(options) });
  }

  /** `GET /repos/{owner}/{repo}/issues` */
  async listForRepo(options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues`, {
      params: options,
      ...this.paging(options),
    });
  }

  /** `GET /repos/{owner}/{repo}/issues/{issueNumber}` */
  async get(issueNumber: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}`);
  }

  /** `POST /repos/{owner}/{repo}/issues` */
  async create(data: unknown): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues`, { method: 'POST', body: data });
  }

  /** `PATCH /repos/{owner}/{repo}/issues/{issueNumber}` — also closes/reopens. */
  async update(issueNumber: number | string, data: unknown): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: data,
    });
  }

  /** `PUT /repos/{owner}/{repo}/issues/{issueNumber}/lock` */
  async lock(issueNumber: number | string, lockReason?: string | null): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/lock`, {
      method: 'PUT',
      body: lockReason ? { lock_reason: lockReason } : {},
    });
  }

  /** `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/lock` */
  async unlock(issueNumber: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/lock`, {
      method: 'DELETE',
    });
  }

  /** `GET /repos/{owner}/{repo}/issues/{issueNumber}/events` */
  async listEvents(issueNumber: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/events`);
  }

  /** `GET /repos/{owner}/{repo}/issues/{issueNumber}/timeline` */
  async listTimelineEvents(issueNumber: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/timeline`);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  /** `GET /repos/{owner}/{repo}/issues/{issueNumber}/comments` */
  async listComments(
    issueNumber: number | string,
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/comments`, {
      params: options,
      ...this.paging(options),
    });
  }

  /** `GET /repos/{owner}/{repo}/issues/comments/{commentId}` */
  async getComment(commentId: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/comments/${commentId}`);
  }

  /** `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` */
  async createComment(issueNumber: number | string, body: string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: { body },
    });
  }

  /** `PATCH /repos/{owner}/{repo}/issues/comments/{commentId}` */
  async updateComment(commentId: number | string, body: string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/comments/${commentId}`, {
      method: 'PATCH',
      body: { body },
    });
  }

  /** `DELETE /repos/{owner}/{repo}/issues/comments/{commentId}` */
  async deleteComment(commentId: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/comments/${commentId}`, {
      method: 'DELETE',
    });
  }

  // ── Labels ───────────────────────────────────────────────────────────────

  /** `GET /repos/{owner}/{repo}/issues/{issueNumber}/labels` */
  async listLabelsOnIssue(issueNumber: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/labels`);
  }

  /** `GET /repos/{owner}/{repo}/labels` */
  async listLabelsForRepo(): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/labels`);
  }

  /** `POST /repos/{owner}/{repo}/issues/{issueNumber}/labels` — adds to existing. */
  async addLabels(issueNumber: number | string, labels: string[]): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/labels`, {
      method: 'POST',
      body: { labels },
    });
  }

  /** `PUT /repos/{owner}/{repo}/issues/{issueNumber}/labels` — replaces all. */
  async setLabels(issueNumber: number | string, labels: string[]): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/labels`, {
      method: 'PUT',
      body: { labels },
    });
  }

  /** `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/labels/{label}` */
  async removeLabel(issueNumber: number | string, label: string): Promise<unknown> {
    return this.request(
      `/repos/${this.repoPath()}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      { method: 'DELETE' }
    );
  }

  // ── Assignees ────────────────────────────────────────────────────────────

  /** `GET /repos/{owner}/{repo}/assignees` */
  async listAssignees(): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/assignees`);
  }

  /** `POST /repos/{owner}/{repo}/issues/{issueNumber}/assignees` */
  async addAssignees(issueNumber: number | string, assignees: string[]): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/assignees`, {
      method: 'POST',
      body: { assignees },
    });
  }

  /** `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/assignees` */
  async removeAssignees(issueNumber: number | string, assignees: string[]): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/issues/${issueNumber}/assignees`, {
      method: 'DELETE',
      body: { assignees },
    });
  }

  // ── Milestones ───────────────────────────────────────────────────────────

  /** `GET /repos/{owner}/{repo}/milestones` */
  async listMilestones(options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/milestones`, {
      params: options,
      ...this.paging(options),
    });
  }

  /** `POST /repos/{owner}/{repo}/milestones` */
  async createMilestone(data: unknown): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/milestones`, { method: 'POST', body: data });
  }

  /** `PATCH /repos/{owner}/{repo}/milestones/{milestoneNumber}` */
  async updateMilestone(
    milestoneNumber: number | string,
    data: unknown
  ): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/milestones/${milestoneNumber}`, {
      method: 'PATCH',
      body: data,
    });
  }

  /** `DELETE /repos/{owner}/{repo}/milestones/{milestoneNumber}` */
  async deleteMilestone(milestoneNumber: number | string): Promise<unknown> {
    return this.request(`/repos/${this.repoPath()}/milestones/${milestoneNumber}`, {
      method: 'DELETE',
    });
  }

  /** Forward the caller's `includePagination` flag to {@link request}. */
  private paging(options: Record<string, unknown>): { includePagination?: boolean } {
    return options['includePagination'] ? { includePagination: true } : {};
  }
}

export default IssuesClient;
