import { withComputed, type Repo } from './types';
import { fromGitHubRepository } from './fromGitHubRepository';

const REPO: Repo = {
  repoId: 1,
  nodeId: 'N1',
  name: 'react',
  fullName: 'facebook/react',
  isPrivate: false,
  owner: 'facebook',
  ownerId: 10,
  ownerNodeId: 'O10',
  type: 'Organization',
};

describe('withComputed', () => {
  it('derives github.com URLs by default', () => {
    const r = withComputed(REPO);
    expect(r.computedRepoUrl).toBe('https://github.com/facebook/react');
    expect(r.computedSSHUrl).toBe('git@github.com:facebook/react.git');
    expect(r.fullName).toBe('facebook/react');
  });

  it('derives URLs from a GitHub Enterprise base URL, ignoring trailing slashes', () => {
    const r = withComputed(REPO, 'https://ghe.example.com//');
    expect(r.computedRepoUrl).toBe('https://ghe.example.com/facebook/react');
    expect(r.computedSSHUrl).toBe('git@ghe.example.com:facebook/react.git');
  });

  it('prefers the repo’s own htmlUrl / sshUrl', () => {
    const r = withComputed(
      { ...REPO, htmlUrl: 'https://h/x', sshUrl: 'ssh://git@h:2222/x.git' },
      'https://ghe.example.com',
    );
    expect(r.computedRepoUrl).toBe('https://h/x');
    expect(r.computedSSHUrl).toBe('ssh://git@h:2222/x.git');
  });
});

describe('fromGitHubRepository', () => {
  const rest = {
    id: 10270250,
    node_id: 'R_1',
    name: 'react',
    full_name: 'facebook/react',
    private: false,
    html_url: 'https://github.com/facebook/react',
    ssh_url: 'git@github.com:facebook/react.git',
    owner: { login: 'facebook', id: 69631, node_id: 'O_1', type: 'Organization' },
  };

  it('maps REST fields onto Repo', () => {
    expect(fromGitHubRepository(rest)).toEqual({
      repoId: 10270250,
      nodeId: 'R_1',
      name: 'react',
      fullName: 'facebook/react',
      isPrivate: false,
      owner: 'facebook',
      ownerId: 69631,
      ownerNodeId: 'O_1',
      type: 'Organization',
      htmlUrl: 'https://github.com/facebook/react',
      sshUrl: 'git@github.com:facebook/react.git',
    });
  });

  it('narrows non-Organization owner types to User', () => {
    expect(fromGitHubRepository({ ...rest, owner: { ...rest.owner, type: 'Bot' } }).type).toBe(
      'User',
    );
  });
});
