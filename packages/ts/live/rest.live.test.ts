/**
 * Live: the transport core, pagination and rate-limit tracking against api.github.com.
 */
import { describe, expect, it } from 'vitest';
import { createRestClient, parseLinkHeader } from '@internal/github-sdk-fetch-rest-api';

import { DEFAULT_BRANCH, HISTORY, LIVE, OWNER, REPO, REPO_ID } from './targets.js';

interface Repo { id: number; full_name: string; default_branch: string; private: boolean }
interface Commit { sha: string; parents: { sha: string }[]; commit: { message: string } }
interface RateLimitBody { resources: { core: { limit: number; remaining: number; reset: number } } }

describe.runIf(LIVE)('live: fetch-rest-api', () => {
  const client = createRestClient();

  it('fetches a pinned repository', async () => {
    const res = await client.get<Repo>('GET /repos/{owner}/{repo}', { owner: OWNER, repo: REPO });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      id: REPO_ID,
      full_name: `${OWNER}/${REPO}`,
      default_branch: DEFAULT_BRANCH,
      private: false,
    });
  });

  it('follows real Link headers one commit per page and reproduces the history', async () => {
    const pages: string[] = [];
    const shas: string[] = [];
    for await (const page of client.paginate.iterator<Commit[]>(
      'GET /repos/{owner}/{repo}/commits',
      { owner: OWNER, repo: REPO, sha: HISTORY[0].sha, per_page: 1 },
    )) {
      pages.push(page.url);
      for (const c of page.data as unknown as Commit[]) shas.push(c.sha);
    }
    expect(pages).toHaveLength(HISTORY.length);
    expect(shas).toEqual(HISTORY.map((c) => c.sha));
  });

  it('collects the same history in one call and keeps parent links intact', async () => {
    const commits = await client.paginate<Commit>('GET /repos/{owner}/{repo}/commits', {
      owner: OWNER,
      repo: REPO,
      sha: HISTORY[0].sha,
      per_page: 100,
    });
    expect(
      commits.map((c) => ({
        sha: c.sha,
        parents: c.parents.map((p) => p.sha),
        message: c.commit.message.split('\n')[0],
      })),
    ).toEqual(HISTORY.map((c) => ({ sha: c.sha, parents: [...c.parents], message: c.message })));
  });

  it('parses the real Link header GitHub sends', async () => {
    const res = await client.get('GET /repos/{owner}/{repo}/commits', {
      owner: OWNER,
      repo: REPO,
      sha: HISTORY[0].sha,
      per_page: 1,
    });
    const links = parseLinkHeader(res.headers.get('link'));
    expect(links.next).toMatch(/[?&]page=2\b/);
    expect(links.last).toMatch(/[?&]page=3\b/);
  });

  it('tracks the core budget from real headers, consistent with /rate_limit', async () => {
    await client.get('GET /repos/{owner}/{repo}', { owner: OWNER, repo: REPO });
    const tracked = client.limiter.getStatus('core');
    // /rate_limit itself is free and reports the authoritative numbers.
    const res = await client.get<RateLimitBody>('GET /rate_limit');
    const core = res.data.resources.core;

    expect(tracked.limit).toBe(core.limit);
    // Other processes may spend budget in between; only ever downward.
    expect(tracked.remaining).toBeGreaterThanOrEqual(core.remaining);
    expect(tracked.remaining! - core.remaining).toBeLessThan(50);
    expect(Math.abs(tracked.reset! - core.reset)).toBeLessThanOrEqual(5);
    expect(tracked.resetAt?.getTime()).toBe(tracked.reset! * 1000);
    expect(tracked.exhausted).toBe(false);
    expect(core.reset * 1000).toBeGreaterThan(Date.now() - 5_000);
  });
});
