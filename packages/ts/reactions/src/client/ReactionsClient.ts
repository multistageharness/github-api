/**
 * GitHub Reactions API Client
 * @module client/ReactionsClient
 */

import { ValidationError } from '../core/errors.js';
import { REACTION_CONTENT, RELEASE_REACTION_CONTENT } from '../core/types.js';
import type {
  ReactionContent,
  ReleaseReactionContent,
  ListReactionsOptions,
  ListReleaseReactionsOptions,
  CreateReactionOptions,
  CreateReleaseReactionOptions,
  PaginatedResponse,
  PaginationInfo,
} from '../core/types.js';
import type { HttpResponse, ParsedPagination } from '../services/http.service.js';

/**
 * Minimal shape of the HTTP service the client depends on. Modeled as an
 * interface so test doubles (the mock HTTP service) can be injected.
 */
export interface HttpServiceLike {
  get(url: string, options?: unknown): Promise<HttpResponse>;
  post(url: string, body?: unknown, options?: unknown): Promise<HttpResponse>;
  delete(url: string, options?: unknown): Promise<HttpResponse>;
  parsePagination(linkHeader?: string | null): ParsedPagination;
}

/**
 * Minimal logger surface consumed by the client.
 */
export interface LoggerLike {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
}

type RequiredParams = Record<string, string | number | undefined | null>;

export class ReactionsClient {
  #httpService: HttpServiceLike;
  #logger: LoggerLike;

  constructor(httpService: HttpServiceLike, logger: LoggerLike) {
    this.#httpService = httpService;
    this.#logger = logger;
  }

  // Team Discussion Comment Reactions

  /**
   * List reactions for a team discussion comment
   */
  async listForTeamDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: number,
    commentNumber: number,
    options: ListReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ org, teamSlug, discussionNumber, commentNumber });

    const url = `/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments/${commentNumber}/reactions`;
    const params = this.#buildListParams(options);

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for a team discussion comment
   */
  async createForTeamDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: number,
    commentNumber: number,
    options: CreateReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ org, teamSlug, discussionNumber, commentNumber });
    this.#validateReactionContent(options?.content);

    const url = `/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments/${commentNumber}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete team discussion comment reaction
   */
  async deleteForTeamDiscussionComment(
    org: string,
    teamSlug: string,
    discussionNumber: number,
    commentNumber: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ org, teamSlug, discussionNumber, commentNumber, reactionId });

    const url = `/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/comments/${commentNumber}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Team Discussion Reactions

  /**
   * List reactions for a team discussion
   */
  async listForTeamDiscussion(
    org: string,
    teamSlug: string,
    discussionNumber: number,
    options: ListReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ org, teamSlug, discussionNumber });

    const url = `/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/reactions`;
    const params = this.#buildListParams(options);

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for a team discussion
   */
  async createForTeamDiscussion(
    org: string,
    teamSlug: string,
    discussionNumber: number,
    options: CreateReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ org, teamSlug, discussionNumber });
    this.#validateReactionContent(options?.content);

    const url = `/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete team discussion reaction
   */
  async deleteForTeamDiscussion(
    org: string,
    teamSlug: string,
    discussionNumber: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ org, teamSlug, discussionNumber, reactionId });

    const url = `/orgs/${org}/teams/${teamSlug}/discussions/${discussionNumber}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Commit Comment Reactions

  /**
   * List reactions for a commit comment
   */
  async listForCommitComment(
    owner: string,
    repo: string,
    commentId: number,
    options: ListReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ owner, repo, commentId });

    const url = `/repos/${owner}/${repo}/comments/${commentId}/reactions`;
    const params = this.#buildListParams(options);

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for a commit comment
   */
  async createForCommitComment(
    owner: string,
    repo: string,
    commentId: number,
    options: CreateReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ owner, repo, commentId });
    this.#validateReactionContent(options?.content);

    const url = `/repos/${owner}/${repo}/comments/${commentId}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete a commit comment reaction
   */
  async deleteForCommitComment(
    owner: string,
    repo: string,
    commentId: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ owner, repo, commentId, reactionId });

    const url = `/repos/${owner}/${repo}/comments/${commentId}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Issue Comment Reactions

  /**
   * List reactions for an issue comment
   */
  async listForIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    options: ListReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ owner, repo, commentId });

    const url = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;
    const params = this.#buildListParams(options);

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for an issue comment
   */
  async createForIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    options: CreateReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ owner, repo, commentId });
    this.#validateReactionContent(options?.content);

    const url = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete an issue comment reaction
   */
  async deleteForIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ owner, repo, commentId, reactionId });

    const url = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Issue Reactions

  /**
   * List reactions for an issue
   */
  async listForIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    options: ListReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ owner, repo, issueNumber });

    const url = `/repos/${owner}/${repo}/issues/${issueNumber}/reactions`;
    const params = this.#buildListParams(options);

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for an issue
   */
  async createForIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    options: CreateReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ owner, repo, issueNumber });
    this.#validateReactionContent(options?.content);

    const url = `/repos/${owner}/${repo}/issues/${issueNumber}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete an issue reaction
   */
  async deleteForIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ owner, repo, issueNumber, reactionId });

    const url = `/repos/${owner}/${repo}/issues/${issueNumber}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Pull Request Review Comment Reactions

  /**
   * List reactions for a pull request review comment
   */
  async listForPullRequestReviewComment(
    owner: string,
    repo: string,
    commentId: number,
    options: ListReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ owner, repo, commentId });

    const url = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`;
    const params = this.#buildListParams(options);

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for a pull request review comment
   */
  async createForPullRequestReviewComment(
    owner: string,
    repo: string,
    commentId: number,
    options: CreateReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ owner, repo, commentId });
    this.#validateReactionContent(options?.content);

    const url = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete a pull request comment reaction
   */
  async deleteForPullRequestComment(
    owner: string,
    repo: string,
    commentId: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ owner, repo, commentId, reactionId });

    const url = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Release Reactions

  /**
   * List reactions for a release
   */
  async listForRelease(
    owner: string,
    repo: string,
    releaseId: number,
    options: ListReactionsOptions | ListReleaseReactionsOptions = {}
  ): Promise<PaginatedResponse> {
    this.#validateRequired({ owner, repo, releaseId });

    const url = `/repos/${owner}/${repo}/releases/${releaseId}/reactions`;
    const params = this.#buildListParams(options, true); // Release reactions have limited content types

    const response = await this.#httpService.get(`${url}${params ? `?${params}` : ''}`);

    if (options.autoPage) {
      return this.#fetchAllPages(response, url, options);
    }

    return this.#formatListResponse(response);
  }

  /**
   * Create reaction for a release
   */
  async createForRelease(
    owner: string,
    repo: string,
    releaseId: number,
    options: CreateReleaseReactionOptions
  ): Promise<unknown> {
    this.#validateRequired({ owner, repo, releaseId });
    this.#validateReleaseReactionContent(options?.content);

    const url = `/repos/${owner}/${repo}/releases/${releaseId}/reactions`;

    const response = await this.#httpService.post(url, { content: options.content });
    return response.data;
  }

  /**
   * Delete a release reaction
   */
  async deleteForRelease(
    owner: string,
    repo: string,
    releaseId: number,
    reactionId: number
  ): Promise<void> {
    this.#validateRequired({ owner, repo, releaseId, reactionId });

    const url = `/repos/${owner}/${repo}/releases/${releaseId}/reactions/${reactionId}`;
    await this.#httpService.delete(url);
  }

  // Private helper methods

  #validateRequired(params: RequiredParams): void {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        throw new ValidationError(`Required parameter missing: ${key}`);
      }
    }
  }

  #validateReactionContent(content: string | undefined): void {
    if (!content || !(Object.values(REACTION_CONTENT) as string[]).includes(content)) {
      throw new ValidationError(
        `Invalid reaction content: ${content}. Must be one of: ${Object.values(REACTION_CONTENT).join(', ')}`
      );
    }
  }

  #validateReleaseReactionContent(content: string | undefined): void {
    if (!content || !(Object.values(RELEASE_REACTION_CONTENT) as string[]).includes(content)) {
      throw new ValidationError(
        `Invalid release reaction content: ${content}. Must be one of: ${Object.values(RELEASE_REACTION_CONTENT).join(', ')}`
      );
    }
  }

  #buildListParams(
    options: ListReactionsOptions | ListReleaseReactionsOptions,
    isRelease = false
  ): string {
    const params = new URLSearchParams();

    if (options.content) {
      if (isRelease) {
        this.#validateReleaseReactionContent(options.content);
      } else {
        this.#validateReactionContent(options.content as ReactionContent | ReleaseReactionContent);
      }
      params.append('content', options.content);
    }

    if (options.perPage && options.perPage !== 30) {
      params.append('per_page', options.perPage.toString());
    }

    if (options.page && options.page !== 1) {
      params.append('page', options.page.toString());
    }

    return params.toString();
  }

  #formatListResponse(response: HttpResponse): PaginatedResponse {
    const pagination = this.#httpService.parsePagination(
      (response.headers as Record<string, string>).link
    );

    const parsedUrl = new URL(response.url);

    const info: PaginationInfo = {
      page: parseInt(parsedUrl.searchParams.get('page') ?? '') || 1,
      perPage: parseInt(parsedUrl.searchParams.get('per_page') ?? '') || 30,
      ...pagination,
    };

    return {
      data: response.data as unknown[],
      pagination: info,
    };
  }

  async #fetchAllPages(
    initialResponse: HttpResponse,
    _baseUrl: string,
    _options: ListReactionsOptions | ListReleaseReactionsOptions
  ): Promise<PaginatedResponse> {
    const allData: unknown[] = [...(initialResponse.data as unknown[])];
    let currentResponse = initialResponse;

    // The loop condition used to be a substring probe for the next-relation
    // text on the raw header. It asks the parsed links instead now — one `Link`
    // parser in the repository, and no false positive from a URL that merely
    // contains that text (PRD 0002, R6).
    for (;;) {
      const pagination = this.#httpService.parsePagination(
        (currentResponse.headers as Record<string, string>).link
      );
      if (!pagination.nextUrl) break;

      this.#logger.debug(`Fetching next page: ${pagination.nextUrl}`);
      currentResponse = await this.#httpService.get(pagination.nextUrl);
      allData.push(...(currentResponse.data as unknown[]));
    }

    const finalPagination = this.#httpService.parsePagination(
      (currentResponse.headers as Record<string, string>).link
    );

    return {
      data: allData,
      pagination: {
        page: 1,
        perPage: allData.length,
        totalPages: finalPagination.totalPages,
        totalItems: allData.length,
      },
    };
  }
}
