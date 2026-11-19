/**
 * @fileoverview GitHub Users API Client
 * @module UsersClient
 */

import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import { HttpClient, type HttpClientOptions, type RateLimitingConfig } from './http.js';
import { ProfileAPI } from '../api/profile.js';
import { EmailsAPI } from '../api/emails.js';
import { DiscoveryAPI } from '../api/discovery.js';
import { ContextAPI } from '../api/context.js';
import { AuthError } from '../utils/errors.js';

// Error objects from the HTTP layer carry a dynamic `.status`; narrowed at call sites.
type ErrorWithStatus = { status?: number };

/**
 * Configuration options accepted by the {@link UsersClient} constructor.
 */
export interface UsersClientOptions extends HttpClientOptions {
  token?: string;
}

/**
 * The resolved client configuration (defaults merged with user options).
 */
export interface ResolvedUsersClientOptions extends UsersClientOptions {
  baseUrl: string;
  timeout: number;
  rateLimiting: RateLimitingConfig;
}

/**
 * GitHub Users API Client
 * Main client class that orchestrates all user-related operations
 */
export class UsersClient {
  options: ResolvedUsersClientOptions;
  http: HttpClient;
  profile: ProfileAPI;
  emails: EmailsAPI;
  discovery: DiscoveryAPI;
  context: ContextAPI;

  /**
   * Create a new UsersClient instance
   */
  constructor(options: UsersClientOptions = {}) {
    this.options = {
      baseUrl: DEFAULT_BASE_URL,
      timeout: 10000,
      rateLimiting: {
        enabled: true,
        maxRequests: 5000
      },
      ...options
    };
    // Same precedence as the transport core: explicit, then GITHUB_TOKEN, then GH_TOKEN.
    this.options.token ||= process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'] || undefined;

    // Validate required token
    if (!this.options.token) {
      throw new AuthError(
        'GitHub token is required. Set GITHUB_TOKEN environment variable or pass token in options.'
      );
    }

    // Initialize HTTP client
    this.http = new HttpClient(this.options);

    // Initialize API modules
    this.profile = new ProfileAPI(this.http);
    this.emails = new EmailsAPI(this.http);
    this.discovery = new DiscoveryAPI(this.http);
    this.context = new ContextAPI(this.http);
  }

  /**
   * Test authentication and get rate limit status
   */
  async testAuth(): Promise<any> {
    try {
      const response = await this.http.get('/rate_limit');
      return response;
    } catch (error) {
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Invalid GitHub token provided');
      }
      throw error;
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<any> {
    return await this.http.get('/rate_limit');
  }

  /**
   * Update client configuration
   */
  updateConfig(options: UsersClientOptions = {}): void {
    this.options = { ...this.options, ...options };
    this.http.updateConfig(this.options);
  }

  /**
   * Close the client and cleanup resources
   */
  close(): void {
    if (this.http && this.http.close) {
      this.http.close();
    }
  }
}
