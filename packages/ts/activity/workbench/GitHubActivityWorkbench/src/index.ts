// Top-level public barrel. Consumers import the organism (and the optional
// feature-flag provider) from here. Organism-private `parts/` are never exported.
export * from './organisms/GitHubActivityWorkbench';
export { FeatureFlagProvider, useFeatureFlag } from './featureFlags';
export type { FeatureFlagResolver } from './featureFlags';
