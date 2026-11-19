/**
 * @fileoverview Token resolution and request headers for the Gist API client.
 * @module lib/utils/auth
 */

import { AuthenticationError } from './errors.js';

/** Default API root when none is supplied. */
export const DEFAULT_BASE_URL = 'https://api.github.com';

/** Env vars consulted for a token, in precedence order. */
export const TOKEN_ENV_VARS = ['GITHUB_TOKEN', 'GH_TOKEN'] as const;

export interface AuthManagerOptions {
  /** Explicit token. Takes precedence over the environment. */
  token?: string | undefined;
  /** API root. Defaults to `https://api.github.com`. */
  baseURL?: string | undefined;
}

/**
 * Resolves a GitHub token and builds the headers every request carries.
 *
 * Resolution order is explicit option, then `GITHUB_TOKEN`, then `GH_TOKEN`.
 */
export class AuthManager {
  readonly token: string | undefined;
  readonly baseURL: string;

  constructor(options: AuthManagerOptions = {}) {
    this.token = options.token ?? AuthManager.loadToken();
    this.baseURL = options.baseURL ?? DEFAULT_BASE_URL;
  }

  /** Read a token from the environment, honouring `TOKEN_ENV_VARS` precedence. */
  static loadToken(): string | undefined {
    for (const name of TOKEN_ENV_VARS) {
      const value = process.env[name];
      if (value) return value;
    }
    return undefined;
  }

  /**
   * Build request headers. Callers may merge in — and override — any default.
   * The `Authorization` header is omitted entirely when there is no token,
   * rather than sent empty, which GitHub treats as a malformed credential.
   */
  getHeaders(additional: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return { ...headers, ...additional };
  }

  /** Whether a token was resolved. */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Assert that a token is present, for endpoints GitHub refuses anonymously.
   *
   * @throws {AuthenticationError} when no token was resolved.
   */
  requireAuth(): void {
    if (!this.isAuthenticated()) {
      throw new AuthenticationError(
        'Authentication required. Set GITHUB_TOKEN environment variable or use --token flag.'
      );
    }
  }
}

export default AuthManager;
