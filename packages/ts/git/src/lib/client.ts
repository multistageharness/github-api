/**
 * @fileoverview HTTP client for the GitHub Git Database API.
 * @module lib/client
 */

import {
  DEFAULT_BASE_URL,
  GitHubHttpError,
  GitHubRestClient,
} from '@internal/github-sdk-fetch-rest-api';

/** Options accepted by the {@link GitHubClient} constructor. */
export interface GitHubClientOptions {
  /** GitHub PAT. Sent as `Authorization: Bearer <token>`; omitted when undefined. */
  token?: string | undefined;
  /** API root. Endpoint paths are appended to this. Defaults to `https://api.github.com`. */
  baseUrl?: string | undefined;
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

/** Author/committer/tagger identity attached to a commit or annotated tag. */
export interface GitPerson {
  name?: string;
  email?: string;
  /** ISO-8601 timestamp. */
  date?: string;
}

/** A single entry in a git tree. */
export interface GitTreeEntry {
  path?: string;
  /** `100644` file, `100755` executable, `040000` tree, `160000` submodule, `120000` symlink. */
  mode?: string;
  /** `blob`, `tree`, or `commit`. */
  type?: string;
  /** SHA of the referenced object; `null` deletes the path. */
  sha?: string | null;
  /** Inline content, as an alternative to `sha`. */
  content?: string;
}

/** Methods that carry a JSON request body. */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Client for the GitHub Git Database API — the raw object store (blobs, trees,
 * commits, refs and annotated tags) backing a repository.
 *
 * The class never reads `process.env` for **its own** options; env resolution
 * belongs to the CLI layer. The transport underneath it does resolve the
 * environment — that is where `GITHUB_PROXY` and `NO_PROXY` are honored
 * (PRD 0002, R13).
 */
export class GitHubClient {
  private readonly token: string | undefined;
  private readonly baseUrl: string;
  /**
   * The transport (PRD 0002, R13).
   *
   * Every outbound request in this package goes through the one fetch layer, so
   * proxying, timeouts, cancellation and rate limiting are configured in one
   * place rather than reimplemented here. Before this it called the global
   * `fetch` directly, which no proxy setting could reach.
   */
  private readonly http: GitHubRestClient;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token;
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.http = new GitHubRestClient({
      // `token: null` rather than an omitted key: this class treats an absent
      // token as "anonymous", and letting the layer resolve `GITHUB_TOKEN`
      // instead would authenticate a request the caller asked to be anonymous.
      token: this.token ?? null,
      baseUrl: this.baseUrl,
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass }),
    });
  }

  /**
   * Perform a raw request against the API. Every capability method is a thin
   * wrapper over this.
   *
   * @throws {Error} when the response status is not 2xx. The message is GitHub's
   *   `message` field when present, otherwise a status-based fallback.
   */
  async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    };

    const sendsBody = body !== undefined && BODY_METHODS.has(method.toUpperCase());
    if (sendsBody) headers['content-type'] = 'application/json';

    try {
      // The absolute URL is passed verbatim rather than rebuilt from a route,
      // so a `baseUrl` carrying a path prefix and an endpoint carrying a query
      // string both keep meaning exactly what they meant before.
      const response = await this.http.request(
        `${method.toUpperCase()} ${this.baseUrl}${endpoint}`,
        {},
        {
          headers,
          ...(sendsBody ? { body } : {}),
          // Matches this package's previous parsing exactly: parse as JSON,
          // fall back to the raw text, and `null` for an empty body.
          responseType: 'json',
        },
      );
      return response.data;
    } catch (error) {
      // The layer's typed errors are mapped back onto this package's contract —
      // a plain `Error` carrying GitHub's own message — so no caller has to
      // learn a new error class because the transport changed.
      if (error instanceof GitHubHttpError) {
        const payload = error.data;
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          typeof (payload as { message?: unknown }).message === 'string'
            ? (payload as { message: string }).message
            : `GitHub API request failed with status ${error.status}`;
        throw new Error(message);
      }
      // A transport failure, or the limiter's own exhausted-budget error, both
      // become this package's plain `Error` — its only error contract.
      if (error instanceof Error) throw new Error(error.message);
      throw error;
    }
  }

  /** Release the transport's limiter and any proxy connection pool. */
  close(): void {
    this.http.close();
  }

  // ── Blobs ────────────────────────────────────────────────────────────────

  /** `POST /repos/{owner}/{repo}/git/blobs` */
  async createBlob(
    owner: string,
    repo: string,
    content: string,
    encoding = 'utf-8'
  ): Promise<unknown> {
    return this.request('POST', `/repos/${owner}/${repo}/git/blobs`, { content, encoding });
  }

  /** `GET /repos/{owner}/{repo}/git/blobs/{sha}` */
  async getBlob(owner: string, repo: string, sha: string): Promise<unknown> {
    return this.request('GET', `/repos/${owner}/${repo}/git/blobs/${sha}`);
  }

  // ── Trees ────────────────────────────────────────────────────────────────

  /** `POST /repos/{owner}/{repo}/git/trees` */
  async createTree(
    owner: string,
    repo: string,
    tree: GitTreeEntry[],
    baseTree?: string
  ): Promise<unknown> {
    const body: { tree: GitTreeEntry[]; base_tree?: string } = { tree };
    if (baseTree) body.base_tree = baseTree;
    return this.request('POST', `/repos/${owner}/${repo}/git/trees`, body);
  }

  /** `GET /repos/{owner}/{repo}/git/trees/{sha}` */
  async getTree(
    owner: string,
    repo: string,
    sha: string,
    recursive = false
  ): Promise<unknown> {
    const query = recursive ? '?recursive=1' : '';
    return this.request('GET', `/repos/${owner}/${repo}/git/trees/${sha}${query}`);
  }

  // ── Commits ──────────────────────────────────────────────────────────────

  /** `POST /repos/{owner}/{repo}/git/commits` */
  async createCommit(
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parents: string[] = [],
    author?: GitPerson | null,
    committer?: GitPerson | null
  ): Promise<unknown> {
    const body: {
      message: string;
      tree: string;
      parents: string[];
      author?: GitPerson;
      committer?: GitPerson;
    } = { message, tree, parents };
    if (author) body.author = author;
    if (committer) body.committer = committer;
    return this.request('POST', `/repos/${owner}/${repo}/git/commits`, body);
  }

  /** `GET /repos/{owner}/{repo}/git/commits/{sha}` */
  async getCommit(owner: string, repo: string, sha: string): Promise<unknown> {
    return this.request('GET', `/repos/${owner}/${repo}/git/commits/${sha}`);
  }

  // ── References ───────────────────────────────────────────────────────────

  /** `POST /repos/{owner}/{repo}/git/refs` */
  async createRef(owner: string, repo: string, ref: string, sha: string): Promise<unknown> {
    return this.request('POST', `/repos/${owner}/${repo}/git/refs`, { ref, sha });
  }

  /** `GET /repos/{owner}/{repo}/git/ref/{ref}` */
  async getRef(owner: string, repo: string, ref: string): Promise<unknown> {
    return this.request('GET', `/repos/${owner}/${repo}/git/ref/${ref}`);
  }

  /** `GET /repos/{owner}/{repo}/git/matching-refs/{ref}` */
  async listMatchingRefs(owner: string, repo: string, ref: string): Promise<unknown> {
    return this.request('GET', `/repos/${owner}/${repo}/git/matching-refs/${ref}`);
  }

  /** `PATCH /repos/{owner}/{repo}/git/refs/{ref}` */
  async updateRef(
    owner: string,
    repo: string,
    ref: string,
    sha: string,
    force = false
  ): Promise<unknown> {
    return this.request('PATCH', `/repos/${owner}/${repo}/git/refs/${ref}`, { sha, force });
  }

  /** `DELETE /repos/{owner}/{repo}/git/refs/{ref}` — resolves `null` (HTTP 204). */
  async deleteRef(owner: string, repo: string, ref: string): Promise<unknown> {
    return this.request('DELETE', `/repos/${owner}/${repo}/git/refs/${ref}`);
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  /**
   * `POST /repos/{owner}/{repo}/git/tags`
   *
   * Creates the tag *object* only. To make it visible, follow up with
   * `createRef('refs/tags/<tag>', <tag-object-sha>)`.
   */
  async createTag(
    owner: string,
    repo: string,
    tag: string,
    message: string,
    object: string,
    type = 'commit',
    tagger?: GitPerson | null
  ): Promise<unknown> {
    const body: {
      tag: string;
      message: string;
      object: string;
      type: string;
      tagger?: GitPerson;
    } = { tag, message, object, type };
    if (tagger) body.tagger = tagger;
    return this.request('POST', `/repos/${owner}/${repo}/git/tags`, body);
  }

  /** `GET /repos/{owner}/{repo}/git/tags/{sha}` */
  async getTag(owner: string, repo: string, sha: string): Promise<unknown> {
    return this.request('GET', `/repos/${owner}/${repo}/git/tags/${sha}`);
  }
}

export default GitHubClient;
