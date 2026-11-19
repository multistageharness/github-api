/**
 * @fileoverview `@internal/github-sdk-fetch-proxy` — opt-in HTTP-proxy support
 * for the GitHub fetch layer (PRD 0002, R11, D1).
 *
 * **Importing this module is the opt-in.** It registers an `undici`-backed
 * dispatcher factory with `@internal/github-sdk-fetch-rest-api` as an import
 * side effect, and every client constructed afterwards honors the `proxy`
 * option, `GITHUB_PROXY`, `HTTPS_PROXY`/`HTTP_PROXY` and `NO_PROXY`:
 *
 * ```ts
 * import '@internal/github-sdk-fetch-proxy';
 * import { GitHubRestClient } from '@internal/github-sdk-fetch-rest-api';
 *
 * const client = new GitHubRestClient(); // HTTPS_PROXY is now honored
 * ```
 *
 * A side effect on import is unusual and deliberate. The alternative — the
 * fetch layer resolving this package on demand — would put a synchronous
 * `require` on the construction path, which is filesystem I/O in the one place
 * N2 forbids it. Registering from here keeps the fetch layer free of dynamic
 * resolution and keeps construction pure.
 *
 * The package this registers into never falls back to a direct connection. With
 * a proxy configured and this package absent, construction throws
 * `GitHubProxyUnavailableError` naming the install command — because traffic an
 * operator believed was proxied leaving the network directly is a compliance
 * failure that leaves no trace (R11, RK2).
 * @module @internal/github-sdk-fetch-proxy
 */

import {
  setProxyTransportFactory,
  type ProxyTarget,
  type ProxyTransport,
  type ProxyTransportFactory,
} from '@internal/github-sdk-fetch-rest-api';

import { createProxyTransport } from './agent.js';

/**
 * Register the dispatcher factory (R11).
 *
 * Called for you when this module is imported. It is exported so a host that
 * wants the registration to be an explicit statement in its own startup — or
 * that needs to re-register after a test cleared it — can say so.
 *
 * Idempotent: registering twice replaces rather than layers.
 */
export function installProxySupport(factory: ProxyTransportFactory = createProxyTransport): void {
  setProxyTransportFactory(factory);
}

/**
 * Remove the registration.
 *
 * For tests asserting the not-installed failure path, and for a host unwinding
 * its own setup. After this, constructing a client with a proxy configured
 * throws again — which is the correct behavior, not a regression.
 */
export function uninstallProxySupport(): void {
  setProxyTransportFactory(undefined);
}

// The opt-in itself. One import line, and the whole layer proxies.
installProxySupport();

export {
  createProxyAgent,
  createProxyTransport,
  redactProxyUrl,
  splitProxyCredentials,
} from './agent.js';

export {
  hasConflictingProxyFlags,
  proxyFlagsFromArgv,
  proxyOptionsFrom,
  registerProxyOptions,
  validateProxyFlagsOrExit,
  type ParsedProxyFlags,
  type ProxyClientOptions,
  type ProxyFlagTarget,
} from './cli.js';

export type { ProxyTarget, ProxyTransport, ProxyTransportFactory };
