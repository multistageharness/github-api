/**
 * @fileoverview Token resolution for the Issues SDK.
 * @module lib/auth
 */

import { AuthError } from '../utils/errors.js';

/** Env vars consulted for a token, in precedence order. */
export const TOKEN_ENV_VARS = [
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_ACCESS_TOKEN',
  'GITHUB_PAT',
] as const;

/**
 * Resolve a GitHub token from the environment.
 *
 * @throws {AuthError} when no token is set in any of {@link TOKEN_ENV_VARS}.
 */
export function getAuth(): string {
  for (const name of TOKEN_ENV_VARS) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new AuthError(
    'Authentication required. Provide a token via the --token option or set the GITHUB_TOKEN environment variable'
  );
}

/**
 * Build the `Authorization` header value.
 *
 * Returns `undefined` for a falsy token so callers omit the header entirely —
 * GitHub treats an empty credential as malformed rather than as anonymous.
 */
export function getAuthHeader(token?: string): string | undefined {
  return token ? `token ${token}` : undefined;
}

export default { getAuth, getAuthHeader, TOKEN_ENV_VARS };
