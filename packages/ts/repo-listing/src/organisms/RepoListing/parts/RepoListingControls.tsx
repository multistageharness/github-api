import { Select } from '../../../atoms/Select';
import { SearchField } from '../../../molecules/SearchField';
import type { OwnerTypeFilter, Visibility } from '../types';
import styles from './RepoListingControls.module.css';

export interface RepoListingControlsProps {
  query: string;
  onQueryChange: (value: string) => void;
  visibility: Visibility;
  onVisibilityChange: (value: Visibility) => void;
  ownerType: OwnerTypeFilter;
  onOwnerTypeChange: (value: OwnerTypeFilter) => void;
  ownerFilter: string;
  onOwnerFilterChange: (value: string) => void;
  /** Distinct owners, already including the leading "all" sentinel. */
  owners: string[];
}

const VISIBILITY_OPTIONS = [
  { value: 'all', label: 'All visibility' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

const OWNER_TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'User', label: 'User' },
  { value: 'Organization', label: 'Organization' },
];

/** Organism-private controls row: fuzzy search + three filter selects. */
export function RepoListingControls({
  query,
  onQueryChange,
  visibility,
  onVisibilityChange,
  ownerType,
  onOwnerTypeChange,
  ownerFilter,
  onOwnerFilterChange,
  owners,
}: RepoListingControlsProps) {
  return (
    <div className={styles.controls}>
      <SearchField
        value={query}
        onChange={onQueryChange}
        placeholder="Fuzzy search name, full name, owner…"
        aria-label="Search repositories"
      />
      <Select
        value={visibility}
        onChange={(v) => onVisibilityChange(v as Visibility)}
        options={VISIBILITY_OPTIONS}
        aria-label="Visibility filter"
      />
      <Select
        value={ownerType}
        onChange={(v) => onOwnerTypeChange(v as OwnerTypeFilter)}
        options={OWNER_TYPE_OPTIONS}
        aria-label="Owner type filter"
      />
      <Select
        value={ownerFilter}
        onChange={onOwnerFilterChange}
        options={owners.map((o) => ({
          value: o,
          label: o === 'all' ? 'All owners' : o,
        }))}
        aria-label="Owner filter"
      />
    </div>
  );
}
