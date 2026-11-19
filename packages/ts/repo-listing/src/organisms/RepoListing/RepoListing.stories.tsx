import { RepoListing } from './RepoListing';
import { FeatureFlagProvider } from '../../featureFlags';
import type { Repo } from './types';

export default { title: 'organisms/RepoListing', component: RepoListing };

const REPOS: Repo[] = [
  {
    repoId: 10270250,
    nodeId: 'MDEwOlJlcG9zaXRvcnkxMDI3MDI1MA==',
    name: 'react',
    fullName: 'facebook/react',
    isPrivate: false,
    owner: 'facebook',
    ownerId: 69631,
    ownerNodeId: 'MDEyOk9yZ2FuaXphdGlvbjY5NjMx',
    type: 'Organization',
  },
  {
    repoId: 999001,
    nodeId: 'MDEwOlJlcG9zaXRvcnk5OTkwMDE=',
    name: 'internal-dashboard',
    fullName: 'rcmarte/internal-dashboard',
    isPrivate: true,
    owner: 'rcmarte',
    ownerId: 4830221,
    ownerNodeId: 'MDQ6VXNlcjQ4MzAyMjE=',
    type: 'User',
  },
];

export const Default = () => <RepoListing repos={REPOS} />;

export const CardsView = () => <RepoListing repos={REPOS} initialView="cards" />;

export const Empty = () => <RepoListing repos={[]} />;

/** Flag off → the whole organism renders the fallback. */
export const Hidden = () => (
  <FeatureFlagProvider resolver={() => false}>
    <RepoListing
      repos={REPOS}
      featureFlag="repoListing.enabled"
      featureFlagFallback={<p>Repository listing is disabled.</p>}
    />
  </FeatureFlagProvider>
);
