import { ViewToggle } from '../../../molecules/ViewToggle';
import type { RepoView } from '../types';
import styles from './RepoListingHeader.module.css';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface RepoListingHeaderProps {
  title: string;
  /** Heading level for the title. Defaults to 2. */
  headingLevel?: HeadingLevel;
  shownCount: number;
  totalCount: number;
  view: RepoView;
  onViewChange: (view: RepoView) => void;
}

const VIEW_OPTIONS: { value: RepoView; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'cards', label: 'Cards' },
];

/** Organism-private header: title, count summary, and the view toggle. */
export function RepoListingHeader({
  title,
  headingLevel = 2,
  shownCount,
  totalCount,
  view,
  onViewChange,
}: RepoListingHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.header}>
      <div>
        <Heading className={styles.title}>{title}</Heading>
        {/* Live region: screen readers hear the new count as filters change. */}
        <p className={styles.subtitle} role="status" aria-live="polite">
          {shownCount} of {totalCount} shown · read-only
        </p>
      </div>
      <ViewToggle<RepoView>
        value={view}
        onChange={onViewChange}
        options={VIEW_OPTIONS}
        aria-label="Result view"
      />
    </div>
  );
}
