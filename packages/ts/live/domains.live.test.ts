/**
 * Live: the domain SDKs (repos, users, pulls, git data, search) against pinned public data.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@internal/github-sdk-repos';
import { getUser } from '@internal/github-sdk-users';
import { getPullRequest, listPullRequests } from '@internal/github-sdk-pulls';
import { GitHubClient } from '@internal/github-sdk-git';
import { search } from '@internal/github-sdk-search';

import {
  CLOSED_PR, DEFAULT_BRANCH, HEAD_SHA, HISTORY, LIVE, OWNER, REPO, REPO_ID, USER_ID, USER_LOGIN,
} from './targets.js';

const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];

describe.runIf(LIVE)('live: domain SDKs', () => {
  it('repos: getRepository returns the pinned repository', async () => {
    const repo = (await getRepository(OWNER, REPO)) as Record<string, unknown>;
    expect(repo).toMatchObject({ id: REPO_ID, name: REPO, default_branch: DEFAULT_BRANCH });
  });

  it('users: getUser returns the pinned account', async () => {
    const user = await getUser(USER_LOGIN);
    expect(user).toMatchObject({ login: USER_LOGIN, id: USER_ID, type: 'User' });
  });

  it('pulls: getPullRequest reads a PR closed since 2011', async () => {
    const pr = await getPullRequest(OWNER, REPO, CLOSED_PR.number);
    expect(pr).toMatchObject({ number: CLOSED_PR.number, state: CLOSED_PR.state, title: CLOSED_PR.title });
  });

  it('pulls: listPullRequests honours per_page against a repo with thousands of PRs', async () => {
    const prs = await listPullRequests(OWNER, REPO, { state: 'closed', per_page: 5, page: 1 });
    expect(prs).toHaveLength(5);
    for (const pr of prs) expect(pr.state).toBe('closed');
  });

  it('git: getCommit walks the real parent graph back to the root commit', async () => {
    const git = new GitHubClient({ token });
    for (const expected of HISTORY) {
      const commit = (await git.getCommit(OWNER, REPO, expected.sha)) as {
        sha: string; message: string; parents: { sha: string }[]; tree: { sha: string };
      };
      expect(commit.sha).toBe(expected.sha);
      expect(commit.message.split('\n')[0]).toBe(expected.message);
      expect(commit.parents.map((p) => p.sha)).toEqual([...expected.parents]);
    }
  });

  it('git: getTree of HEAD lists README', async () => {
    const git = new GitHubClient({ token });
    const head = (await git.getCommit(OWNER, REPO, HEAD_SHA)) as { tree: { sha: string } };
    const tree = (await git.getTree(OWNER, REPO, head.tree.sha)) as { tree: { path: string; type: string }[] };
    expect(tree.tree).toContainEqual(expect.objectContaining({ path: 'README', type: 'blob' }));
  });

  it('search: repositories finds exactly the pinned repo', async () => {
    const result = (await search.repositories(`repo:${OWNER}/${REPO}`)) as {
      total_count: number; items: { id: number }[];
    };
    expect(result.total_count).toBe(1);
    expect(result.items[0]?.id).toBe(REPO_ID);
  });
});
