/**
 * @fileoverview Core gist endpoints — list, read, create, update, delete, fork.
 * @module lib/endpoints/gists
 */

import type { GistClient } from '../client.js';
import { ValidationError } from '../utils/errors.js';
import type { Gist, GistFork, ListOptions } from '../utils/types.js';

/** Content-negotiation options for reads. */
export interface ReadOptions {
  /** Request raw file content (`application/vnd.github.raw+json`). */
  raw?: boolean;
  /** Request base64 file content (`application/vnd.github.base64+json`). */
  base64?: boolean;
}

/** Payload for creating a gist. */
export interface CreateGistInput {
  description?: string;
  public?: boolean;
  files?: Record<string, { content?: string } | null>;
}

/** Payload for updating a gist. */
export interface UpdateGistInput {
  description?: string;
  files?: Record<string, { content?: string; filename?: string } | null>;
}

/**
 * GitHub's placeholder filenames. Gists named this way are unaddressable, so the
 * API rejects them — catching it here gives a better message than a 422.
 */
const PLACEHOLDER_FILENAME = /^gistfile\d*$/;

/** Resolve the `Accept` header implied by the read options. */
function mediaTypeFor(options: ReadOptions): string | undefined {
  if (options.raw) return 'application/vnd.github.raw+json';
  if (options.base64) return 'application/vnd.github.base64+json';
  return undefined;
}

/** Core gist operations. */
export class GistsEndpoint {
  constructor(private readonly client: GistClient) {}

  /** Gists for the authenticated user (public gists when anonymous). */
  async list(options: ListOptions = {}): Promise<Gist[]> {
    const response = await this.client.get<Gist[]>('/gists', { params: { ...options } });
    return response.data;
  }

  /** All public gists. */
  async listPublic(options: ListOptions = {}): Promise<Gist[]> {
    const response = await this.client.get<Gist[]>('/gists/public', { params: { ...options } });
    return response.data;
  }

  /** Gists the authenticated user has starred. */
  async listStarred(options: ListOptions = {}): Promise<Gist[]> {
    this.client.auth.requireAuth();
    const response = await this.client.get<Gist[]>('/gists/starred', { params: { ...options } });
    return response.data;
  }

  /** Public gists belonging to `username`. */
  async listForUser(username?: string, options: ListOptions = {}): Promise<Gist[]> {
    if (!username) throw new ValidationError('Username is required');
    const response = await this.client.get<Gist[]>(`/users/${username}/gists`, {
      params: { ...options },
    });
    return response.data;
  }

  /** A single gist at its current revision. */
  async get(gistId?: string, options: ReadOptions = {}): Promise<Gist> {
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.get<Gist>(`/gists/${gistId}`, {
      mediaType: mediaTypeFor(options),
    });
    return response.data;
  }

  /** A gist pinned to a specific revision `sha`. */
  async getRevision(gistId?: string, sha?: string, options: ReadOptions = {}): Promise<Gist> {
    if (!gistId || !sha) throw new ValidationError('Gist ID and SHA are required');
    const response = await this.client.get<Gist>(`/gists/${gistId}/${sha}`, {
      mediaType: mediaTypeFor(options),
    });
    return response.data;
  }

  /** Create a gist. Requires authentication. */
  async create(data: CreateGistInput): Promise<Gist> {
    this.client.auth.requireAuth();

    const files = data?.files;
    if (!files || Object.keys(files).length === 0) {
      throw new ValidationError('At least one file is required');
    }

    for (const [filename, file] of Object.entries(files)) {
      if (PLACEHOLDER_FILENAME.test(filename)) {
        throw new ValidationError(`Invalid filename: ${filename}`);
      }
      if (!file || typeof file.content !== 'string' || file.content.length === 0) {
        throw new ValidationError(`Content is required for file: ${filename}`);
      }
    }

    const response = await this.client.post<Gist>('/gists', data);
    return response.data;
  }

  /** Update a gist's description or files. Requires authentication. */
  async update(gistId?: string, data: UpdateGistInput = {}): Promise<Gist> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.patch<Gist>(`/gists/${gistId}`, data);
    return response.data;
  }

  /** Delete a gist. Resolves `true` on success. Requires authentication. */
  async delete(gistId?: string): Promise<boolean> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    await this.client.delete(`/gists/${gistId}`);
    return true;
  }

  /** Fork a gist to the authenticated user. Requires authentication. */
  async fork(gistId?: string): Promise<Gist> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.post<Gist>(`/gists/${gistId}/forks`);
    return response.data;
  }

  /** Forks of a gist. */
  async listForks(gistId?: string, options: ListOptions = {}): Promise<GistFork[]> {
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.get<GistFork[]>(`/gists/${gistId}/forks`, {
      params: { ...options },
    });
    return response.data;
  }

  /**
   * Walk every page of {@link list}, yielding one gist at a time. Stops at the
   * first empty page.
   */
  async *iterate(options: ListOptions = {}): AsyncGenerator<Gist, void, unknown> {
    let page = options.page ?? 1;
    for (;;) {
      const gists = await this.list({ ...options, page });
      if (!gists || gists.length === 0) return;
      for (const gist of gists) yield gist;
      page += 1;
    }
  }

  /** {@link iterate}, over the public timeline. */
  async *iteratePublic(options: ListOptions = {}): AsyncGenerator<Gist, void, unknown> {
    let page = options.page ?? 1;
    for (;;) {
      const gists = await this.listPublic({ ...options, page });
      if (!gists || gists.length === 0) return;
      for (const gist of gists) yield gist;
      page += 1;
    }
  }
}

export default GistsEndpoint;
