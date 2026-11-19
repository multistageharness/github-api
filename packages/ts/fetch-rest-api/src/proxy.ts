/**
 * @fileoverview Everything about a proxy that does not need an HTTP stack
 * (PRD 0002, R1–R4, R9–R12).
 *
 * Parsing a proxy URL, redacting its password, matching a bypass list the way
 * curl matches one, and holding the hook an HTTP-proxy dispatcher plugs into.
 * All of it is string and `URL` work: this module adds **no dependency** and
 * opens **no socket** (R11, N1, N2).
 *
 * The dispatcher itself — the one thing here that genuinely needs an HTTP stack
 * — lives in the opt-in `@internal/github-sdk-fetch-proxy` package and arrives
 * through {@link setProxyDispatcherFactory}. When a proxy is configured and
 * nothing has registered, construction **fails** (R11, RK2). Falling back to a
 * direct connection would send traffic the operator believed was proxied
 * straight out of the network, and that is the one outcome this design forbids.
 * @module proxy
 */

import {
  GitHubEnvironmentError,
  GitHubProxyUnavailableError,
  redactUrlCredentials,
} from './errors.js';
import type { FetchLike } from './types.js';

/**
 * Replace a URL's password with `***`, leaving everything else readable (R10).
 *
 * Re-exported from `errors`, which owns it: an error message must redact
 * whatever it shows back, and pointing that module at this one would make the
 * two circular. This is the name the rest of the layer uses.
 */
export const redactProxyUrl = redactUrlCredentials;

/**
 * A GitHub-specific proxy, overriding the machine-wide one (R1, D2).
 *
 * Not scheme-split, because a consumer naming a GitHub-specific proxy has
 * already decided which one they mean.
 */
export const GITHUB_PROXY_VARIABLE = 'GITHUB_PROXY';

/**
 * The `https:` proxy pair, highest precedence first (R1).
 *
 * Lowercase precedes uppercase, following curl: in a CGI process the uppercase
 * `HTTPS_PROXY` is settable by a remote client through the `Proxy:` request
 * header, and the lowercase name is the one that cannot be forged.
 */
export const HTTPS_PROXY_VARIABLES = ['https_proxy', 'HTTPS_PROXY'] as const;

/** The `http:` proxy pair, highest precedence first (R1). Same casing rule. */
export const HTTP_PROXY_VARIABLES = ['http_proxy', 'HTTP_PROXY'] as const;

/** The bypass-list chain, highest precedence first (R2). */
export const NO_PROXY_VARIABLES = ['GITHUB_NO_PROXY', 'no_proxy', 'NO_PROXY'] as const;

/** Every proxy variable this layer reads, in documentation order (R13, R15). */
export const PROXY_VARIABLES = [
  GITHUB_PROXY_VARIABLE,
  ...HTTPS_PROXY_VARIABLES,
  ...HTTP_PROXY_VARIABLES,
  ...NO_PROXY_VARIABLES,
] as const;

/**
 * The proxy chain for one scheme, highest precedence first (R1, R3).
 *
 * Selected against the **resolved** base URL, not the default one: a
 * `GITHUB_API_URL=http://ghe.internal/api/v3` is proxied by `HTTP_PROXY`, and an
 * `HTTPS_PROXY` alone does not touch it.
 */
export function proxyVariablesFor(protocol: string): readonly string[] {
  return protocol === 'http:'
    ? [GITHUB_PROXY_VARIABLE, ...HTTP_PROXY_VARIABLES]
    : [GITHUB_PROXY_VARIABLE, ...HTTPS_PROXY_VARIABLES];
}

/** Where a proxy value came from, for the error a malformed one raises (R9). */
export interface ProxyValueSource {
  /** `environment` names a variable; `option` names a constructor option. */
  kind: 'environment' | 'option';
  /** The variable name (`HTTPS_PROXY`) or the option name (`proxy`). */
  name: string;
}

/**
 * A proxy, resolved and ready to dial.
 *
 * Handed to the registered factory, which is trusted code inside the opt-in
 * package: it is the one place the password is needed, because it is the one
 * place the `CONNECT` is issued from.
 */
export interface ProxyTarget {
  /** The proxy URL, credentials intact. Never logged, never returned by an accessor (R10). */
  url: string;
  /** The same URL with any password replaced by `***`. Safe everywhere (R10). */
  redactedUrl: string;
  /** The base URL whose traffic this proxy carries, so a factory can pool per origin. */
  baseUrl: string;
}

/**
 * Everything the opt-in package hands back for one resolved proxy (R11, D1).
 *
 * It supplies a **transport**, not merely a dispatcher, because the platform
 * global `fetch` silently discards an init `dispatcher` — measured on Node 24,
 * and the reason PRD 0002's assumption A3 does not hold. A seam that only
 * carried a dispatcher would present exactly as [RK2](../..): a configured
 * proxy, ignored, with the request going out direct.
 *
 * The dispatcher is carried alongside anyway, spread into every request's
 * `init`, so a host that injected its own undici-based `fetch` still proxies.
 */
export interface ProxyTransport {
  /** A `fetch` that routes through the proxy. Used unless the caller injected one. */
  fetch: FetchLike;
  /** The dispatcher, for a transport that understands one. Typed `unknown` so undici stays out. */
  dispatcher: unknown;
  /** Release the proxy's connection pool. Called from `client.close()`. */
  close?: () => void;
}

/**
 * Builds the transport that actually proxies (R11, D1).
 *
 * An undici `ProxyAgent` and a `fetch` bound to it, in the shipped
 * implementation — but nothing here names undici, which is the whole point of
 * D1: this package must not acquire the type, let alone the dependency.
 */
export type ProxyTransportFactory = (target: ProxyTarget) => ProxyTransport;

/**
 * The registry key.
 *
 * On `globalThis` under a registered symbol rather than in a module-level
 * binding, because this package ships **both** ESM and CJS (N6). A consumer
 * whose bundler loads the ESM copy of this module and the CJS copy of the proxy
 * package would otherwise have two registries and one of them empty — which
 * presents as [RK2](../../.ai): a configured proxy, silently ignored.
 */
const REGISTRY = Symbol.for('@internal/github-sdk-fetch-rest-api#proxyTransportFactory');

type Registry = { [REGISTRY]?: ProxyTransportFactory };

/**
 * Register the factory that turns a resolved proxy into a transport (R11).
 *
 * Called by `@internal/github-sdk-fetch-proxy` as an import side effect, so a
 * consumer opts in with one import line and every client constructed afterwards
 * can proxy. Registering twice replaces the previous factory rather than
 * layering, so a host that wants its own can take the seam.
 */
export function setProxyTransportFactory(factory: ProxyTransportFactory | undefined): void {
  const registry = globalThis as Registry;
  if (factory === undefined) {
    delete registry[REGISTRY];
    return;
  }
  registry[REGISTRY] = factory;
}

/** The registered factory, or `undefined` when nothing has opted in (R11). */
export function getProxyTransportFactory(): ProxyTransportFactory | undefined {
  return (globalThis as Registry)[REGISTRY];
}

/** Whether proxy support has been opted into. The check `GitHubRestClient` makes at construction. */
export function isProxySupportInstalled(): boolean {
  return getProxyTransportFactory() !== undefined;
}

/**
 * Build the transport for a resolved proxy, or fail loudly (R11, RK2).
 *
 * The failure names the package and the exact install command, because the
 * alternative — a `MODULE_NOT_FOUND`, or worse a silent direct connection — is
 * the outcome R11 exists to forbid.
 */
export function createProxyTransport(target: ProxyTarget): ProxyTransport {
  const factory = getProxyTransportFactory();
  if (factory === undefined) throw new GitHubProxyUnavailableError(target.redactedUrl);
  return factory(target);
}

/**
 * Validate a proxy value and hand back the URL to dial (R9).
 *
 * A value that cannot mean what it claims to is a **construction-time** error
 * naming its source, not a confusing connection failure later — the same rule
 * `GITHUB_API_URL` and `GITHUB_API_TIMEOUT` already follow. The value shown back
 * is redacted (R10).
 */
export function parseProxyValue(value: string, source: ProxyValueSource): string {
  const fail = (expected: string): never => {
    throw new GitHubEnvironmentError(source.name, value, expected, source.kind);
  };

  // Checked before `new URL`, because `new URL('proxy.test:8080')` *succeeds* —
  // as the scheme `proxy.test:` with the path `8080`. Rejecting it on the way in
  // is the only way an operator learns the scheme is what is missing.
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) {
    return fail(
      'a proxy URL carrying a scheme, for example http://proxy.example.test:8080',
    ) as never;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Also where an out-of-range port lands: `new URL` rejects `:99999`.
    return fail(
      'a parseable http: or https: proxy URL with a port in 1-65535, ' +
        'for example http://proxy.example.test:8080',
    ) as never;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('an http: or https: proxy URL, for example http://proxy.example.test:8080') as never;
  }
  if (parsed.hostname === '') {
    return fail('a proxy URL naming a host, for example http://proxy.example.test:8080') as never;
  }

  return value;
}

/**
 * Split a bypass list into entries (R2).
 *
 * Comma-separated, surrounding whitespace ignored, empty entries dropped. An
 * empty entry is **skipped**, never read as a wildcard: `NO_PROXY=",,"` must
 * bypass nothing, and the opposite reading turns a stray comma into a total
 * bypass.
 */
export function parseBypassList(value: string | readonly string[]): string[] {
  const raw = typeof value === 'string' ? value.split(',') : value.flatMap((v) => v.split(','));
  return raw.map((entry) => entry.trim()).filter((entry) => entry !== '');
}

/** The port a URL is really addressed on, defaulted by scheme when it is implicit. */
function effectivePort(url: URL): string {
  if (url.port !== '') return url.port;
  return url.protocol === 'http:' ? '80' : '443';
}

/**
 * Split an entry into its host and its optional port.
 *
 * IPv6 literals are handled first: `[::1]:8080` has two meanings for `:` and
 * splitting on the last one without checking the bracket would turn `[::1]`
 * into a port.
 */
function splitEntry(entry: string): { host: string; port: string | undefined } {
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    if (close !== -1) {
      const host = entry.slice(0, close + 1);
      const rest = entry.slice(close + 1);
      if (rest.startsWith(':') && /^\d+$/.test(rest.slice(1))) {
        return { host, port: rest.slice(1) };
      }
      return { host, port: undefined };
    }
  }

  const separator = entry.lastIndexOf(':');
  if (separator !== -1 && /^\d+$/.test(entry.slice(separator + 1))) {
    return { host: entry.slice(0, separator), port: entry.slice(separator + 1) };
  }
  return { host: entry, port: undefined };
}

/**
 * Whether one bypass entry covers a URL, using curl's rules (R2, RK4).
 *
 * | Entry | Matches |
 * | --- | --- |
 * | `*` | Everything |
 * | `example.test` | That host exactly, and any subdomain of it |
 * | `.example.test` | Any subdomain of it, and the bare host |
 * | `example.test:8080` | That host **only** on that port |
 * | `10.0.0.5` | That literal address |
 *
 * Curl's rules rather than our own, so an operator's existing `NO_PROXY` keeps
 * meaning to this layer what it already means to every other tool on the
 * machine.
 */
function entryMatches(entry: string, url: URL): boolean {
  if (entry === '*') return true;

  const { host: rawHost, port } = splitEntry(entry);
  if (port !== undefined && port !== effectivePort(url)) return false;

  // A leading dot is the explicit spelling of "subdomains of"; a trailing dot is
  // a fully-qualified name written out. Neither changes what is matched, so both
  // are normalized away rather than special-cased below.
  let host = rawHost.toLowerCase();
  while (host.startsWith('.')) host = host.slice(1);
  while (host.endsWith('.')) host = host.slice(0, -1);
  if (host === '') return false;

  const target = url.hostname.toLowerCase().replace(/\.$/, '');
  if (target === host) return true;
  // `github.com` covers `api.github.com` but not `notgithub.com` — the boundary
  // is a label separator, not a substring.
  return target.endsWith(`.${host}`);
}

/** Whether a bypass list covers a URL (R2). An empty list bypasses nothing. */
export function isBypassed(entries: readonly string[], url: string): boolean {
  if (entries.length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A base URL that will not parse is a different failure, raised elsewhere
    // with a better message. Not bypassing is the safe reading: it keeps a
    // configured proxy in play rather than silently dropping it (RK2).
    return false;
  }

  // A malformed entry is deliberately not fatal (R9): it simply matches
  // nothing. Failing a deployment over a stray comma in a bypass list is worse
  // than ignoring it.
  return entries.some((entry) => entryMatches(entry, parsed));
}
