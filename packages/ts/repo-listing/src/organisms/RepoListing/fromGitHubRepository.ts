import type { OwnerType, Repo } from './types';

/**
 * The subset of a GitHub REST repository object that {@link fromGitHubRepository}
 * reads. Declared structurally here (the package imports no sibling packages),
 * so any REST/SDK repository object is assignable to it.
 */
export interface GitHubRepositoryLike {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  html_url?: string;
  ssh_url?: string;
  owner: { login: string; id: number; node_id: string; type: string };
}

/**
 * Map a GitHub REST repository object to a {@link Repo}.
 *
 * REST `owner.type` is a free string; anything other than `Organization`
 * (e.g. `User`, `Bot`) is treated as `User`.
 */
export function fromGitHubRepository(r: GitHubRepositoryLike): Repo {
  const type: OwnerType = r.owner.type === 'Organization' ? 'Organization' : 'User';
  return {
    repoId: r.id,
    nodeId: r.node_id,
    name: r.name,
    fullName: r.full_name,
    isPrivate: r.private,
    owner: r.owner.login,
    ownerId: r.owner.id,
    ownerNodeId: r.owner.node_id,
    type,
    ...(r.html_url ? { htmlUrl: r.html_url } : {}),
    ...(r.ssh_url ? { sshUrl: r.ssh_url } : {}),
  };
}
