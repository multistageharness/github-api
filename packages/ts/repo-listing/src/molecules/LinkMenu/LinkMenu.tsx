import { FocusEvent, KeyboardEvent, ReactNode, useId, useRef, useState } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import styles from './LinkMenu.module.css';

export interface GithubLink {
  key: string;
  label: string;
  /** Path appended to the base repo URL (empty string = the Code tab). */
  path: string;
}

/** Default GitHub sub-page tabs, lifted out of the original inline `GH_LINKS`. */
export const GITHUB_SUBPAGES: GithubLink[] = [
  { key: 'code', label: 'Code', path: '' },
  { key: 'issues', label: 'Issues', path: '/issues' },
  { key: 'pull-request', label: 'Pull Requests', path: '/pulls' },
  { key: 'action', label: 'Actions', path: '/actions' },
  { key: 'security', label: 'Security', path: '/security' },
  { key: 'insights', label: 'Insights', path: '/pulse' },
  { key: 'admin', label: 'Admin', path: '/settings' },
  { key: 'activity', label: 'Activity', path: '/activity' },
];

export interface LinkMenuProps {
  /** Base repository URL that each link path is appended to. */
  baseUrl: string;
  /** Trigger label. Defaults to "GitHub ▾". */
  label?: string;
  /** Link set. Defaults to {@link GITHUB_SUBPAGES}. */
  links?: GithubLink[];
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Disclosure of GitHub sub-page links for a single repo: a toggle button that
 * shows or hides a list of plain links (not an ARIA `menu`, so Tab moves
 * through the links as usual).
 *
 * - Focus moving between the trigger and the links keeps it open; it closes
 *   when focus leaves the whole widget.
 * - Escape closes it and returns focus to the trigger.
 * - ArrowDown / ArrowUp move between the links as a convenience.
 *
 * Molecule — imports only the feature-flag primitive.
 */
export function LinkMenu({
  baseUrl,
  label = 'GitHub ▾',
  links = GITHUB_SUBPAGES,
  featureFlag,
  featureFlagFallback = null,
}: LinkMenuProps) {
  const visible = useFeatureFlag(featureFlag);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  if (!visible) return <>{featureFlagFallback}</>;

  const linkElements = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !e.currentTarget.contains(next)) setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const items = linkElements();
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next =
      index === -1
        ? step === 1
          ? 0
          : items.length - 1
        : (index + step + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className={styles.wrap} onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          className={styles.menu}
          // Keep focus where it is while clicking a link: some browsers do not
          // focus links on click, which would blur the widget and close it
          // before the click lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {links.map((l) => (
            <li key={l.key}>
              <a
                href={`${baseUrl}${l.path}`}
                target="_blank"
                rel="noreferrer"
                className={styles.item}
              >
                {l.label}
                <span className={styles.srOnly}> (opens in new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
