/**
 * @fileoverview The GitHub Teams API client. Faithful TypeScript port of the
 * source `client.mjs`, preserving method names, signatures, URL shapes,
 * validation, headers, and the prototype-method named exports.
 * @module client
 */

import {
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  type GitHubProxyOptions,
} from '@internal/github-sdk-fetch-rest-api';
import { request, type RequestOptions } from './utils/http.js';
import { buildQueryString } from './utils/query.js';
import { validateOptions } from './utils/validation.js';

/**
 * Options accepted by the {@link TeamsClient} constructor.
 */
export interface TeamsClientOptions extends GitHubProxyOptions {
  token?: unknown;
  baseURL?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Generic list/pagination options.
 */
export type ListOptions = Record<string, unknown>;

class TeamsClient {
  token: string;
  baseURL: string;
  baseUrl: string;
  headers: Record<string, string>;

  constructor(options: TeamsClientOptions = {}) {
    // Validate token requirement - be strict about requiring a token in options
    if (!options.token) {
      throw new Error(
        'GitHub token is required. Provide token in options or set GITHUB_TOKEN environment variable.'
      );
    }

    // Validate token type
    if (options.token !== undefined && typeof options.token !== 'string') {
      throw new Error('Token must be a string');
    }

    this.token = options.token;
    this.baseURL = options.baseURL || DEFAULT_BASE_URL; // Change baseUrl to baseURL to match tests
    this.baseUrl = this.baseURL; // Keep backwards compatibility
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': DEFAULT_API_VERSION,
      ...options.headers
    };

    if (this.token) {
      this.headers['Authorization'] = `Bearer ${this.token}`;
    }

    this.#proxy = options.proxy;
    this.#proxyBypass = options.proxyBypass;
  }

  /**
   * The proxy this client's requests take (PRD 0002, R6, R8).
   *
   * `request` is a free function with no client object to hang state off, so
   * every call site would otherwise have to carry these.
   * {@link TeamsClient.#request} is where that happens once rather than fifteen
   * times — the kind of repetition that ends with one method quietly not
   * proxying.
   */
  readonly #proxy: string | null | undefined;
  readonly #proxyBypass: string | readonly string[] | null | undefined;

  /** Issue one request with this client's proxy settings applied. */
  #request(options: Omit<RequestOptions, 'proxy' | 'proxyBypass'>): Promise<unknown> {
    return request({
      ...options,
      // Omitted keys rather than `undefined` values: an unset proxy is resolved
      // from the environment, an explicit `null` forces direct (R4).
      ...(this.#proxy === undefined ? {} : { proxy: this.#proxy }),
      ...(this.#proxyBypass === undefined ? {} : { proxyBypass: this.#proxyBypass })
    });
  }

  async listTeams(org: string, options: ListOptions = {}): Promise<unknown> {
    validateOptions(options, ['per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams${query}`,
      headers: this.headers
    });
  }

  async createTeam(org: string, data: unknown): Promise<unknown> {
    return this.#request({
      method: 'POST',
      url: `${this.baseURL}/orgs/${org}/teams`,
      headers: this.headers,
      body: data
    });
  }

  async getTeam(org: string, teamSlug: string): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}`,
      headers: this.headers
    });
  }

  async updateTeam(org: string, teamSlug: string, data: unknown): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    if (!data) {
      throw new Error('Data parameter is required');
    }
    return this.#request({
      method: 'PATCH',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}`,
      headers: this.headers,
      body: data
    });
  }

  async deleteTeam(org: string, teamSlug: string): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    return this.#request({
      method: 'DELETE',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}`,
      headers: this.headers
    });
  }

  async listTeamMembers(
    org: string,
    teamSlug: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    validateOptions(options, ['role', 'per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/members${query}`,
      headers: this.headers
    });
  }

  async addTeamMember(
    org: string,
    teamSlug: string,
    username: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    if (!username) {
      throw new Error('Username parameter is required');
    }
    return this.#request({
      method: 'PUT',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/memberships/${username}`,
      headers: this.headers,
      body: options
    });
  }

  async removeTeamMember(org: string, teamSlug: string, username: string): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    if (!username) {
      throw new Error('Username parameter is required');
    }
    return this.#request({
      method: 'DELETE',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/memberships/${username}`,
      headers: this.headers
    });
  }

  async getTeamMembership(org: string, teamSlug: string, username: string): Promise<unknown> {
    if (!org || !teamSlug) {
      throw new Error('Both org and team parameters are required');
    }
    if (!username) {
      throw new Error('Username parameter is required');
    }
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/memberships/${username}`,
      headers: this.headers
    });
  }

  async listTeamRepos(
    org: string,
    teamSlug: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    validateOptions(options, ['per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/repos${query}`,
      headers: this.headers
    });
  }

  async addTeamRepo(
    org: string,
    teamSlug: string,
    owner: string,
    repo: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    return this.#request({
      method: 'PUT',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
      headers: this.headers,
      body: options
    });
  }

  async removeTeamRepo(
    org: string,
    teamSlug: string,
    owner: string,
    repo: string
  ): Promise<unknown> {
    return this.#request({
      method: 'DELETE',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
      headers: this.headers
    });
  }

  async checkTeamRepo(
    org: string,
    teamSlug: string,
    owner: string,
    repo: string
  ): Promise<unknown> {
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
      headers: this.headers
    });
  }

  async listTeamProjects(
    org: string,
    teamSlug: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    validateOptions(options, ['per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/projects${query}`,
      headers: {
        ...this.headers,
        Accept: 'application/vnd.github.inertia-preview+json'
      }
    });
  }

  async addTeamProject(
    org: string,
    teamSlug: string,
    projectId: string | number,
    options: ListOptions = {}
  ): Promise<unknown> {
    return this.#request({
      method: 'PUT',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/projects/${projectId}`,
      headers: {
        ...this.headers,
        Accept: 'application/vnd.github.inertia-preview+json'
      },
      body: options
    });
  }

  async removeTeamProject(
    org: string,
    teamSlug: string,
    projectId: string | number
  ): Promise<unknown> {
    return this.#request({
      method: 'DELETE',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/projects/${projectId}`,
      headers: {
        ...this.headers,
        Accept: 'application/vnd.github.inertia-preview+json'
      }
    });
  }

  async checkTeamProject(
    org: string,
    teamSlug: string,
    projectId: string | number
  ): Promise<unknown> {
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/projects/${projectId}`,
      headers: {
        ...this.headers,
        Accept: 'application/vnd.github.inertia-preview+json'
      }
    });
  }

  async listTeamDiscussions(
    org: string,
    teamSlug: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    validateOptions(options, ['direction', 'per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions${query}`,
      headers: this.headers
    });
  }

  async createTeamDiscussion(org: string, teamSlug: string, data: unknown): Promise<unknown> {
    return this.#request({
      method: 'POST',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions`,
      headers: this.headers,
      body: data
    });
  }

  async getTeamDiscussion(
    org: string,
    teamSlug: string,
    discussionNumber: string | number
  ): Promise<unknown> {
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}`,
      headers: this.headers
    });
  }

  async updateTeamDiscussion(
    org: string,
    teamSlug: string,
    discussionNumber: string | number,
    data: unknown
  ): Promise<unknown> {
    return this.#request({
      method: 'PATCH',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}`,
      headers: this.headers,
      body: data
    });
  }

  async deleteTeamDiscussion(
    org: string,
    teamSlug: string,
    discussionNumber: string | number
  ): Promise<unknown> {
    return this.#request({
      method: 'DELETE',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}`,
      headers: this.headers
    });
  }

  async listDiscussionComments(
    org: string,
    teamSlug: string,
    discussionNumber: string | number,
    options: ListOptions = {}
  ): Promise<unknown> {
    validateOptions(options, ['direction', 'per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments${query}`,
      headers: this.headers
    });
  }

  async createDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: string | number,
    data: unknown
  ): Promise<unknown> {
    return this.#request({
      method: 'POST',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments`,
      headers: this.headers,
      body: data
    });
  }

  async getDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: string | number,
    commentNumber: string | number
  ): Promise<unknown> {
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments/${commentNumber}`,
      headers: this.headers
    });
  }

  async updateDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: string | number,
    commentNumber: string | number,
    data: unknown
  ): Promise<unknown> {
    return this.#request({
      method: 'PATCH',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments/${commentNumber}`,
      headers: this.headers,
      body: data
    });
  }

  async deleteDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: string | number,
    commentNumber: string | number
  ): Promise<unknown> {
    return this.#request({
      method: 'DELETE',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments/${commentNumber}`,
      headers: this.headers
    });
  }

  async listChildTeams(
    org: string,
    teamSlug: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    validateOptions(options, ['per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/teams${query}`,
      headers: this.headers
    });
  }

  async listTeamsForUser(username: string, options: ListOptions = {}): Promise<unknown> {
    validateOptions(options, ['per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/users/${username}/teams${query}`,
      headers: this.headers
    });
  }

  async listPendingInvitations(
    org: string,
    teamSlug: string,
    options: ListOptions = {}
  ): Promise<unknown> {
    validateOptions(options, ['per_page', 'page']);
    const query = buildQueryString(options);
    return this.#request({
      method: 'GET',
      url: `${this.baseURL}/orgs/${org}/teams/${teamSlug}/invitations${query}`,
      headers: this.headers
    });
  }
}

export default TeamsClient;

export const {
  listTeams,
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
  getTeamMembership,
  listTeamRepos,
  addTeamRepo,
  removeTeamRepo,
  checkTeamRepo,
  listTeamProjects,
  addTeamProject,
  removeTeamProject,
  checkTeamProject,
  listTeamDiscussions,
  createTeamDiscussion,
  getTeamDiscussion,
  updateTeamDiscussion,
  deleteTeamDiscussion,
  listDiscussionComments,
  createDiscussionComment,
  getDiscussionComment,
  updateDiscussionComment,
  deleteDiscussionComment,
  listChildTeams,
  listTeamsForUser,
  listPendingInvitations
} = TeamsClient.prototype;
