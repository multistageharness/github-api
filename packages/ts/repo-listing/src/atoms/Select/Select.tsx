import { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  'aria-label'?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Styled native `<select>`. The source used a shared `selectCls` string across
 * three filter dropdowns; this atom captures that shared styling once.
 * Atom — depends only on the package-local feature-flag primitive.
 */
export function Select({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  featureFlag,
  featureFlagFallback = null,
}: SelectProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <select
      className={styles.select}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
