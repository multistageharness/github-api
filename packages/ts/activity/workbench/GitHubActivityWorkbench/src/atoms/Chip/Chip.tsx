import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './Chip.module.css';

export interface ChipProps {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'alert';
  className?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Atom — a small label/value pill. Indivisible design primitive; holds no
 * knowledge of the molecules/organisms that consume it.
 */
export function Chip({
  label,
  value,
  tone = 'neutral',
  className,
  featureFlag,
  featureFlagFallback = null,
}: ChipProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <span className={[styles.chip, className].filter(Boolean).join(' ')}>
      <span className={styles.label}>{label}</span>
      <span className={[styles.value, styles[tone]].filter(Boolean).join(' ')}>{value}</span>
    </span>
  );
}
