import { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Search box: a decorative magnifier glyph + a text input, grouped as one
 * unit. Molecule — imports only the feature-flag primitive (the glyph and
 * input are plain elements, not atoms).
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  'aria-label': ariaLabel = 'Search',
  featureFlag,
  featureFlagFallback = null,
}: SearchFieldProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        className={styles.input}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
