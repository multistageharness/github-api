import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './RequestLine.module.css';

export interface RequestLineProps {
  method: string;
  path: string;
  qs?: string;
  hasBody?: boolean;
  body?: Record<string, unknown>;
  accept?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

const DEFAULT_ACCEPT = 'application/vnd.github+json';

/**
 * Molecule — a presentational "terminal card" preview of an HTTP request.
 * Pure; composes no atoms (the method is shown as colored monospace text).
 */
export function RequestLine({
  method,
  path,
  qs,
  hasBody,
  body,
  accept,
  featureFlag,
  featureFlagFallback = null,
}: RequestLineProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  const showAccept = !!accept && accept !== DEFAULT_ACCEPT;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={[styles.dot, styles.rose].join(' ')} />
        <span className={[styles.dot, styles.amber].join(' ')} />
        <span className={[styles.dot, styles.emerald].join(' ')} />
        <span className={styles.headerLabel}>request</span>
      </div>
      <div className={styles.body}>
        <div>
          <span className={styles.method}>{method}</span>{' '}
          <span className={styles.path}>{path}</span>
          {qs && <span className={styles.qs}>?{qs}</span>}
        </div>
        {hasBody && body && (
          <div className={styles.muted}>body {JSON.stringify(body)}</div>
        )}
        {showAccept && <div className={styles.accept}>accept: {accept}</div>}
      </div>
    </div>
  );
}
