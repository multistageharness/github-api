import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './StatusDot.module.css';

export type DotTone = 'ok' | 'error' | 'warn' | 'neutral';

export interface StatusDotProps {
  tone?: DotTone;
  className?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/** Atom — a small status indicator dot. */
export function StatusDot({
  tone = 'neutral',
  className,
  featureFlag,
  featureFlagFallback = null,
}: StatusDotProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return <span className={[styles.dot, styles[tone], className].filter(Boolean).join(' ')} />;
}
