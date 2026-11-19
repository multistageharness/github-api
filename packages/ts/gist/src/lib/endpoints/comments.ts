/**
 * @fileoverview Gist comment endpoints.
 * @module lib/endpoints/comments
 */

import type { GistClient } from '../client.js';
import { ValidationError } from '../utils/errors.js';
import type { GistComment, ListOptions } from '../utils/types.js';
import type { ReadOptions } from './gists.js';

/** Comment body payload. */
export interface CommentInput {
  body: string;
}

function mediaTypeFor(options: ReadOptions): string | undefined {
  if (options.raw) return 'application/vnd.github.raw+json';
  if (options.base64) return 'application/vnd.github.base64+json';
  return undefined;
}

/** Comments on a gist. */
export class CommentsEndpoint {
  constructor(private readonly client: GistClient) {}

  /** Comments on `gistId`. */
  async list(gistId?: string, options: ListOptions = {}): Promise<GistComment[]> {
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.get<GistComment[]>(`/gists/${gistId}/comments`, {
      params: { ...options },
    });
    return response.data;
  }

  /** A single comment. */
  async get(gistId?: string, commentId?: number, options: ReadOptions = {}): Promise<GistComment> {
    if (!gistId || commentId === undefined) {
      throw new ValidationError('Gist ID and comment ID are required');
    }
    const response = await this.client.get<GistComment>(
      `/gists/${gistId}/comments/${commentId}`,
      { mediaType: mediaTypeFor(options) }
    );
    return response.data;
  }

  /** Add a comment. Requires authentication. */
  async create(gistId?: string, data: CommentInput = { body: '' }): Promise<GistComment> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.post<GistComment>(`/gists/${gistId}/comments`, data);
    return response.data;
  }

  /** Edit a comment. Requires authentication. */
  async update(
    gistId?: string,
    commentId?: number,
    data: CommentInput = { body: '' }
  ): Promise<GistComment> {
    this.client.auth.requireAuth();
    if (!gistId || commentId === undefined) {
      throw new ValidationError('Gist ID and comment ID are required');
    }
    const response = await this.client.patch<GistComment>(
      `/gists/${gistId}/comments/${commentId}`,
      data
    );
    return response.data;
  }

  /** Remove a comment. Requires authentication. */
  async delete(gistId?: string, commentId?: number): Promise<boolean> {
    this.client.auth.requireAuth();
    if (!gistId || commentId === undefined) {
      throw new ValidationError('Gist ID and comment ID are required');
    }
    await this.client.delete(`/gists/${gistId}/comments/${commentId}`);
    return true;
  }

  /** Walk every page of {@link list}. */
  async *iterate(
    gistId?: string,
    options: ListOptions = {}
  ): AsyncGenerator<GistComment, void, unknown> {
    let page = options.page ?? 1;
    for (;;) {
      const comments = await this.list(gistId, { ...options, page });
      if (!comments || comments.length === 0) return;
      for (const comment of comments) yield comment;
      page += 1;
    }
  }
}

export default CommentsEndpoint;
