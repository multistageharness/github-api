import { ReactNode, useEffect, useRef, useState } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  /** The string written to the clipboard on click. */
  value: string;
  /** Label shown before copying. Defaults to "copy". */
  idleLabel?: string;
  /** Label shown briefly after a successful copy. Defaults to "✓". */
  copiedLabel?: string;
  /** Label shown briefly when the clipboard write fails. Defaults to "✗". */
  failedLabel?: string;
  /** How long (ms) the copied / failed state persists. Defaults to 1200. */
  resetAfterMs?: number;
  /** Accessible name. Defaults to `Copy <value>`, so each button is distinguishable. */
  'aria-label'?: string;
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * Copy-to-clipboard button. Uses the browser Clipboard API directly — no
 * app wiring — and flips to a confirmation label for a short window. The
 * confirmation only appears once the write has actually succeeded; a missing
 * or rejecting clipboard shows the failed label instead. The outcome is also
 * announced through a visually hidden status region.
 * Atom — depends only on the package-local feature-flag primitive.
 */
export function CopyButton({
  value,
  idleLabel = 'copy',
  copiedLabel = '✓',
  failedLabel = '✗',
  resetAfterMs = 1200,
  'aria-label': ariaLabel,
  featureFlag,
  featureFlagFallback = null,
}: CopyButtonProps) {
  const visible = useFeatureFlag(featureFlag);
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return <>{featureFlagFallback}</>;

  const show = (next: CopyStatus) => {
    if (!mounted.current) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus(next);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (mounted.current) setStatus('idle');
    }, resetAfterMs);
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      show('copied');
    } catch {
      show('failed');
    }
  };

  const label =
    status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : idleLabel;

  return (
    <>
      <button
        type="button"
        title="Copy"
        aria-label={ariaLabel ?? `Copy ${value}`}
        className={styles.copy}
        onClick={copy}
      >
        {label}
      </button>
      <span role="status" className={styles.srOnly}>
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : ''}
      </span>
    </>
  );
}
