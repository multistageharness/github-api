export type OwnerType = 'User' | 'Organization';

/** A repository as supplied by the consumer (no computed fields). */
export interface Repo {
  repoId: number;
  nodeId: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  owner: string;
  ownerId: number;
  ownerNodeId: string;
  type: OwnerType;
  /** Web URL as returned by the API (`html_url`). Overrides the `baseUrl` derivation. */
  htmlUrl?: string;
  /** SSH clone URL as returned by the API (`ssh_url`). Overrides the `baseUrl` derivation. */
  sshUrl?: string;
}

/** A repo enriched with derived GitHub URLs, computed inside the organism. */
export interface ComputedRepo extends Repo {
  computedRepoUrl: string;
  computedSSHUrl: string;
}

export type Visibility = 'all' | 'public' | 'private';
export type OwnerTypeFilter = 'all' | OwnerType;
export type RepoView = 'table' | 'cards';

/** Default web root used to derive repo URLs. */
export const DEFAULT_GITHUB_BASE_URL = 'https://github.com';

/**
 * Adds the derived `computedRepoUrl` / `computedSSHUrl` fields to a repo.
 *
 * `baseUrl` is the web root of the GitHub instance (default
 * `https://github.com`; for GitHub Enterprise Server e.g.
 * `https://ghe.example.com`). The SSH URL uses that host. A repo's own
 * `htmlUrl` / `sshUrl` win over the derivation when present.
 */
export function withComputed(r: Repo, baseUrl: string = DEFAULT_GITHUB_BASE_URL): ComputedRepo {
  const root = baseUrl.replace(/\/+$/, '');
  let host = 'github.com';
  try {
    host = new URL(root).host;
  } catch {
    // Not an absolute URL: keep the github.com SSH host.
  }
  return {
    ...r,
    computedRepoUrl: r.htmlUrl ?? `${root}/${r.fullName}`,
    computedSSHUrl: r.sshUrl ?? `git@${host}:${r.fullName}.git`,
  };
}
