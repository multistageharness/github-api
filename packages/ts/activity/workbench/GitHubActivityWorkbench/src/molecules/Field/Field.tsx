import type { ReactNode } from 'react';
import { Toggle } from '../../atoms/Toggle';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './Field.module.css';

export type FieldValue = string | number | boolean | undefined;

export interface FieldDescriptor {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'accept';
  in?: 'path' | 'query' | 'body' | 'accept';
  required?: boolean;
  eg?: string;
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  options?: string[];
}

export interface FieldProps {
  param: FieldDescriptor;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Molecule — a single form field, composed from atoms and native controls.
 * Defines its own descriptor type; never imports organism types.
 */
export function Field({
  param,
  value,
  onChange,
  featureFlag,
  featureFlagFallback = null,
}: FieldProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  const header = (
    <div className={styles.label}>
      <span className={styles.name}>{param.name}</span>
      {param.required && <span className={styles.required}>required</span>}
      {param.in === 'body' && <span className={styles.tag}>body</span>}
      {param.in === 'accept' && <span className={styles.tag}>header</span>}
      {param.hint && <span className={styles.hint}>· {param.hint}</span>}
    </div>
  );

  if (param.type === 'boolean' || param.type === 'accept') {
    return (
      <div className={styles.field}>
        {header}
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{param.name}</span>
          <Toggle checked={!!value} onChange={onChange} />
        </div>
      </div>
    );
  }

  if (param.type === 'enum') {
    return (
      <div className={styles.field}>
        {header}
        <select
          className={styles.input}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">— default —</option>
          {(param.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (param.type === 'date') {
    return (
      <div className={styles.field}>
        {header}
        <input
          className={styles.input}
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </div>
    );
  }

  if (param.type === 'number') {
    return (
      <div className={styles.field}>
        {header}
        <input
          className={styles.input}
          type="number"
          min={param.min}
          max={param.max}
          placeholder={param.placeholder}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </div>
    );
  }

  return (
    <div className={styles.field}>
      {header}
      <input
        className={styles.input}
        type="text"
        placeholder={param.eg ? `e.g. ${param.eg}` : param.placeholder}
        value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}
