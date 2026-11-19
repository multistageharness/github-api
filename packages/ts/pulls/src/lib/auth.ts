/**
 * Reconstructed `src/lib/auth.ts` for `@internal/github-sdk-pulls`.
 *
 * Contract, from INTERFACE.md § Authentication: `getAuth(): string | undefined` resolves the token
 * from four environment variables in priority order.
 *
 * The distinction INTERFACE.md draws — and `tests/index.test.ts` asserts — is that the **bare
 * constructor** consults only `process.env.GITHUB_TOKEN`, while `createClient` applies this full
 * chain by calling `getAuth()`. That asymmetry is deliberate upstream behaviour, so it is
 * reproduced rather than tidied up.
 */

/** Checked in order; the first non-empty value wins. */
export const TOKEN_ENV_VARS = [
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
] as const;

/**
 * Resolve a GitHub token from the environment.
 *
 * Returns `undefined` rather than throwing when nothing is set: an absent token is legal — requests
 * proceed unauthenticated against GitHub's lower anonymous rate limit — and the client warns.
 */
export function getAuth(): string | undefined {
  for (const name of TOKEN_ENV_VARS) {
    const value = process.env[name];
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

/** The variable that supplied the token, for diagnostics. Never the value. */
export function getAuthSource(): string | undefined {
  for (const name of TOKEN_ENV_VARS) {
    const value = process.env[name];
    if (typeof value === 'string' && value !== '') return name;
  }
  return undefined;
}

export default { getAuth, getAuthSource, TOKEN_ENV_VARS };
