/**
 * @fileoverview Gist star endpoints.
 * @module lib/endpoints/stars
 */

import type { GistClient } from '../client.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import type { Gist, ListOptions } from '../utils/types.js';

/** Starring gists. */
export class StarsEndpoint {
  constructor(private readonly client: GistClient) {}

  /**
   * Whether the authenticated user has starred `gistId`.
   *
   * GitHub answers with 204 for starred and 404 for not — so a `NotFoundError`
   * here is the negative answer, not a failure.
   */
  async check(gistId?: string): Promise<boolean> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');

    try {
      const response = await this.client.get(`/gists/${gistId}/star`);
      return response.status === 204;
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
  }

  /** Star `gistId`. Requires authentication. */
  async add(gistId?: string): Promise<boolean> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    await this.client.put(`/gists/${gistId}/star`, {});
    return true;
  }

  /** Unstar `gistId`. Requires authentication. */
  async remove(gistId?: string): Promise<boolean> {
    this.client.auth.requireAuth();
    if (!gistId) throw new ValidationError('Gist ID is required');
    await this.client.delete(`/gists/${gistId}/star`);
    return true;
  }

  /** Gists the authenticated user has starred. */
  async list(options: ListOptions = {}): Promise<Gist[]> {
    this.client.auth.requireAuth();
    const response = await this.client.get<Gist[]>('/gists/starred', { params: { ...options } });
    return response.data;
  }

  /**
   * Flip the star state.
   *
   * @returns the new state — `true` if now starred.
   */
  async toggle(gistId?: string): Promise<boolean> {
    const starred = await this.check(gistId);
    if (starred) {
      await this.remove(gistId);
      return false;
    }
    await this.add(gistId);
    return true;
  }
}

export default StarsEndpoint;
