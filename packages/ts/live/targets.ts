/**
 * Pinned, read-only targets for the live suite.
 *
 * `octocat/Hello-World` is GitHub's own demo repository: its `master` history
 * has been three commits since 2012 and PR #1 has been closed since 2011, so
 * these facts are stable enough to assert exactly. Never assert counts that
 * drift (stars, open PRs, search scores).
 */
export const OWNER = 'octocat';
export const REPO = 'Hello-World';
export const REPO_ID = 1296269;
export const DEFAULT_BRANCH = 'master';
export const CLONE_URL = 'https://github.com/octocat/Hello-World.git';

export const USER_LOGIN = 'octocat';
export const USER_ID = 583231;

/** `master` history, newest first. */
export const HISTORY = [
  {
    sha: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
    parents: [
      '553c2077f0edc3d5dc5d17262f6aa498e69d6f8e',
      '762941318ee16e59dabbacb1b4049eec22f0d303',
    ],
    message: 'Merge pull request #6 from Spaceghost/patch-1',
  },
  {
    sha: '762941318ee16e59dabbacb1b4049eec22f0d303',
    parents: ['553c2077f0edc3d5dc5d17262f6aa498e69d6f8e'],
    message: 'New line at end of file. --Signed off by Spaceghost',
  },
  {
    sha: '553c2077f0edc3d5dc5d17262f6aa498e69d6f8e',
    parents: [],
    message: 'first commit',
  },
] as const;

export const HEAD_SHA = HISTORY[0].sha;

/** Branches that have existed since the repository's early days (others may be added). */
export const STABLE_BRANCHES = ['master', 'octocat-patch-1', 'test'] as const;

export const CLOSED_PR = { number: 1, state: 'closed', title: 'Edited README via GitHub' } as const;

/** Live runs are opt-in: never touch the network from `npm test`. */
export const LIVE = process.env['GITHUB_LIVE'] === '1';
