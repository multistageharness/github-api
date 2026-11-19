import { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import styles from './ViewToggle.module.css';

export interface ViewToggleOption<T extends string = string> {
  value: T;
  label: string;
}

export interface ViewToggleProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: ViewToggleOption<T>[];
  'aria-label'?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Segmented control — a small group of mutually-exclusive toggle buttons.
 * Molecule — imports only the feature-flag primitive.
 */
export function ViewToggle<T extends string = string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel = 'View',
  featureFlag,
  featureFlagFallback = null,
}: ViewToggleProps<T>) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <div className={styles.group} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={`${styles.item} ${value === o.value ? styles.active : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
