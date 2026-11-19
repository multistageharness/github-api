import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './MethodBadge.module.css';

export type HttpMethod = 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';

export interface MethodBadgeProps {
  method: HttpMethod;
  className?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Atom — a color-coded HTTP-method pill. Indivisible design primitive; holds no
 * knowledge of the molecules/organisms that consume it.
 */
export function MethodBadge({
  method,
  className,
  featureFlag,
  featureFlagFallback = null,
}: MethodBadgeProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <span className={[styles.badge, styles[method.toLowerCase()], className].filter(Boolean).join(' ')}>
      {method}
    </span>
  );
}
