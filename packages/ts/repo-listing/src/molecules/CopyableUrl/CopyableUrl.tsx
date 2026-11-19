import { ReactNode } from 'react';
import { CopyButton } from '../../atoms/CopyButton';
import { useFeatureFlag } from '../../featureFlags';
import styles from './CopyableUrl.module.css';

export interface CopyableUrlProps {
  /** The URL (or any string) to display and copy. */
  url: string;
  /** Max width of the truncated text. Defaults to 180px. */
  maxWidth?: number;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * A truncated URL label paired with a copy button. Purposeful grouping of a
 * text span + the CopyButton atom acting as one unit.
 * Molecule — imports only atoms + the feature-flag primitive.
 */
export function CopyableUrl({
  url,
  maxWidth = 180,
  featureFlag,
  featureFlagFallback = null,
}: CopyableUrlProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <div className={styles.row}>
      <span className={styles.url} style={{ maxWidth }} title={url}>
        {url}
      </span>
      <CopyButton value={url} />
    </div>
  );
}
