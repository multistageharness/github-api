import { ReactNode, useMemo, useState } from 'react';
import { useFeatureFlag } from '../../featureFlags';
import { fuzzyScore } from './fuzzyScore';
import {
  DEFAULT_GITHUB_BASE_URL,
  OwnerTypeFilter,
  Repo,
  RepoView,
  Visibility,
  withComputed,
} from './types';
import type { HeadingLevel } from './parts/RepoListingHeader';
import { RepoListingHeader } from './parts/RepoListingHeader';
import { RepoListingControls } from './parts/RepoListingControls';
import { RepoListingEmpty } from './parts/RepoListingEmpty';
import { RepoTable } from './parts/RepoTable';
import { RepoCard } from './parts/RepoCard';
import styles from './RepoListing.module.css';

export interface RepoListingProps {
  /** Repositories to display. Computed GitHub URLs are derived internally. */
  repos: Repo[];
  /** Heading text. Defaults to "Repositories". */
  title?: string;
  /** Initial view. Defaults to "table". */
  initialView?: RepoView;
  /** Message shown when no repo matches the active filters. */
  emptyMessage?: string;
  /**
   * Message shown when `repos` is empty (nothing to filter). Falls back to
   * `emptyMessage`, then to "No repositories to show."
   */
  noDataMessage?: string;
  /** Heading level of the title (1–6). Defaults to 2 so the organism nests in a page. */
  headingLevel?: HeadingLevel;
  /**
   * Web root of the GitHub instance used to derive repo URLs. Defaults to
   * `https://github.com`; set it for GitHub Enterprise Server. A repo's own
   * `htmlUrl` / `sshUrl` take precedence.
   */
  baseUrl?: string;
  /** Extra class on the root `<section>` (layout, spacing, background). */
  className?: string;
  /** Optional feature-flag key gating the whole organism. */
  featureFlag?: string;
  /** Rendered when `featureFlag` resolves off. Defaults to `null`. */
  featureFlagFallback?: ReactNode;
  /** Test hook, forwarded to the root `<section>`. Omitted by callers that do not need one. */
  'data-testid'?: string;
}

/**
 * Read-only, filterable repository listing with table and card views.
 *
 * Owns all listing state (query, filters, view) and derives the computed
 * GitHub URLs. Composition root — imports atoms, molecules, and its own
 * private `parts/`; never re-exports the parts.
 */
export function RepoListing({
  repos: input,
  title = 'Repositories',
  initialView = 'table',
  emptyMessage,
  noDataMessage,
  headingLevel = 2,
  baseUrl = DEFAULT_GITHUB_BASE_URL,
  className,
  featureFlag,
  featureFlagFallback = null,
  'data-testid': testId,
}: RepoListingProps) {
  const visible = useFeatureFlag(featureFlag);

  // Computed URLs, de-duplicated by repoId (repoId is the React key, and a
  // consumer concatenating pages can supply the same repo twice).
  const repos = useMemo(() => {
    const seen = new Set<number>();
    return input
      .filter((r) => (seen.has(r.repoId) ? false : (seen.add(r.repoId), true)))
      .map((r) => withComputed(r, baseUrl));
  }, [input, baseUrl]);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('all');
  const [ownerType, setOwnerType] = useState<OwnerTypeFilter>('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [view, setView] = useState<RepoView>(initialView);

  const owners = useMemo(
    () => ['all', ...Array.from(new Set(repos.map((r) => r.owner)))],
    [repos],
  );
  // When `repos` changes and the selected owner disappears, fall back to
  // "all" instead of silently filtering everything out.
  const effectiveOwner = owners.includes(ownerFilter) ? ownerFilter : 'all';

  const filtered = useMemo(() => {
    let list = repos.filter((r) => {
      if (visibility === 'public' && r.isPrivate) return false;
      if (visibility === 'private' && !r.isPrivate) return false;
      if (ownerType !== 'all' && r.type !== ownerType) return false;
      if (effectiveOwner !== 'all' && r.owner !== effectiveOwner) return false;
      return true;
    });
    if (query.trim()) {
      list = list
        .map((r) => {
          const hay = `${r.name} ${r.fullName} ${r.owner}`;
          return { r, score: fuzzyScore(query.trim(), hay) };
        })
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.r);
    } else {
      list = [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    return list;
  }, [repos, query, visibility, ownerType, effectiveOwner]);

  if (!visible) return <>{featureFlagFallback}</>;

  return (
    <section
      className={className ? `${styles.root} ${className}` : styles.root}
      data-testid={testId}
    >
      <div className={styles.inner}>
        <RepoListingHeader
          title={title}
          headingLevel={headingLevel}
          shownCount={filtered.length}
          totalCount={repos.length}
          view={view}
          onViewChange={setView}
        />

        <RepoListingControls
          query={query}
          onQueryChange={setQuery}
          visibility={visibility}
          onVisibilityChange={setVisibility}
          ownerType={ownerType}
          onOwnerTypeChange={setOwnerType}
          ownerFilter={effectiveOwner}
          onOwnerFilterChange={setOwnerFilter}
          owners={owners}
        />

        {filtered.length === 0 && (
          <RepoListingEmpty
            message={
              repos.length === 0
                ? (noDataMessage ?? emptyMessage ?? 'No repositories to show.')
                : emptyMessage
            }
          />
        )}

        {view === 'table' && filtered.length > 0 && (
          <RepoTable repos={filtered} caption={title} />
        )}

        {view === 'cards' && filtered.length > 0 && (
          <ul className={styles.grid} aria-label={title}>
            {filtered.map((r) => (
              <li key={r.repoId} className={styles.gridItem}>
                <RepoCard repo={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
