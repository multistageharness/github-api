/**
 * @fileoverview `@internal/github-sdk` — every published package in one install.
 *
 * Each package is re-exported under its own namespace so names that repeat
 * across packages (`default`, client and error classes) never collide. The
 * same packages are importable one at a time through the subpaths
 * (`@internal/github-sdk/repos`) or installed on their own
 * (`@internal/github-sdk-repos`), the way `lodash` relates to `lodash.get`.
 * @module @internal/github-sdk
 */

export { PACKAGE_NAME, VERSION } from './version.js';

export * as ratelimit from '@internal/github-sdk-ratelimit';
export * as fetchRestApi from '@internal/github-sdk-fetch-rest-api';
export * as fetchGraphqlApi from '@internal/github-sdk-fetch-graphql-api';
export * as fetchGithubSdk from '@internal/github-sdk-fetch-github-sdk';
export * as fetchProxy from '@internal/github-sdk-fetch-proxy';
export * as cliProgressor from '@internal/cli-progressor';
export * as activity from '@internal/github-sdk-activity';
export * as repos from '@internal/github-sdk-repos';
export * as users from '@internal/github-sdk-users';
export * as reactions from '@internal/github-sdk-reactions';
export * as clone from '@internal/github-sdk-clone';
export * as git from '@internal/github-sdk-git';
export * as issues from '@internal/github-sdk-issues';
export * as pulls from '@internal/github-sdk-pulls';
export * as teams from '@internal/github-sdk-teams';
export * as gist from '@internal/github-sdk-gist';
export * as search from '@internal/github-sdk-search';
