/**
 * @fileoverview Gist revision (commit) endpoints.
 * @module lib/endpoints/commits
 */

import type { GistClient } from '../client.js';
import { ValidationError } from '../utils/errors.js';
import { paginateAll } from '../utils/pagination.js';
import type { Gist, GistCommit, ListOptions } from '../utils/types.js';

/** Aggregate change statistics across every revision of a gist. */
export interface GistCommitStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalChanges: number;
  commits: GistCommit[];
}

/** Revisions of a gist. */
export class CommitsEndpoint {
  constructor(private readonly client: GistClient) {}

  /** Revisions of `gistId`. */
  async list(gistId?: string, options: ListOptions = {}): Promise<GistCommit[]> {
    if (!gistId) throw new ValidationError('Gist ID is required');
    const response = await this.client.get<GistCommit[]>(`/gists/${gistId}/commits`, {
      params: { ...options },
    });
    return response.data;
  }

  /** The gist as it stood at revision `sha`. */
  async get(gistId?: string, sha?: string): Promise<Gist> {
    if (!gistId || !sha) throw new ValidationError('Gist ID and SHA are required');
    const response = await this.client.get<Gist>(`/gists/${gistId}/${sha}`);
    return response.data;
  }

  /** Walk every page of {@link list}. */
  async *iterate(
    gistId?: string,
    options: ListOptions = {}
  ): AsyncGenerator<GistCommit, void, unknown> {
    let page = options.page ?? 1;
    for (;;) {
      const commits = await this.list(gistId, { ...options, page });
      if (!commits || commits.length === 0) return;
      for (const commit of commits) yield commit;
      page += 1;
    }
  }

  /** Totals across every revision. Walks all pages. */
  async getStats(gistId?: string): Promise<GistCommitStats> {
    if (!gistId) throw new ValidationError('Gist ID is required');

    const commits = await paginateAll<GistCommit>((options) => this.list(gistId, options));

    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalChanges = 0;

    for (const commit of commits) {
      totalAdditions += commit.change_status?.additions ?? 0;
      totalDeletions += commit.change_status?.deletions ?? 0;
      totalChanges += commit.change_status?.total ?? 0;
    }

    return {
      totalCommits: commits.length,
      totalAdditions,
      totalDeletions,
      totalChanges,
      commits,
    };
  }
}

export default CommitsEndpoint;
