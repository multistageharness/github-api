/**
 * CLI-side token resolution.
 *
 * The SDK's library code deliberately never reads the environment — the token
 * arrives only via constructor options, and only the CLI reads `GITHUB_TOKEN` / `GH_TOKEN`.
 * This module is that reader.
 *
 * `env` and `prompt` are injected rather than reached for, which is what makes
 * the precedence chain testable without a TTY and without touching the real
 * environment.
 *
 * This module performs **no filesystem writes of any kind**. The token is held
 * in memory only: never cached, never written back to `.env`, never persisted
 * into a `.output/` artifact.
 */

import { AuthError } from '@internal/github-sdk-search/utils';

/** The environment chain, highest precedence first. */
export const TOKEN_ENV_VARIABLES = ['GITHUB_TOKEN', 'GH_TOKEN'] as const;

export interface ResolveTokenInput {
  flagToken?: string | undefined;
  env?: Record<string, string | undefined>;
  prompt?: () => Promise<string | undefined>;
}

/**
 * Resolve a GitHub token by documented precedence:
 * flag → `GITHUB_TOKEN` → `GH_TOKEN` → prompt.
 *
 * The environment pair is the package rule `.claude/rules/github.md`: the names
 * GitHub Actions and the `gh` CLI use. No other alias is invented.
 *
 * Whitespace-only counts as absent — a `.env` line `GITHUB_TOKEN=` must not
 * yield a `' '` token that produces a confusing 401 instead of a clean
 * `AuthError`, and must not shadow a real `GH_TOKEN`.
 *
 * In non-interactive mode `prompt` is `undefined`, so this throws immediately
 * rather than blocking a headless run forever on a hidden prompt.
 *
 * @throws {AuthError} when no source supplies a non-empty token.
 */
export async function resolveToken({ flagToken, env = {}, prompt }: ResolveTokenInput = {}): Promise<string> {
  const fromFlag = (flagToken ?? '').trim();
  if (fromFlag) return fromFlag;

  for (const name of TOKEN_ENV_VARIABLES) {
    const fromEnv = (env[name] ?? '').trim();
    if (fromEnv) return fromEnv;
  }

  if (typeof prompt === 'function') {
    const entered = ((await prompt()) ?? '').trim();
    if (entered) return entered;
  }

  // Never include the token — or a placeholder revealing its length — in the message.
  throw new AuthError(
    'GitHub token required. Set GITHUB_TOKEN or GH_TOKEN, pass --token or --token-stdin, ' +
      'or enter it when prompted.'
  );
}

/**
 * Read a token for `--token-stdin`: the first line of the stream, trimmed.
 * Keeps the value out of argv, so it never reaches shell history or `ps`.
 *
 * @param stream typically `process.stdin`
 * @returns `''` for an empty stream — `resolveToken` then refuses it.
 */
export async function readTokenFromStream(stream: AsyncIterable<string | Buffer>): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += String(chunk);
    if (text.includes('\n')) break;
  }
  return (text.split(/\r?\n/, 1)[0] ?? '').trim();
}
