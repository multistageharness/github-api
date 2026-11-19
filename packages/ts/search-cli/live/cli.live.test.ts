/**
 * Live: the real binary, real GitHub Search API, pinned public data.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The built bin; tests/global-setup.ts (wired in vitest.live.config.ts) compiles it first.
const CLI = fileURLToPath(new URL('../dist/esm/cli.js', import.meta.url));
const LIVE = process.env.GITHUB_LIVE === '1';
const REPO = 'octocat/Hello-World';
const REPO_ID = 1296269;
const MERGE_SHA = '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d';

interface SearchBody {
  total_count: number;
  items: { id?: number; sha?: string }[];
}

/** `--json` prints the result itself; `.result` covers a wrapped payload. */
const parseResult = (stdout: string): SearchBody => {
  const body = JSON.parse(stdout) as SearchBody & { result?: SearchBody };
  return body.result ?? body;
};

function run(
  args: string[],
  env: NodeJS.ProcessEnv = {}
): { code: number | null; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [CLI, ...args, '--no-save'], {
    encoding: 'utf8',
    // A local .env must not change what a live run asserts.
    env: { ...process.env, GSW_DOTENV: '0', ...env },
    timeout: 50_000,
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe.runIf(LIVE)('live: github-search-wizard', () => {
  it('--json repositories search returns exactly the pinned repo', () => {
    const { code, stdout } = run(['--endpoint', 'repositories', '--q', `repo:${REPO}`, '--json']);
    expect(code).toBe(0);
    const result = parseResult(stdout);
    expect(result.total_count).toBe(1);
    expect(result.items[0]?.id).toBe(REPO_ID);
  });

  it('--json commit search finds the pinned merge commit by hash', () => {
    const { code, stdout } = run(['--endpoint', 'commits', '--q', `repo:${REPO} hash:${MERGE_SHA}`, '--json']);
    expect(code).toBe(0);
    const result = parseResult(stdout);
    expect(result.items.map((i) => i.sha)).toContain(MERGE_SHA);
  });

  it('human output names real commits as repo@sha with the subject line', () => {
    const { code, stdout } = run(['--endpoint', 'commits', '--q', `repo:${REPO} hash:${MERGE_SHA}`]);
    expect(code).toBe(0);
    expect(stdout).toContain(`${REPO}@${MERGE_SHA.slice(0, 7)}`);
    expect(stdout).toContain('Merge pull request #6');
    expect(stdout).not.toContain('<unnamed>');
  });

  it('a rejected token exits 1 and never echoes the token', () => {
    const fake = 'ghp_' + 'x'.repeat(36);
    const { code, stdout, stderr } = run(['--endpoint', 'repositories', '--q', `repo:${REPO}`, '--json'], {
      GITHUB_TOKEN: fake,
      GH_TOKEN: '',
    });
    expect(code).toBe(1);
    expect(stdout + stderr).not.toContain(fake);
    expect(stderr).toMatch(/401|unauthori[sz]ed|bad credentials/i);
  });
});
