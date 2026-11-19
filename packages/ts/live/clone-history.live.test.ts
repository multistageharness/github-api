/**
 * Live: a real clone, and its local git history checked against the REST API.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clone } from '@internal/github-sdk-clone';
import { createRestClient } from '@internal/github-sdk-fetch-rest-api';

import { CLONE_URL, DEFAULT_BRANCH, HEAD_SHA, HISTORY, LIVE, OWNER, REPO, STABLE_BRANCHES } from './targets.js';

const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

describe.runIf(LIVE)('live: clone + history', () => {
  let base: string;
  let repoDir: string;
  let info: Awaited<ReturnType<typeof clone>>;

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'gh-live-clone-'));
    repoDir = join(base, REPO);
    info = await clone(CLONE_URL, repoDir);
  });

  afterAll(() => {
    if (base) rmSync(base, { recursive: true, force: true });
  });

  it('clones onto the default branch at the pinned HEAD', () => {
    expect(info.path).toBe(repoDir);
    expect(git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(DEFAULT_BRANCH);
    expect(git(repoDir, 'rev-parse', 'HEAD')).toBe(HEAD_SHA);
    expect(git(repoDir, 'status', '--porcelain')).toBe('');
  });

  it('reports branch, remote and remote branches consistent with the working copy', () => {
    expect(info.branch).toBe(DEFAULT_BRANCH);
    expect(info.remotes?.find((r) => r.name === 'origin')?.refs.fetch).toBe(CLONE_URL);
    for (const b of STABLE_BRANCHES) expect(info.branches?.all).toContain(`remotes/origin/${b}`);
  });

  it.runIf(Boolean(token))('an authenticated clone leaves no credentials in .git/config or the result', async () => {
    const dir = join(base, 'authenticated');
    const authed = await clone(CLONE_URL, dir, { token });
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(HEAD_SHA);
    expect(git(dir, 'config', '--get', 'remote.origin.url')).toBe(CLONE_URL);
    expect(readFileSync(join(dir, '.git', 'config'), 'utf8')).not.toContain(token!);
    expect(JSON.stringify(authed)).not.toContain(token!);
  });

  it('local history, parents included, matches the pinned graph', () => {
    const lines = git(repoDir, 'rev-list', '--parents', '--topo-order', 'HEAD').split('\n');
    const local = lines.map((l) => {
      const [sha, ...parents] = l.split(' ');
      return { sha, parents };
    });
    // --topo-order lists a merge's second parent before its first; compare as sets per commit.
    expect(local.map((c) => c.sha).sort()).toEqual(HISTORY.map((c) => c.sha).sort());
    for (const expected of HISTORY) {
      expect(local.find((c) => c.sha === expected.sha)?.parents).toEqual([...expected.parents]);
    }
    expect(git(repoDir, 'log', '-1', '--format=%s', HISTORY[2].sha)).toBe(HISTORY[2].message);
  });

  it('local history equals the REST API history for the same ref', async () => {
    const api = await createRestClient().paginate<{ sha: string }>('GET /repos/{owner}/{repo}/commits', {
      owner: OWNER,
      repo: REPO,
      sha: HEAD_SHA,
      per_page: 100,
    });
    const local = git(repoDir, 'log', '--format=%H', 'HEAD').split('\n');
    expect(local).toEqual(api.map((c) => c.sha));
  });

  it('remote branches include every long-standing branch the API lists', async () => {
    const remote = git(repoDir, 'branch', '-r', '--format=%(refname:lstrip=3)')
      .split('\n')
      .filter((b) => b !== 'HEAD');
    const api = await createRestClient().paginate<{ name: string }>('GET /repos/{owner}/{repo}/branches', {
      owner: OWNER,
      repo: REPO,
      per_page: 100,
    });
    for (const b of STABLE_BRANCHES) {
      expect(remote).toContain(b);
      expect(api.map((x) => x.name)).toContain(b);
    }
  });

  it('README content at HEAD matches the API blob', async () => {
    const local = readFileSync(join(repoDir, 'README'), 'utf8');
    const res = await createRestClient().get<{ content: string; encoding: string }>(
      'GET /repos/{owner}/{repo}/contents/{path}',
      { owner: OWNER, repo: REPO, path: 'README', ref: HEAD_SHA },
    );
    expect(res.data.encoding).toBe('base64');
    expect(Buffer.from(res.data.content, 'base64').toString('utf8')).toBe(local);
  });
});
