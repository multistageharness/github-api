/**
 * @fileoverview GitHub Gist API client - main entry point.
 * @module @internal/github-sdk-gist
 */

import { GistClient } from './lib/client.js';
import { GistsEndpoint } from './lib/endpoints/gists.js';
import { CommentsEndpoint } from './lib/endpoints/comments.js';
import { CommitsEndpoint } from './lib/endpoints/commits.js';
import { ForksEndpoint } from './lib/endpoints/forks.js';
import { StarsEndpoint } from './lib/endpoints/stars.js';
import type { ClientOptions } from './lib/utils/types.js';

export * from './lib/utils/errors.js';
export * from './lib/utils/pagination.js';
export * from './lib/utils/formatter.js';
export { AuthManager } from './lib/utils/auth.js';
export { ConfigManager } from './lib/utils/config.js';

// Re-export the endpoint classes and domain types so the public type surface
// matches the hand-written `types/index.d.ts` shipped by the source package.
export { GistClient } from './lib/client.js';
export { GistsEndpoint } from './lib/endpoints/gists.js';
export { CommentsEndpoint } from './lib/endpoints/comments.js';
export { CommitsEndpoint } from './lib/endpoints/commits.js';
export { ForksEndpoint } from './lib/endpoints/forks.js';
export { StarsEndpoint } from './lib/endpoints/stars.js';
export type * from './lib/utils/types.js';

/**
 * GitHub Gist API Client.
 *
 * @example
 * ```javascript
 * import GistAPI from '@internal/github-sdk-gist';
 *
 * const client = new GistAPI({ token: '*****' });
 *
 * // List gists
 * const gists = await client.gists.list();
 *
 * // Create a gist
 * const newGist = await client.gists.create({
 *   description: 'My gist',
 *   public: true,
 *   files: {
 *     'hello.js': { content: 'console.log("Hello World");' }
 *   }
 * });
 *
 * // Work with comments
 * const comments = await client.comments.list(gistId);
 * ```
 */
export default class GistAPI {
  client: GistClient;
  gists: GistsEndpoint;
  comments: CommentsEndpoint;
  commits: CommitsEndpoint;
  forks: ForksEndpoint;
  stars: StarsEndpoint;

  constructor(options: ClientOptions = {}) {
    this.client = new GistClient(options);

    // Initialize endpoints
    this.gists = new GistsEndpoint(this.client);
    this.comments = new CommentsEndpoint(this.client);
    this.commits = new CommitsEndpoint(this.client);
    this.forks = new ForksEndpoint(this.client);
    this.stars = new StarsEndpoint(this.client);
  }

  /**
   * Get rate limit information.
   */
  async getRateLimit(): Promise<unknown> {
    const response = await this.client.get('/rate_limit');
    return response.data;
  }

  /**
   * Get authenticated user information.
   */
  async getUser(): Promise<unknown> {
    this.client.auth.requireAuth();
    const response = await this.client.get('/user');
    return response.data;
  }

  /**
   * Create a new instance with different options.
   */
  withOptions(options: ClientOptions): GistAPI {
    return new GistAPI({ ...this.client.auth, ...options });
  }
}

// Export the class as both default and named export.
export { GistAPI };

// Export a pre-configured instance for quick use.
export const gistAPI = new GistAPI();
