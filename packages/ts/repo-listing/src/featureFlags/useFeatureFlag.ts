import { createContext, useContext } from 'react';

/**
 * A resolver decides whether a given flag key is currently "on".
 * The default resolver treats every flag as visible, so components render
 * normally unless a FeatureFlagProvider narrows visibility.
 */
export type FeatureFlagResolver = (flag: string) => boolean;

export const FeatureFlagContext = createContext<FeatureFlagResolver>(() => true);

/**
 * Mandatory top-level gate for every atom / molecule / organism.
 *
 * - No flag supplied → always visible (returns true).
 * - Flag supplied → delegates to the nearest FeatureFlagProvider's resolver.
 */
export function useFeatureFlag(flag?: string): boolean {
  const resolver = useContext(FeatureFlagContext);
  if (!flag) return true;
  return resolver(flag);
}
