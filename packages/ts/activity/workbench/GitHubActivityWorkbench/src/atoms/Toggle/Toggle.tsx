import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './Toggle.module.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Atom — an accessible on/off switch with a sliding knob. Indivisible design
 * primitive; holds no knowledge of the molecules/organisms that consume it.
 */
export function Toggle({
  checked,
  onChange,
  label,
  featureFlag,
  featureFlagFallback = null,
}: ToggleProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[styles.track, checked ? styles.on : null].filter(Boolean).join(' ')}
    >
      <span className={styles.knob} />
    </button>
  );
}
