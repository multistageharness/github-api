/**
 * @fileoverview Persistent CLI configuration.
 * @module lib/utils/config
 */

import fs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Stored configuration; keys are open-ended so the CLI can set any of them. */
export type GistConfig = Record<string, unknown>;

/** `~/.config/gist/config.json` */
export function configPath(): string {
  return join(homedir(), '.config', 'gist', 'config.json');
}

/**
 * Reads and writes the CLI's config file.
 *
 * A missing or unreadable file is treated as empty rather than fatal — config is
 * an optional convenience, and a corrupt file should not make the CLI unusable.
 */
export class ConfigManager {
  constructor(private readonly path: string = configPath()) {}

  /** Load the whole config. Returns `{}` when absent or unparseable. */
  load(): GistConfig {
    try {
      const raw = fs.readFileSync(this.path, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as GistConfig) : {};
    } catch {
      return {};
    }
  }

  /** Overwrite the whole config, creating the directory if needed. */
  save(config: GistConfig): void {
    fs.mkdirSync(dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  /** Read one key. */
  get(key: string): unknown {
    return this.load()[key];
  }

  /** Write one key. */
  set(key: string, value: unknown): void {
    const config = this.load();
    config[key] = value;
    this.save(config);
  }

  /** Remove one key. */
  delete(key: string): void {
    const config = this.load();
    delete config[key];
    this.save(config);
  }

  /** Remove every key. */
  clear(): void {
    this.save({});
  }
}

/** Shared instance used by the CLI. */
export const config = new ConfigManager();

export default ConfigManager;
