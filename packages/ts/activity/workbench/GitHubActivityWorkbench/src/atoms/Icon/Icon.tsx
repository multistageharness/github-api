import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import styles from './Icon.module.css';

export type IconName = 'warn' | 'play' | 'check' | 'spinner' | 'github' | 'chevron';

export interface IconProps {
  name: IconName;
  className?: string;
  spin?: boolean;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Atom — an inline SVG icon chosen by name. Indivisible design primitive; holds
 * no knowledge of the molecules/organisms that consume it. No external icon deps.
 */
export function Icon({
  name,
  className,
  spin,
  featureFlag,
  featureFlagFallback = null,
}: IconProps) {
  const visible = useFeatureFlag(featureFlag);
  if (!visible) return <>{featureFlagFallback}</>;

  const spinning = spin || name === 'spinner';
  const cls = [styles.icon, spinning ? styles.spin : null, className].filter(Boolean).join(' ');

  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
      {renderPaths(name)}
    </svg>
  );
}

function renderPaths(name: IconName): ReactNode {
  switch (name) {
    case 'warn':
      return (
        <path
          stroke="currentColor"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        />
      );
    case 'play':
      return <path fill="currentColor" d="M8 5v14l11-7z" />;
    case 'check':
      return (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m5 13 4 4L19 7"
        />
      );
    case 'spinner':
      return (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" fill="none" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      );
    case 'github':
      return (
        <path
          fill="currentColor"
          d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        />
      );
    case 'chevron':
      return (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m9 6 6 6-6 6"
        />
      );
  }
}
