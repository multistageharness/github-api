import type { ReactNode } from 'react';
import { Chip } from '../../atoms/Chip';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './RateLimitChips.module.css';

export interface RateLimitData {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
  used: string | null;
  resource: string | null;
}

export interface RateLimitChipsProps {
  rl?: RateLimitData | null;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Molecule — a wrapping row of rate-limit Chip atoms. Defines its own
 * RateLimitData shape; never imports organism types.
 */
export function RateLimitChips({
  rl,
  featureFlag,
  featureFlagFallback = null,
}: RateLimitChipsProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  if (!rl || rl.limit == null) return null;

  const reset = rl.reset ? new Date(Number(rl.reset) * 1000).toLocaleTimeString() : '—';
  const low = Number(rl.remaining) <= 5;

  const chips: { label: string; value: string | null; tone?: 'neutral' | 'alert' }[] = [
    { label: 'remaining', value: rl.remaining, tone: low ? 'alert' : 'neutral' },
    { label: 'limit', value: rl.limit },
    { label: 'used', value: rl.used },
    { label: 'resource', value: rl.resource },
    { label: 'resets', value: reset },
  ];

  return (
    <div className={styles.row}>
      {chips
        .filter((c) => c.value != null && c.value !== '')
        .map((c) => (
          <Chip key={c.label} label={c.label} value={c.value} tone={c.tone} />
        ))}
    </div>
  );
}
