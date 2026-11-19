import { createContext, useContext, type ReactNode } from 'react';

/**
 * Package-local feature-flag primitive. Every package is self-contained, so the
 * gate lives here rather than in a shared dependency.
 *
 * A resolver maps a flag key → visible boolean. Default resolver is "everything
 * visible", so components render normally unless a provider says otherwise.
 */
export type FeatureFlagResolver = (flag: string) => boolean;

const FeatureFlagContext = createContext<FeatureFlagResolver>(() => true);

export function FeatureFlagProvider({
  resolver,
  children,
}: {
  resolver?: FeatureFlagResolver;
  children: ReactNode;
}) {
  return (
    <FeatureFlagContext.Provider value={resolver ?? (() => true)}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlagResolver(): FeatureFlagResolver {
  return useContext(FeatureFlagContext);
}
