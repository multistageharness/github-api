/**
 * @fileoverview Persistent CLI configuration for the Issues SDK.
 * @module lib/config
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Shape persisted to `~/.github-issues/config.json`. */
export interface IssuesConfig {
  owner?: string;
  repo?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

/** `~/.github-issues/config.json` */
export function configPath(): string {
  return join(homedir(), '.github-issues', 'config.json');
}

/**
 * Read the stored config.
 *
 * A missing or unparseable file yields `{}` rather than throwing — config is an
 * optional convenience, and a corrupt file should not make the CLI unusable.
 */
export async function loadConfig(): Promise<IssuesConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as IssuesConfig) : {};
  } catch {
    return {};
  }
}

/** Write the config, creating the directory if needed. */
export async function saveConfig(config: IssuesConfig): Promise<void> {
  const path = configPath();
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** Create an empty config file, preserving anything already stored. */
export async function initConfig(): Promise<IssuesConfig> {
  const existing = await loadConfig();
  const config: IssuesConfig = { owner: '', repo: '', baseUrl: '', ...existing };
  await saveConfig(config);
  return config;
}

/** Inputs {@link resolveRepository} can resolve a repository from. */
export interface ResolveRepositoryOptions {
  /** `owner/repo`, or a bare repo name to be paired with configured `owner`. */
  repo?: string;
  owner?: string;
  [key: string]: unknown;
}

/**
 * Resolve the target repository from CLI options, falling back to config.
 *
 * @throws {Error} when neither source yields both an owner and a repo.
 */
export async function resolveRepository(
  options: ResolveRepositoryOptions = {}
): Promise<{ owner: string; repo: string }> {
  if (options.repo?.includes('/')) {
    const [owner, repo] = options.repo.split('/', 2);
    if (owner && repo) return { owner, repo };
  }

  const config = await loadConfig();
  const owner = options.owner || config.owner;
  const repo = options.repo || config.repo;

  if (!owner || !repo) {
    throw new Error(
      'Repository not specified. Use --repo owner/name or run `github-issues init` to store a default.'
    );
  }

  return { owner, repo };
}

export default { loadConfig, saveConfig, initConfig, resolveRepository, configPath };
