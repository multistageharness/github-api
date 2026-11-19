/**
 * @fileoverview GitHub Users SDK - Main entry point for library usage
 * @module @internal/github-sdk-users
 * @version 1.0.0
 */

import { UsersClient, type UsersClientOptions } from './client/UsersClient.js';
import * as profile from './api/profile.js';
import * as emails from './api/emails.js';
import * as discovery from './api/discovery.js';
import * as context from './api/context.js';
import { UsersError, AuthError, ValidationError, RateLimitError } from './utils/errors.js';
import { paginate, paginateAll } from './utils/pagination.js';
import { validateInput, validateEmail } from './utils/validation.js';
import type { ListUsersOptions } from './api/discovery.js';
import { PACKAGE_NAME, VERSION } from './version.js';

/**
 * Create a new GitHub Users API client
 */
export function createClient(options: UsersClientOptions = {}): UsersClient {
  return new UsersClient(options);
}

/**
 * Default export - UsersClient class
 */
export default UsersClient;

/**
 * Named exports for direct API usage
 */
export {
  // Client
  UsersClient,

  // API modules
  profile,
  emails,
  discovery,
  context,

  // Error classes
  UsersError,
  AuthError,
  ValidationError,
  RateLimitError,

  // Utility functions
  paginate,
  paginateAll,
  validateInput,
  validateEmail
};

/**
 * Convenience method to get authenticated user
 */
export async function getAuthenticatedUser(options: UsersClientOptions = {}): Promise<any> {
  const client = createClient(options);
  return await client.profile.getAuthenticated();
}

/**
 * Convenience method to get user by username
 */
export async function getUser(username: string, options: UsersClientOptions = {}): Promise<any> {
  const client = createClient(options);
  return await client.discovery.getByUsername(username);
}

/**
 * Convenience method to list users
 */
export async function listUsers(
  options: UsersClientOptions & ListUsersOptions = {}
): Promise<any[]> {
  const client = createClient(options);
  return await client.discovery.list(options);
}

/**
 * Convenience method to list authenticated user's emails
 */
export async function listEmails(options: UsersClientOptions = {}): Promise<any[]> {
  const client = createClient(options);
  return await client.emails.list();
}

/**
 * Package metadata
 */
export const packageInfo = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'GitHub Users API client and CLI',
  homepage: 'https://github.com/multistageharness-com/RCM-github/tree/main/github-api/v100/packages/ts/users'
};
