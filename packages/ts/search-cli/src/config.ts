/**
 * Environment-derived settings, resolved once at startup.
 *
 * Every function takes `env` (and `home`) injected, so the precedence rules are
 * unit-testable without touching the real process environment. Names follow the
 * package rule `.claude/rules/github.md`: the GitHub Actions variable names are
 * read verbatim, and a value the user set always wins over a default.
 */

import { join } from 'node:path';
import { validatePerPage } from './query.js';
import { UsageError } from './argv.js';
import type { CliArgs } from './argv.js';

/** An environment map, `process.env`-shaped. */
export type Env = Record<string, string | undefined>;

/** GitHub's own default page size; also ours when nothing is configured. */
export const GITHUB_DEFAULT_PER_PAGE = 30;

const PUBLIC_API_URL = 'https://api.github.com';

/** Trimmed value, or `undefined` for unset / whitespace-only. */
const read = (env: Env | undefined, name: string): string | undefined => {
  const value = String(env?.[name] ?? '').trim();
  return value === '' ? undefined : value;
};

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '') || value;

/**
 * `GH_HOST` → REST base URL, mapped the way the `gh` CLI (and the fetch layer's
 * own resolver) maps it: `github.com` is `api.github.com`; any other host is a
 * GitHub Enterprise Server whose REST root is `/api/v3`.
 */
export function baseURLFromHost(host: string): string {
  const bare = stripTrailingSlashes(String(host).trim().replace(/^https?:\/\//i, ''));
  if (bare.toLowerCase() === 'github.com') return PUBLIC_API_URL;
  return `https://${bare}/api/v3`;
}

/**
 * The REST base URL, highest precedence first:
 *
 * 1. `GITHUB_API_URL` — the variable GitHub Actions injects (GHES runners carry
 *    `/api/v3` already).
 * 2. `GITHUB_API_BASE_URL` — this CLI's original, non-standard name. Deprecated,
 *    still honored so existing `.env` files keep working.
 * 3. `GH_HOST` — a hostname, mapped like the `gh` CLI.
 *
 * Returns `undefined` when none is set, so the SDK applies its own default.
 * (The search client always hands the transport an explicit base URL, which is
 * why this resolution has to happen here rather than in the transport.)
 */
export function resolveBaseURL(env: Env = {}): string | undefined {
  const apiUrl = read(env, 'GITHUB_API_URL') ?? read(env, 'GITHUB_API_BASE_URL');
  if (apiUrl) return stripTrailingSlashes(apiUrl);
  const host = read(env, 'GH_HOST');
  if (host) return baseURLFromHost(host);
  return undefined;
}

/** The resolved default page size, and whether it came from the environment. */
export interface PerPageSetting {
  value: number;
  /** True only for a valid configured value — the non-interactive path sends `per_page` only then. */
  fromEnv: boolean;
}

/**
 * `GITHUB_SEARCH_PER_PAGE`, validated once. An invalid value falls back to 30
 * with a warning instead of pre-filling the prompt with `"NaN"`.
 */
export function resolvePerPage(
  env: Env = {},
  { warn = () => {} }: { warn?: (message: string) => void } = {}
): PerPageSetting {
  const raw = read(env, 'GITHUB_SEARCH_PER_PAGE');
  if (raw === undefined) return { value: GITHUB_DEFAULT_PER_PAGE, fromEnv: false };
  if (validatePerPage(raw)) {
    warn(
      `GITHUB_SEARCH_PER_PAGE="${raw}" is not an integer 1–100; using ${GITHUB_DEFAULT_PER_PAGE}.`
    );
    return { value: GITHUB_DEFAULT_PER_PAGE, fromEnv: false };
  }
  return { value: Number(raw), fromEnv: true };
}

/**
 * Where results are persisted when `--output-dir` is not given.
 *
 * A per-user state directory, not the caller's cwd: run from inside another
 * repository, a cwd-relative `.output/` lands untracked in that working tree —
 * one `git add .` away from committing `code` search results, which can hold
 * private source.
 */
export function resolveOutputDir(env: Env = {}, home = ''): string {
  const configured = read(env, 'GITHUB_SEARCH_OUTPUT_DIR');
  if (configured) return configured;
  const stateHome = read(env, 'XDG_STATE_HOME') ?? join(home, '.local', 'state');
  return join(stateHome, 'github-search-wizard');
}

/** The proxy subset of the client options. */
export interface ProxyOptions {
  proxy?: string | null;
  proxyBypass?: string;
}

/**
 * Map `--proxy` / `--no-proxy` / `--proxy-bypass` onto the client's proxy
 * options. Keys are omitted, never `undefined`: an unset proxy is resolved from
 * `GITHUB_PROXY` / `HTTPS_PROXY` / `NO_PROXY` by the transport, and an explicit
 * `null` forces a direct connection.
 *
 * @throws {UsageError} on `--proxy` together with `--no-proxy`.
 */
export function proxyOptionsFromArgv(
  argv: Pick<CliArgs, 'proxy' | 'no-proxy' | 'proxy-bypass'>
): ProxyOptions {
  if (argv.proxy !== undefined && argv['no-proxy']) {
    throw new UsageError('--proxy and --no-proxy cannot be used together.');
  }
  const options: ProxyOptions = {};
  if (argv['no-proxy']) options.proxy = null;
  else if (argv.proxy !== undefined) options.proxy = argv.proxy;
  if (argv['proxy-bypass'] !== undefined) options.proxyBypass = argv['proxy-bypass'];
  return options;
}
