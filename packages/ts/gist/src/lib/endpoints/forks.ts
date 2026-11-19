/**
 * @fileoverview Gist fork endpoints.
 * @module lib/endpoints/forks
 */

import type { GistClient } from '../client.js';
import { ValidationError } from '../utils/errors.js';
import type { Gist, ListOptions } from '../utils/types.js';

/** Forks of a gist. */
export class ForksEndpoint {
  constructor(private readonly client: GistClient) {}

  /** Forks of `gistId`. */
  async list(gistId?: string, options: ListOptions = {}): Promise<Gist[]> {
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.get<Gist[]>(`/gists/${gistId}/forks`, {
      params: { ...options },
    });
    return response.data;
  }

  /** Fork `gistId` to the authenticated user. Requires authentication. */
  async create(gistId?: string): Promise<Gist> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.post<Gist>(`/gists/${gistId}/forks`);
    return response.data;
  }

  /** Walk every page of {@link list}. */
  async *iterate(gistId?: string, options: ListOptions = {}): AsyncGenerator<Gist, void, unknown> {
    let page = options.page ?? 1;
    for (;;) {
      const forks = await this.list(gistId, { ...options, page });
      if (!forks || forks.length === 0) return;
      for (const fork of forks) yield fork;
      page += 1;
    }
  }
}

export default ForksEndpoint;
