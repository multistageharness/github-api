/**
 * Authentication handler for GitHub API
 * @module client/auth
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ConfigurationError } from '../utils/errors.js';
import type { HttpClient } from './http.js';

/**
 * Options accepted when constructing AuthConfig / createAuthConfig.
 */
export interface AuthConfigOptions {
  token?: string;
  tokenFile?: string;
  tokenEnv?: string;
  configPath?: string;
  baseUrl?: string;
  perPage?: number;
  timeout?: number;
  cache?: unknown;
  debug?: boolean;
  [key: string]: unknown;
}

/**
 * Shape of a config object loaded from disk.
 */
export interface LoadedConfig {
  token?: string;
  baseUrl?: string;
  perPage?: number;
  timeout?: number;
  cache?: unknown;
  debug?: boolean;
}

/**
 * Authentication configuration
 */
export class AuthConfig {
  token: string | null;
  tokenSource: string | null;
  tokenFile?: string;

  constructor(options: AuthConfigOptions = {}) {
    this.token = null;
    this.tokenSource = null;

    // Priority: direct token > env var > file > config file
    if (options.token) {
      this.token = options.token;
      this.tokenSource = 'direct';
    } else if (options.tokenEnv) {
      this.loadFromEnv(options.tokenEnv);
    } else if (options.tokenFile) {
      this.tokenFile = options.tokenFile;
      this.tokenSource = 'file';
    } else {
      this.loadFromEnv('GITHUB_TOKEN');
      if (!this.token) {
        this.loadFromEnv('GH_TOKEN');
      }
    }
  }

  /**
   * Load token from environment variable
   */
  loadFromEnv(envName: string): void {
    const token = process.env[envName];
    if (token) {
      this.token = token;
      this.tokenSource = `env:${envName}`;
    }
  }

  /**
   * Load token from file
   */
  async loadFromFile(): Promise<string | null> {
    if (!this.tokenFile) {
      return null;
    }

    try {
      const content = await fs.readFile(this.tokenFile, 'utf-8');
      this.token = content.trim();
      return this.token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConfigurationError(
        `Failed to read token from file ${this.tokenFile}: ${message}`
      );
    }
  }

  /**
   * Load configuration from config file
   */
  static async loadConfig(configPath?: string): Promise<LoadedConfig> {
    const paths = [
      configPath,
      '.github-activity.json',
      path.join(os.homedir(), '.github-activity.json'),
      path.join(os.homedir(), '.config', 'github-activity', 'config.json')
    ].filter(Boolean) as string[];

    for (const filePath of paths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // Config file contents are arbitrary JSON; shape is validated below.
        const config = JSON.parse(content) as {
          token?: string;
          auth?: { token?: string };
          baseUrl?: string;
          baseURL?: string;
          perPage?: number;
          per_page?: number;
          timeout?: number;
          cache?: unknown;
          debug?: boolean;
        };

        if (config.token || config.auth?.token) {
          return {
            token: config.token || config.auth?.token,
            baseUrl: config.baseUrl || config.baseURL,
            perPage: config.perPage || config.per_page,
            timeout: config.timeout,
            cache: config.cache,
            debug: config.debug
          };
        }
      } catch {
        // Continue to next path
        continue;
      }
    }

    return {};
  }

  /**
   * Get token
   */
  async getToken(): Promise<string | null> {
    if (!this.token && this.tokenFile) {
      await this.loadFromFile();
    }
    return this.token;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Get token source description
   */
  getTokenSource(): string {
    return this.tokenSource || 'none';
  }

  /**
   * Validate token format
   */
  static validateToken(token: string): boolean {
    if (!token) return false;

    // GitHub personal access tokens
    if (token.startsWith('ghp_')) {
      return token.length === 40;
    }

    // GitHub App installation tokens
    if (token.startsWith('ghs_')) {
      return token.length > 20;
    }

    // Classic personal access tokens (40 char hex)
    if (/^[a-f0-9]{40}$/i.test(token)) {
      return true;
    }

    // Fine-grained personal access tokens
    if (token.startsWith('github_pat_')) {
      return token.length > 20;
    }

    return false;
  }

  /**
   * Create auth header
   */
  async createAuthHeader(): Promise<Record<string, string>> {
    const token = await this.getToken();

    if (!token) {
      return {};
    }

    // Use Bearer for new tokens, token for classic
    if (token.startsWith('ghp_') || token.startsWith('github_pat_') || token.startsWith('ghs_')) {
      return {
        Authorization: `Bearer ${token}`
      };
    } else {
      return {
        Authorization: `token ${token}`
      };
    }
  }

  /**
   * Get scopes from token
   */
  async getScopes(httpClient: HttpClient): Promise<string[]> {
    try {
      const response = await httpClient.client.get('/user');
      const scopesHeader = response.headers['x-oauth-scopes'];

      if (scopesHeader) {
        return scopesHeader.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Check if token has required scopes
   */
  async hasScopes(requiredScopes: string[], httpClient: HttpClient): Promise<boolean> {
    const scopes = await this.getScopes(httpClient);
    return requiredScopes.every((required) =>
      scopes.some((scope) => scope === required || scope === 'repo')
    );
  }
}

/**
 * Create auth config from various sources
 */
export async function createAuthConfig(options: AuthConfigOptions = {}): Promise<AuthConfig> {
  // Load from config file if no direct options
  if (!options.token && !options.tokenFile && !options.tokenEnv) {
    const config = await AuthConfig.loadConfig(options.configPath);
    Object.assign(options, config);
  }

  const authConfig = new AuthConfig(options);

  // Validate token if present
  const token = await authConfig.getToken();
  if (token && !AuthConfig.validateToken(token)) {
    console.warn('Warning: Token format appears invalid');
  }

  return authConfig;
}

export default AuthConfig;
