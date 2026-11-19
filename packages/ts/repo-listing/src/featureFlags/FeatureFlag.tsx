import { ReactNode } from 'react';
import { FeatureFlagContext, FeatureFlagResolver } from './useFeatureFlag';

export interface FeatureFlagProviderProps {
  /** Decides whether a given flag key is on. Defaults to all-on. */
  resolver?: FeatureFlagResolver;
  children: ReactNode;
}

/** Module-level so the context value is stable when no resolver is passed. */
const ALL_ON: FeatureFlagResolver = () => true;

/**
 * Wrap a consumer tree to control feature-flag visibility of any gated
 * component beneath it. Without a provider, all flags resolve to visible.
 */
export function FeatureFlagProvider({
  resolver = ALL_ON,
  children,
}: FeatureFlagProviderProps) {
  return (
    <FeatureFlagContext.Provider value={resolver}>
      {children}
    </FeatureFlagContext.Provider>
  );
}
