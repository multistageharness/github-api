import { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import styles from './Badge.module.css';

export type BadgeTone = 'slate' | 'green' | 'amber' | 'indigo';

export interface BadgeProps {
  children: ReactNode;
  /** Visual tone of the pill. Defaults to `slate`. */
  tone?: BadgeTone;
  /** Optional feature-flag key. When resolved off, the badge renders the fallback. */
  featureFlag?: string;
  /** Rendered when `featureFlag` resolves off. Defaults to `null`. */
  featureFlagFallback?: ReactNode;
}

/**
 * Small rounded status pill with a fixed set of semantic tones.
 * Atom — depends only on the package-local feature-flag primitive.
 */
export function Badge({
  children,
  tone = 'slate',
  featureFlag,
  featureFlagFallback = null,
}: BadgeProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
