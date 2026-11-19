// Public API — the organism plus its data types.
export * from './organisms/RepoListing';

// Feature-flag primitive so consumers can control visibility.
export { FeatureFlagProvider, useFeatureFlag } from './featureFlags';
export type { FeatureFlagResolver } from './featureFlags';

// Selected reusable atoms/molecules consumers may want directly.
export { Badge } from './atoms/Badge';
export type { BadgeTone } from './atoms/Badge';
export { CopyButton } from './atoms/CopyButton';
export { LinkMenu, GITHUB_SUBPAGES } from './molecules/LinkMenu';
export type { GithubLink } from './molecules/LinkMenu';
