/**
 * @fileoverview The one place this layer reads the environment (PRD 0001,
 * R1–R9).
 *
 * Every setting a request carries resolves the same way — **explicit option >
 * environment > package default** (R4) — and this module applies that order
 * once, for all three fetch packages. `fetch-graphql-api` and
 * `fetch-github-sdk` reach it by constructing a `GitHubRestClient`; neither
 * carries a second copy, which is what keeps `process.env` to exactly one
 * module across the layer (R7).
 *
 * The environment is read **at construction, never at module load** (R6): a
 * host or a test that mutates `process.env` after importing this package must
 * be honored. That is the same rule `resolveFetch` already applies to the
 * transport, for the same reason.
 *
 * No `.env` file is read, no filesystem is touched and no dependency is added
 * (R11, N2). A CLI that wants `.env` loading keeps doing it at the CLI
 * boundary, where it already does.
 * @module env
 */

import {
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
} from './defaults.js';
import { GitHubEnvironmentError } from './errors.js';
import {
  NO_PROXY_VARIABLES,
  PROXY_VARIABLES,
  isBypassed,
  parseBypassList,
  parseProxyValue,
  proxyVariablesFor,
  redactProxyUrl,
} from './proxy.js';

/**
 * The token chain, highest precedence first (R1, D2).
 *
 * Both names are GitHub's own: `GITHUB_TOKEN` is what an Actions runner sets,
 * `GH_TOKEN` is what the `gh` CLI exports. Three further names appear in
 * sibling packages (`GITHUB_ACCESS_TOKEN`, `GITHUB_PAT`, `GITHUB_API_TOKEN`);
 * none is a GitHub-published convention, and a chain can be lengthened
 * compatibly but not shortened, so this one starts short.
 */
export const TOKEN_VARIABLES = ['GITHUB_TOKEN', 'GH_TOKEN'] as const;

/**
 * The base-URL chain, highest precedence first (R2, D2).
 *
 * `GITHUB_API_URL` is a full URL, used verbatim including any path prefix.
 * `GH_HOST` is a **hostname**, mapped the way the `gh` CLI maps it.
 */
export const BASE_URL_VARIABLES = ['GITHUB_API_URL', 'GH_HOST'] as const;

/** `X-GitHub-Api-Version` (R3). */
export const API_VERSION_VARIABLE = 'GITHUB_API_VERSION';

/** The per-request timeout, in **milliseconds** — the same unit as `timeoutMs` (R3). */
export const TIMEOUT_VARIABLE = 'GITHUB_API_TIMEOUT';

/** `User-Agent` (R3). */
export const USER_AGENT_VARIABLE = 'GITHUB_USER_AGENT';

/**
 * Every variable this layer reads, in documentation order (R13).
 *
 * Thirteen names, of which at most **thirteen** are read per construction and
 * usually far fewer: the proxy pair is scheme-selected, so only one of
 * `https_proxy`/`HTTPS_PROXY` and `http_proxy`/`HTTP_PROXY` is ever consulted
 * (PRD 0002, N3).
 */
export const ENVIRONMENT_VARIABLES = [
  ...TOKEN_VARIABLES,
  ...BASE_URL_VARIABLES,
  API_VERSION_VARIABLE,
  TIMEOUT_VARIABLE,
  USER_AGENT_VARIABLE,
  ...PROXY_VARIABLES,
] as const;

/**
 * Where an effective value came from (R8).
 *
 * `option` — a constructor option. `env:<NAME>` — the named variable, so a
 * reader learns it was `GH_TOKEN` rather than merely "the environment".
 * `default` — the package default; for the token, that default is *no token*.
 *
 * The shape matches the `tokenSource` string `activity/src/client/auth.ts`
 * already records, so it reads the same wherever it surfaces.
 */
export type ConfigSource = 'option' | 'default' | `env:${string}`;

/**
 * Per-setting provenance for one client (R8).
 *
 * Carries where each value came from and never the token itself (R10) — it is
 * the diagnostic for "which token is this client about to send, and where did
 * it come from", answerable without issuing a request.
 */
export interface GitHubConfigSources {
  token: ConfigSource;
  baseUrl: ConfigSource;
  apiVersion: ConfigSource;
  userAgent: ConfigSource;
  timeoutMs: ConfigSource;
}

/**
 * Where a proxy came from and what it will actually do (PRD 0002, R12).
 *
 * A **separate** report from {@link GitHubConfigSources} rather than a field
 * added to it, for two reasons. It carries more than a source string — the
 * redacted URL and the bypass decision — and a `ConfigSource` cannot say "a
 * proxy was resolved but this host is bypassed", which is precisely the state an
 * operator misreads. And `configSources` has an exact shape that shipped
 * consumers and tests compare against, which R14 forbids changing.
 */
export interface GitHubProxyReport {
  /**
   * Where the proxy setting came from: `option`, `default` (meaning none was
   * configured), or the exact variable — `env:HTTPS_PROXY`, `env:GITHUB_PROXY`.
   */
  source: ConfigSource;
  /**
   * The configured proxy, with its password replaced by `***` (R10). `null`
   * when none is configured.
   *
   * Present even when {@link bypassed} is `true` — "configured but bypassed"
   * and "not configured" are different states, and conflating them is the
   * diagnostic mistake this report exists to prevent.
   */
  url: string | null;
  /** What this client will actually do: dial through the proxy, or connect direct. */
  effective: 'proxy' | 'direct';
  /** Whether a configured proxy was suppressed because the base URL is on the bypass list. */
  bypassed: boolean;
  /** Where the bypass list came from: `option`, `default` (empty), or `env:NO_PROXY`. */
  bypassSource: ConfigSource;
  /** The bypass entries in effect, parsed and trimmed. */
  bypass: readonly string[];
}

/** The subset of a client's options that participates in environment resolution. */
export interface ResolvableOptions {
  /** `null` forces an anonymous client without disabling resolution for anything else (R4, D3). */
  token?: string | null;
  baseUrl?: string;
  apiVersion?: string;
  userAgent?: string;
  timeoutMs?: number;
  /**
   * HTTP proxy to route every request through (PRD 0002, R1, R4).
   *
   * Omit it and one is resolved from `GITHUB_PROXY`, then the scheme-matched
   * pair — `https_proxy`/`HTTPS_PROXY` for an `https:` base URL,
   * `http_proxy`/`HTTP_PROXY` for an `http:` one.
   *
   * Pass `null` to force a **direct** connection, suppressing the environment
   * for the proxy alone and leaving the token, base URL and the rest of
   * resolution in place — the same shape as `token: null`.
   */
  proxy?: string | null;
  /**
   * Hosts to reach directly even when a proxy is configured (R2).
   *
   * A comma-separated string or an array, using curl's `NO_PROXY` rules.
   * Resolved from `GITHUB_NO_PROXY`, then `no_proxy`, then `NO_PROXY` when
   * omitted. `null` is an explicitly **empty** list: bypass nothing, whatever
   * the environment says.
   */
  proxyBypass?: string | readonly string[] | null;
  /** `false` disables **every** environment read for this client (R5). */
  env?: boolean;
}

/** One client's effective configuration, with the provenance of each value. */
export interface ResolvedConfig {
  token: string | undefined;
  baseUrl: string;
  apiVersion: string;
  userAgent: string;
  timeoutMs: number;
  sources: GitHubConfigSources;
  /**
   * The proxy to dial, credentials intact — `undefined` for a direct
   * connection, including when a configured proxy is bypassed (PRD 0002, R2).
   *
   * This is the one field in this layer that carries a secret. It is consumed
   * by the client to build a dispatcher and is never exposed by an accessor;
   * {@link ResolvedConfig.proxy} is the redacted, showable view (R10).
   */
  proxyUrl: string | undefined;
  /** Where the proxy came from and what it will do, redacted and safe to log (R12). */
  proxy: GitHubProxyReport;
}

/**
 * Read `process.env` at call time (R6).
 *
 * Reached through `globalThis` and defaulted to an empty object so a runtime
 * without `process` — a browser, an edge worker — behaves as an empty
 * environment rather than throwing. Absence is the normal case, never an error
 * (R9).
 */
function readEnvironment(): Record<string, string | undefined> {
  // Guarded rather than assumed. These are Node packages, but a library that
  // throws on import in a browser or an edge worker is a library that cannot be
  // bundled — and an absent environment is simply an empty one.
  if (typeof process === 'undefined') return {};
  return process.env;
}

/** One variable's value, or `undefined` when it is absent, empty or whitespace-only (R1). */
function read(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  // Trimmed, then treated as absent when nothing is left: an empty variable is
  // how a shell spells "unset", and a trailing newline is how `$(...)` spells
  // a token. Neither should authenticate a request or point it at a host.
  const value = raw.trim();
  return value === '' ? undefined : value;
}

/** The first variable in `names` holding a usable value (R1, R2). */
function firstSet(
  env: Record<string, string | undefined>,
  names: readonly string[],
): { variable: string; value: string } | undefined {
  for (const name of names) {
    const value = read(env, name);
    if (value !== undefined) return { variable: name, value };
  }
  return undefined;
}

/** Drop trailing slashes, so a base URL never joins into a doubled separator (R2). */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

/**
 * `GITHUB_API_URL`, used verbatim (R2).
 *
 * Any path prefix survives — a GHES runner's `GITHUB_API_URL` already carries
 * `/api/v3`, and `joinPath` is built to preserve it. Only trailing slashes are
 * removed, and only so the join cannot double one.
 */
function baseUrlFromApiUrl(value: string, variable: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GitHubEnvironmentError(
      variable,
      value,
      'an absolute URL, for example https://ghe.example.test/api/v3',
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new GitHubEnvironmentError(
      variable,
      value,
      'an http: or https: URL, for example https://ghe.example.test/api/v3',
    );
  }
  const stripped = stripTrailingSlashes(value);
  // `https://host/` strips to `https://host`, which is still a URL. A value
  // that was *only* slashes is not, and would otherwise become an empty base.
  return stripped === '' ? value : stripped;
}

/**
 * `GH_HOST`, mapped the way the `gh` CLI maps it (R2, D4).
 *
 * `github.com` is the public API and lives at `api.github.com`; every other
 * host is a GitHub Enterprise Server whose REST root is `/api/v3`.
 *
 * A value carrying a scheme (`https://ghe.example.test`) is accepted — it is
 * unambiguous, and rejecting it would fail a deployment for a reason nobody
 * can see. A value carrying a **path** is rejected, because `GH_HOST` cannot
 * express one and silently dropping it is precisely the failure R9 exists to
 * prevent; `GITHUB_API_URL` is the variable for that.
 */
function baseUrlFromHost(value: string, variable: string): string {
  const expected =
    'a hostname, for example ghe.example.test. Use GITHUB_API_URL for a URL carrying a path';

  let host = value;
  if (/^https?:\/\//i.test(host)) {
    let parsed: URL;
    try {
      parsed = new URL(host);
    } catch {
      throw new GitHubEnvironmentError(variable, value, expected);
    }
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      throw new GitHubEnvironmentError(variable, value, expected);
    }
    host = parsed.host;
  }

  host = stripTrailingSlashes(host);
  if (host === '' || host.includes('/') || host.includes('?') || host.includes('#')) {
    throw new GitHubEnvironmentError(variable, value, expected);
  }
  if (host.toLowerCase() === 'github.com') return DEFAULT_BASE_URL;

  const candidate = `https://${host}/api/v3`;
  try {
    // Catches a host with a space, a credential, or anything else that cannot
    // be a host — here, at construction, rather than as a `TypeError` from the
    // first request (R9).
    new URL(candidate);
  } catch {
    throw new GitHubEnvironmentError(variable, value, expected);
  }
  return candidate;
}

/**
 * `GITHUB_API_TIMEOUT`, in milliseconds (R3, R9).
 *
 * A typo is an error, not a silent fall back to the default — the failure mode
 * `parseInt(…) || 30000` ships, where a misconfigured deployment looks
 * correctly configured. Zero and negatives are rejected: neither can mean a
 * timeout. A very small positive value is legal and indistinguishable from
 * intent, which is why the unit is stated everywhere it is documented.
 */
function timeoutFrom(value: string, variable: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new GitHubEnvironmentError(
      variable,
      value,
      'a positive number of milliseconds, for example 30000',
    );
  }
  return parsed;
}

/**
 * Resolve one client's configuration: **explicit option > environment >
 * package default** (R4).
 *
 * Called once per construction. At most seven variables are read, and none at
 * all when `env` is `false` or when every setting was passed explicitly.
 *
 * An option key that is present but `undefined` is treated as absent, because
 * a conditional spread of a missing key is indistinguishable from an explicit
 * `undefined` in JavaScript — and every construction site in this repository
 * builds its options by conditional spread. `token: null` is the way to say
 * "anonymous, here" without disabling resolution for anything else.
 */
export function resolveConfig(options: ResolvableOptions = {}): ResolvedConfig {
  const useEnv = options.env !== false;
  const env = useEnv ? readEnvironment() : {};

  const sources: GitHubConfigSources = {
    token: 'default',
    baseUrl: 'default',
    apiVersion: 'default',
    userAgent: 'default',
    timeoutMs: 'default',
  };

  let token: string | undefined;
  if (options.token !== undefined) {
    // Including `null`: an explicit anonymous client. `''` keeps its existing
    // meaning — no `Authorization` header at all, rather than an empty one.
    token = options.token ?? undefined;
    sources.token = 'option';
  } else {
    const hit = firstSet(env, TOKEN_VARIABLES);
    if (hit !== undefined) {
      token = hit.value;
      sources.token = `env:${hit.variable}`;
    }
  }

  let baseUrl = DEFAULT_BASE_URL;
  if (options.baseUrl !== undefined) {
    baseUrl = options.baseUrl;
    sources.baseUrl = 'option';
  } else {
    const hit = firstSet(env, BASE_URL_VARIABLES);
    if (hit !== undefined) {
      baseUrl =
        hit.variable === 'GH_HOST'
          ? baseUrlFromHost(hit.value, hit.variable)
          : baseUrlFromApiUrl(hit.value, hit.variable);
      sources.baseUrl = `env:${hit.variable}`;
    }
  }

  let apiVersion = DEFAULT_API_VERSION;
  if (options.apiVersion !== undefined) {
    apiVersion = options.apiVersion;
    sources.apiVersion = 'option';
  } else {
    const value = read(env, API_VERSION_VARIABLE);
    if (value !== undefined) {
      apiVersion = value;
      sources.apiVersion = `env:${API_VERSION_VARIABLE}`;
    }
  }

  let userAgent = DEFAULT_USER_AGENT;
  if (options.userAgent !== undefined) {
    userAgent = options.userAgent;
    sources.userAgent = 'option';
  } else {
    const value = read(env, USER_AGENT_VARIABLE);
    if (value !== undefined) {
      userAgent = value;
      sources.userAgent = `env:${USER_AGENT_VARIABLE}`;
    }
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (options.timeoutMs !== undefined) {
    timeoutMs = options.timeoutMs;
    sources.timeoutMs = 'option';
  } else {
    const value = read(env, TIMEOUT_VARIABLE);
    if (value !== undefined) {
      timeoutMs = timeoutFrom(value, TIMEOUT_VARIABLE);
      sources.timeoutMs = `env:${TIMEOUT_VARIABLE}`;
    }
  }

  // Resolved **last**, and deliberately so: both the scheme that selects the
  // proxy variable and the host the bypass list is matched against come from
  // the base URL *after* its own resolution (PRD 0002, R3). Deciding either
  // against `DEFAULT_BASE_URL` would proxy a GHES deployment by the wrong
  // variable, or fail to bypass a host the operator did bypass.
  const { proxyUrl, proxy } = resolveProxy(options, env, baseUrl);

  return { token, baseUrl, apiVersion, userAgent, timeoutMs, sources, proxyUrl, proxy };
}

/**
 * Resolve the proxy and its bypass list (PRD 0002, R1–R4).
 *
 * The same order as everything else — **explicit option > environment > no
 * proxy** — applied to two settings that interact: a proxy is resolved first,
 * then suppressed if the bypass list covers the host. Both halves are reported,
 * because "no proxy configured" and "proxy configured, host bypassed" are
 * different answers to the same question (R12).
 */
function resolveProxy(
  options: ResolvableOptions,
  env: Record<string, string | undefined>,
  baseUrl: string,
): { proxyUrl: string | undefined; proxy: GitHubProxyReport } {
  let configured: string | undefined;
  let source: ConfigSource = 'default';

  if (options.proxy !== undefined) {
    // Including `null`: an explicit direct connection. It suppresses the
    // environment for the proxy alone, leaving the token and base URL resolved
    // — the same shape `token: null` already has.
    if (options.proxy !== null) {
      configured = parseProxyValue(options.proxy, { kind: 'option', name: 'proxy' });
    }
    source = 'option';
  } else {
    // Scheme-selected, so only one of the two pairs is ever read. That is what
    // keeps the count at thirteen rather than fifteen (N3).
    const hit = firstSet(env, proxyVariablesFor(protocolOf(baseUrl)));
    if (hit !== undefined) {
      configured = parseProxyValue(hit.value, { kind: 'environment', name: hit.variable });
      source = `env:${hit.variable}`;
    }
  }

  let bypass: string[] = [];
  let bypassSource: ConfigSource = 'default';

  if (options.proxyBypass !== undefined) {
    // `null` is an explicitly empty list — "bypass nothing, whatever NO_PROXY
    // says" — which is not the same as omitting the option.
    bypass = options.proxyBypass === null ? [] : parseBypassList(options.proxyBypass);
    bypassSource = 'option';
  } else {
    const hit = firstSet(env, NO_PROXY_VARIABLES);
    if (hit !== undefined) {
      bypass = parseBypassList(hit.value);
      bypassSource = `env:${hit.variable}`;
    }
  }

  // An explicit proxy is still subject to the bypass list (R4): the list says
  // which hosts are reachable directly, and that is a fact about the network
  // rather than a preference the proxy option overrides.
  const bypassed = configured !== undefined && isBypassed(bypass, baseUrl);
  const proxyUrl = bypassed ? undefined : configured;

  return {
    proxyUrl,
    proxy: {
      source,
      url: configured === undefined ? null : redactProxyUrl(configured),
      effective: proxyUrl === undefined ? 'direct' : 'proxy',
      bypassed,
      bypassSource,
      bypass,
    },
  };
}

/**
 * The scheme of a resolved base URL, for selecting the proxy variable (R3).
 *
 * An unparseable base URL falls back to `https:` rather than throwing: it is
 * not this function's failure to report, the request itself will raise a better
 * one, and `https:` is the scheme every default in this layer uses.
 */
function protocolOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).protocol;
  } catch {
    return 'https:';
  }
}
