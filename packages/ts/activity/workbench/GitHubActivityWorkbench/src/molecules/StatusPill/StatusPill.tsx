import type { ReactNode } from 'react';
import { StatusDot } from '../../atoms/StatusDot';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './StatusPill.module.css';

export interface StatusPillProps {
  tone: 'ok' | 'error';
  label: ReactNode;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Molecule — an inline status pill composing a StatusDot atom with a label.
 */
export function StatusPill({
  tone,
  label,
  featureFlag,
  featureFlagFallback = null,
}: StatusPillProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <span className={[styles.pill, styles[tone]].join(' ')}>
      <StatusDot tone={tone === 'ok' ? 'ok' : 'error'} />
      {label}
    </span>
  );
}
