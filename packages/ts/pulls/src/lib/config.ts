/**
 * Reconstructed `src/lib/config.ts` for `@internal/github-sdk-pulls`.
 *
 * Contract, from INTERFACE.md: a `.gh-pr.json` config with **global file < project file < env**
 * precedence, supplying `baseUrl`, `owner` and `repo`. `src/cli.ts` uses three exports —
 * `loadConfig`, `resolveRepository` and `initConfig`.
 *
 * A missing config file is not an error: the CLI runs fine on flags and environment alone. A
 * *malformed* one is also swallowed here rather than thrown, because `loadConfig()` is called
 * unconditionally at CLI startup — including by `gh-pr config --init`, which is the command someone
 * runs to fix a broken config. Throwing would make the repair path unreachable.
 */

/*
 * The default `fs` export, with property access — `fs.existsSync(...)` rather than a named import.
 *
 * Not a style preference. `tests/index.test.ts` intercepts config loading with
 * `vi.spyOn(fs, 'readFileSync')`, and a named import binds directly to the function, so a spy on the
 * namespace never sees the call. Reading through the object is what makes the package's own test
 * able to substitute a filesystem — and that test is the specification this file is reconstructed
 * from.
 */
import fs from 'fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** The resolved configuration. Open-ended: `gh-pr config --get <key>` reads arbitrary keys. */
export interface Config {
  baseUrl?: string;
  owner?: string;
  repo?: string;
  [key: string]: unknown;
}

export const CONFIG_FILENAME = '.gh-pr.json';
export const DEFAULT_BASE_URL = 'https://api.github.com';

/** `~/.gh-pr.json` — the global file, lowest precedence. */
export function globalConfigPath(): string {
  return join(homedir(), CONFIG_FILENAME);
}

/** `./.gh-pr.json` — the project file, overriding the global one. */
export function projectConfigPath(cwd: string = process.cwd()): string {
  return join(resolve(cwd), CONFIG_FILENAME);
}

function readIfPresent(path: string): Config {
  if (!fs.existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path, 'utf8') as string);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Config) : {};
  } catch {
    // See the module note: the repair path must stay reachable.
    return {};
  }
}

/**
 * Merge the global file, the project file and the environment.
 *
 * Environment overrides are applied last and only when set, so an empty variable does not blank out
 * a configured value.
 */
export function loadConfig(cwd: string = process.cwd()): Config {
  const config: Config = {
    baseUrl: DEFAULT_BASE_URL,
    ...readIfPresent(globalConfigPath()),
    ...readIfPresent(projectConfigPath(cwd)),
  };

  if (process.env.GITHUB_API_URL) config.baseUrl = process.env.GITHUB_API_URL;
  if (process.env.GITHUB_OWNER) config.owner = process.env.GITHUB_OWNER;
  if (process.env.GITHUB_REPO) config.repo = process.env.GITHUB_REPO;

  return config;
}

/**
 * Resolve `{ owner, repo }` from CLI options.
 *
 * `--repo owner/repo` wins over separate `owner`/`repo` keys, because someone who typed the
 * combined form on this invocation means it to override whatever the config holds.
 */
export function resolveRepository(
  options: Record<string, unknown> = {},
): { owner?: string; repo?: string } {
  const combined = options.repo;

  if (typeof combined === 'string' && combined.includes('/')) {
    const [owner, repo] = combined.split('/', 2);
    return { owner: owner || undefined, repo: repo || undefined };
  }

  return {
    owner: typeof options.owner === 'string' ? options.owner : undefined,
    repo: typeof combined === 'string' ? combined : undefined,
  };
}

/**
 * Write a starter config and return its path.
 *
 * Refuses to overwrite: `--init` on a machine that already has a config is far more likely to be a
 * mistake than an intention, and silently replacing someone's settings is not recoverable.
 */
export function initConfig(global = false): string {
  const path = global ? globalConfigPath() : projectConfigPath();

  if (fs.existsSync(path)) {
    throw new Error(`Configuration already exists at ${path}`);
  }

  const template: Config = { baseUrl: DEFAULT_BASE_URL, owner: '', repo: '' };
  fs.writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  return path;
}

export default {
  loadConfig,
  resolveRepository,
  initConfig,
  globalConfigPath,
  projectConfigPath,
  CONFIG_FILENAME,
  DEFAULT_BASE_URL,
};
