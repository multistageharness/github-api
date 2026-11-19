import { useId } from 'react';
import { Badge } from '../../../atoms/Badge';
import { CopyableUrl } from '../../../molecules/CopyableUrl';
import { GITHUB_SUBPAGES } from '../../../molecules/LinkMenu';
import type { ComputedRepo } from '../types';
import styles from './RepoCard.module.css';

export interface RepoCardProps {
  repo: ComputedRepo;
}

/** Organism-private single repository card (used by the cards view). */
export function RepoCard({ repo: r }: RepoCardProps) {
  const nameId = useId();
  return (
    <article className={styles.card} aria-labelledby={nameId}>
      <div className={styles.top}>
        <div className={styles.identity}>
          <div className={styles.name} id={nameId}>
            {r.name}
          </div>
          <div className={styles.fullName}>{r.fullName}</div>
        </div>
        {r.isPrivate ? (
          <Badge tone="amber">Private</Badge>
        ) : (
          <Badge tone="green">Public</Badge>
        )}
      </div>

      <div className={styles.badges}>
        <Badge>{r.owner}</Badge>
        <Badge tone="indigo">{r.type}</Badge>
      </div>

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>repoId</dt>
          <dd className={styles.metaValue}>{r.repoId}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>ownerId</dt>
          <dd className={styles.metaValue}>{r.ownerId}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt className={styles.metaKey}>nodeId</dt>
          <dd className={`${styles.metaValue} ${styles.truncate}`} title={r.nodeId}>
            {r.nodeId}
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt className={styles.metaKey}>ownerNodeId</dt>
          <dd className={`${styles.metaValue} ${styles.truncate}`} title={r.ownerNodeId}>
            {r.ownerNodeId}
          </dd>
        </div>
      </dl>

      <div className={styles.urls}>
        <CopyableUrl url={r.computedRepoUrl} maxWidth={9999} />
        <CopyableUrl url={r.computedSSHUrl} maxWidth={9999} />
      </div>

      <div className={styles.links}>
        {GITHUB_SUBPAGES.map((l) => (
          <a
            key={l.key}
            href={`${r.computedRepoUrl}${l.path}`}
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            {l.label}
            <span className={styles.srOnly}> (opens in new tab)</span>
          </a>
        ))}
      </div>
    </article>
  );
}
