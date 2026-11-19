/**
 * @fileoverview Main GitHub Repository API Client
 * @module RepoClient
 */

import {
  DEFAULT_BASE_URL,
  type GitHubProxyOptions,
} from '@internal/github-sdk-fetch-rest-api';
import { AuthManager, createAuth, getTokenFromEnvironment } from './auth.js';
import type { AuthManagerOptions } from './auth.js';
import { HTTPClient } from './http.js';
import type { RateLimitingConfig, RateLimitStatus } from './http.js';
import { AuthError } from '../utils/errors.js';

// Import API modules
import * as repositories from '../api/repositories.js';
import * as collaborators from '../api/collaborators.js';
import * as branches from '../api/branches.js';
import * as tags from '../api/tags.js';
import * as webhooks from '../api/webhooks.js';
import * as security from '../api/security.js';
import * as rules from '../api/rules.js';

/**
 * Configuration options for the RepoClient.
 */
export interface RepoClientOptions extends GitHubProxyOptions {
  token?: string;
  baseUrl?: string;
  timeout?: number;
  rateLimiting?: Partial<RateLimitingConfig>;
  auth?: string | AuthManagerOptions;
  userAgent?: string;
  verbose?: boolean;
  [key: string]: unknown;
}

/**
 * A module of API functions whose first `httpClient` argument has been bound away.
 */
type BoundModule<M> = {
  [K in keyof M]: M[K] extends (httpClient: HTTPClient, ...args: infer A) => infer R
    ? (...args: A) => R
    : M[K];
};

/**
 * Result of a ping() call.
 */
export interface PingResult {
  success: boolean;
  message: string;
  rateLimit?: RateLimitStatus;
  error?: string;
}

/**
 * A simple paginated helper returned by RepoClient.paginate.
 */
export interface RepoPaginator<T = unknown> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
  all(): Promise<T[]>;
}

/**
 * Main GitHub Repository API Client
 *
 * @example
 * ```javascript
 * import { RepoClient } from '@internal/github-sdk-repos';
 *
 * const client = new RepoClient({
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * // Get repository
 * const repo = await client.repositories.get('octocat', 'Hello-World');
 *
 * // List branches
 * const branches = await client.branches.list('octocat', 'Hello-World');
 * ```
 */
export class RepoClient {
  auth: AuthManager | null;
  http: HTTPClient | null;
  repositories!: BoundModule<typeof repositories>;
  collaborators!: BoundModule<typeof collaborators>;
  branches!: BoundModule<typeof branches>;
  tags!: BoundModule<typeof tags>;
  webhooks!: BoundModule<typeof webhooks>;
  security!: BoundModule<typeof security>;
  rules!: BoundModule<typeof rules>;
  options: RepoClientOptions;
  authenticatedUser?: unknown;
  tokenScopes?: string[];
  rateLimit?: unknown;
  _initialized: boolean;

  /**
   * Create a new repository client
   */
  constructor(options: RepoClientOptions = {}) {
    // Set up authentication
    this.auth = this.setupAuth(options);

    // Create HTTP client
    this.http = new HTTPClient({
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      timeout: options.timeout || 10000,
      rateLimiting: {
        enabled: true,
        padding: 100,
        ...options.rateLimiting
      },
      userAgent: options.userAgent || '@github-api/repos/1.0.0',
      authManager: this.auth,
      verbose: options.verbose || false,
      // Omitted keys rather than `undefined` values: an unset proxy is resolved
      // from the environment, an explicit `null` forces direct (PRD 0002, R4).
      ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
      ...(options.proxyBypass === undefined ? {} : { proxyBypass: options.proxyBypass })
    });

    // Initialize API modules
    this.repositories = this.createAPIModule(repositories);
    this.collaborators = this.createAPIModule(collaborators);
    this.branches = this.createAPIModule(branches);
    this.tags = this.createAPIModule(tags);
    this.webhooks = this.createAPIModule(webhooks);
    this.security = this.createAPIModule(security);
    this.rules = this.createAPIModule(rules);

    // Store options for debugging
    this.options = options;
    this._initialized = false;
  }

  /**
   * Set up authentication
   */
  setupAuth(options: RepoClientOptions): AuthManager {
    // If token is explicitly provided, use it
    if (options.token) {
      return createAuth(options.token);
    }

    // If auth object is provided, use it
    if (options.auth) {
      if (typeof options.auth === 'object') {
        return new AuthManager(options.auth);
      }
      return createAuth(options.auth);
    }

    // If no explicit authentication options provided, check environment
    const envToken = getTokenFromEnvironment();
    if (!envToken) {
      throw new AuthError(
        'Authentication required. Provide token via options.token, ' +
          'options.auth, or GITHUB_TOKEN environment variable'
      );
    }

    // Use environment token if available
    return createAuth(envToken);
  }

  /**
   * Create API module with bound HTTP client
   */
  createAPIModule<M extends Record<string, unknown>>(module: M): BoundModule<M> {
    const boundMethods: Record<string, unknown> = {};

    for (const [name, method] of Object.entries(module)) {
      if (typeof method === 'function') {
        boundMethods[name] = (...args: unknown[]) =>
          (method as (...a: unknown[]) => unknown)(this.http, ...args);
      }
    }

    return boundMethods as BoundModule<M>;
  }

  /**
   * Initialize client and validate authentication
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      // Validate authentication by making a test request
      const user = (await this.auth!.getUserInfo(this.http!)) as {
        login: string;
        name?: string;
      };
      this.authenticatedUser = user;

      // Check token scopes
      const scopes = await this.auth!.checkScopes(this.http!, ['repo']);
      this.tokenScopes = scopes;

      // Get rate limit status
      const rateLimit = (await this.auth!.getRateLimit(this.http!)) as {
        resources: { core: { remaining: number; limit: number } };
      } | null;
      this.rateLimit = rateLimit;

      this._initialized = true;

      if (this.options.verbose) {
        console.log(`✓ Authenticated as ${user.login} (${user.name || 'no name'})`);
        console.log(`✓ Token scopes: ${scopes.join(', ')}`);
        if (rateLimit) {
          console.log(
            `✓ Rate limit: ${rateLimit.resources.core.remaining}/${rateLimit.resources.core.limit}`
          );
        }
      }
    } catch (error) {
      throw new AuthError(`Authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get authenticated user information
   */
  async getAuthenticatedUser(): Promise<unknown> {
    await this.initialize();
    return this.authenticatedUser;
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<RateLimitStatus> {
    return this.http!.getRateLimitStatus();
  }

  /**
   * Test API connectivity
   */
  async ping(): Promise<PingResult> {
    try {
      await this.http!.get('/');
      return {
        success: true,
        message: 'GitHub API is reachable',
        rateLimit: this.http!.getRateLimitStatus()
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        error: (error as Error).name
      };
    }
  }

  /**
   * Get client configuration
   */
  getConfig(): {
    baseUrl: string;
    timeout: number;
    rateLimiting: RateLimitingConfig;
    userAgent: string;
    authenticated: boolean;
    initialized: boolean;
  } {
    return {
      baseUrl: this.http!.config.baseUrl,
      timeout: this.http!.config.timeout,
      rateLimiting: this.http!.config.rateLimiting,
      userAgent: this.http!.config.userAgent,
      authenticated: !!this.auth,
      initialized: this._initialized
    };
  }

  /**
   * Update client configuration
   */
  updateConfig(updates: {
    token?: string;
    baseUrl?: string;
    timeout?: number;
    rateLimiting?: Partial<RateLimitingConfig>;
  }): void {
    if (updates.token) {
      this.auth = createAuth(updates.token);
      this.http!.authManager = this.auth;
      this._initialized = false; // Force re-initialization
    }

    if (updates.baseUrl) {
      this.http!.config.baseUrl = updates.baseUrl;
    }

    if (updates.timeout) {
      this.http!.config.timeout = updates.timeout;
    }

    if (updates.rateLimiting) {
      Object.assign(this.http!.config.rateLimiting, updates.rateLimiting);
    }
  }

  /**
   * Create a paginated request helper
   */
  paginate<T = unknown>(
    // bound API methods have varied signatures; accept any callable
    method: (...args: any[]) => Promise<unknown>,
    ...args: unknown[]
  ): RepoPaginator<T> {
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<T> {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const options = (args[args.length - 1] as { per_page?: number }) || {};
          const params = { ...options, page, per_page: options.per_page || 30 };
          const newArgs = [...args.slice(0, -1), params];

          const results = await method(...newArgs);

          if (Array.isArray(results)) {
            for (const item of results) {
              yield item as T;
            }
            hasMore = results.length === params.per_page;
          } else {
            yield results as T;
            hasMore = false;
          }

          page++;

          // Safety break to prevent infinite loops
          if (page > 1000) {
            break;
          }
        }
      },

      async all(): Promise<T[]> {
        const results: T[] = [];
        for await (const item of this) {
          results.push(item);
        }
        return results;
      }
    };
  }

  /**
   * Destroy client and cleanup resources
   */
  destroy(): void {
    this.auth = null;
    this.http = null;
    this.repositories = null as unknown as BoundModule<typeof repositories>;
    this.collaborators = null as unknown as BoundModule<typeof collaborators>;
    this.branches = null as unknown as BoundModule<typeof branches>;
    this.tags = null as unknown as BoundModule<typeof tags>;
    this.webhooks = null as unknown as BoundModule<typeof webhooks>;
    this.security = null as unknown as BoundModule<typeof security>;
    this.rules = null as unknown as BoundModule<typeof rules>;
    this._initialized = false;
  }
}

/**
 * Create a new RepoClient instance
 */
export function createClient(options: RepoClientOptions = {}): RepoClient {
  return new RepoClient(options);
}

export default RepoClient;
