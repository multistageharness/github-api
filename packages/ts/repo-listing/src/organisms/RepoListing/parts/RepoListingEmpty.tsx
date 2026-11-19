import styles from './RepoListingEmpty.module.css';

export interface RepoListingEmptyProps {
  message?: string;
}

/** Organism-private empty state shown when no repo matches the filters. */
export function RepoListingEmpty({
  message = 'No repositories match your filters.',
}: RepoListingEmptyProps) {
  return <div className={styles.empty}>{message}</div>;
}
