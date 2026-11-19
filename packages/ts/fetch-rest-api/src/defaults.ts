/**
 * @fileoverview The values every GitHub request carries, each defined exactly
 * once (R5).
 *
 * Before this file, GitHub's REST base URL was hardcoded in eighteen files
 * under `src/`, the `X-GitHub-Api-Version` value in five, and two different
 * `Authorization` schemes were in use for the same API. Bumping the API version
 * meant finding all five. This module is the one home for each.
 * @module defaults
 */

/**
 * GitHub's REST base URL.
 *
 * Overridable per client via `baseUrl`. Overriding it must not require changing
 * a single route string, which is why routes are always relative and joined
 * here rather than concatenated at call sites.
 */
export const DEFAULT_BASE_URL = 'https://api.github.com';

/**
 * The REST API version sent as `X-GitHub-Api-Version` on every request.
 *
 * GitHub dates its REST API versions; pinning one is what stops a breaking
 * change shipping to us unannounced.
 */
export const DEFAULT_API_VERSION = '2022-11-28';

/**
 * Default `Accept`. `application/vnd.github+json` is GitHub's current
 * recommendation and is overridable per request for raw, diff and patch media
 * types (R11).
 */
export const DEFAULT_ACCEPT = 'application/vnd.github+json';

/**
 * Default `User-Agent`. GitHub requires one and rejects requests without it.
 * Consumers override it with their own SDK name and version.
 */
export const DEFAULT_USER_AGENT = 'github-sdk-fetch-rest-api/0.0.1';

/**
 * Default `Authorization` scheme.
 *
 * `Bearer` rather than `token`: both work against GitHub, both were in use in
 * this repository, and `Bearer` is the one GitHub's current documentation uses.
 * Overridable per client via `authScheme` for a consumer that must keep sending
 * `token` verbatim.
 */
export const DEFAULT_AUTH_SCHEME = 'Bearer';

/**
 * Default per-request timeout, in milliseconds.
 *
 * Chosen as the most conservative of the values already in the repository —
 * `search` used 30 s, `activity` 30 s, `repos` and `users` 10 s. A request that
 * would have completed under the old 10 s ceiling still completes; one that
 * would have hung forever under `teams` and `issues`, which had no timeout at
 * all, now does not.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** `Content-Type` applied when a plain object body is serialized as JSON. */
export const DEFAULT_CONTENT_TYPE = 'application/json';
