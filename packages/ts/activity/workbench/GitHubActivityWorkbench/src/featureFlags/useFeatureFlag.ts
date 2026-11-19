import { useFeatureFlagResolver } from './FeatureFlag';

/**
 * The mandatory top-level visibility gate. Every atom, molecule, and organism
 * calls this with its optional `featureFlag` prop and early-returns its
 * `featureFlagFallback` (default `null`) when the result is false.
 *
 * No flag key → always visible (true).
 */
export function useFeatureFlag(flag?: string): boolean {
  const resolve = useFeatureFlagResolver();
  if (!flag) return true;
  return resolve(flag);
}
