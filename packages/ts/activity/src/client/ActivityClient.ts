/**
 * Main GitHub Activity API Client
 * @module client/ActivityClient
 */

import {
  DEFAULT_BASE_URL,
  type GitHubProxyOptions,
} from '@internal/github-sdk-fetch-rest-api';
import { HttpClient } from './http.js';
import { createAuthConfig, AuthConfig } from './auth.js';
import type { AuthConfigOptions } from './auth.js';
import { EventsAPI } from '../api/events.js';
import { NotificationsAPI } from '../api/notifications.js';
import { FeedsAPI } from '../api/feeds.js';
import { StarsAPI } from '../api/stars.js';
import { WatchingAPI } from '../api/watching.js';

/**
 * Options accepted by the ActivityClient constructor and factories.
 */
export interface ActivityClientOptions extends GitHubProxyOptions {
  token?: string;
  baseURL?: string;
  timeout?: number;
  perPage?: number;
  debug?: boolean;
  configPath?: string;
  [key: string]: unknown;
}

/**
 * Resolved client options (after defaults applied).
 */
export interface ResolvedClientOptions extends ActivityClientOptions {
  baseURL: string;
  timeout: number;
  perPage: number;
  debug: boolean;
}

/**
 * Main client for GitHub Activity API
 */
export class ActivityClient {
  options: ResolvedClientOptions;
  authConfig: AuthConfig | null;
  http: HttpClient;
  events: EventsAPI;
  notifications: NotificationsAPI;
  feeds: FeedsAPI;
  stars: StarsAPI;
  watching: WatchingAPI;

  constructor(options: ActivityClientOptions = {}) {
    this.options = {
      // The literal used to be spelled here *and* in `client/http.ts`, setting
      // the same default twice in one package. It has one home now, in
      // `@internal/github-sdk-fetch-rest-api` (PRD 0002, R5).
      baseURL: options.baseURL || process.env['GITHUB_API_URL'] || DEFAULT_BASE_URL,
      timeout: options.timeout || 30000,
      perPage: options.perPage || 30,
      debug: options.debug || process.env['DEBUG'] === 'true',
      ...options
    };

    // Initialize auth config
    this.authConfig = null;
    void this.initAuth(options);

    // Initialize HTTP client
    this.http = new HttpClient({
      baseURL: this.options.baseURL,
      token: this.options.token,
      timeout: this.options.timeout,
      // Omitted keys rather than `undefined` values: an unset proxy is resolved
      // from the environment, an explicit `null` forces direct (PRD 0002, R4).
      ...(this.options.proxy === undefined ? {} : { proxy: this.options.proxy }),
      ...(this.options.proxyBypass === undefined
        ? {}
        : { proxyBypass: this.options.proxyBypass })
    });

    // Initialize API modules
    this.events = new EventsAPI(this.http);
    this.notifications = new NotificationsAPI(this.http);
    this.feeds = new FeedsAPI(this.http);
    this.stars = new StarsAPI(this.http);
    this.watching = new WatchingAPI(this.http);
  }

  /**
   * Initialize authentication
   */
  async initAuth(options: AuthConfigOptions): Promise<void> {
    this.authConfig = await createAuthConfig(options);
    const token = await this.authConfig.getToken();

    if (token) {
      this.options.token = token;
      if (this.http) {
        this.http.setAuthToken(token);
      }
    }
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.options.token = token;
    this.http.setAuthToken(token);
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<unknown> {
    const response = await this.http.get('/rate_limit');
    return response.data;
  }

  /**
   * Get authenticated user
   */
  async getAuthenticatedUser(): Promise<unknown> {
    const response = await this.http.get('/user');
    return response.data;
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.options.token;
  }

  /**
   * Get API meta information
   */
  async getMeta(): Promise<unknown> {
    const response = await this.http.get('/meta');
    return response.data;
  }

  /**
   * Create a new client with different configuration
   */
  withOptions(options: ActivityClientOptions): ActivityClient {
    return new ActivityClient({
      ...this.options,
      ...options
    });
  }

  /**
   * Factory method to create client from environment
   */
  static async fromEnvironment(options: ActivityClientOptions = {}): Promise<ActivityClient> {
    const authConfig = await createAuthConfig();
    const token = await authConfig.getToken();

    const envTimeout = process.env['GITHUB_API_TIMEOUT'];
    return new ActivityClient({
      token: token ?? undefined,
      baseURL: process.env['GITHUB_API_URL'],
      timeout: envTimeout ? parseInt(envTimeout) : undefined,
      debug: process.env['DEBUG'] === 'true',
      ...options
    });
  }

  /**
   * Factory method to create client from config file
   */
  static async fromConfig(
    configPath: string,
    options: ActivityClientOptions = {}
  ): Promise<ActivityClient> {
    const authConfig = await createAuthConfig({ configPath });
    const config = await (authConfig.constructor as typeof AuthConfig).loadConfig(configPath);

    return new ActivityClient({
      ...config,
      ...options
    });
  }
}

export default ActivityClient;
