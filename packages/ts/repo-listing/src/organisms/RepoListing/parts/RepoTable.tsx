import { Badge } from '../../../atoms/Badge';
import { CopyableUrl } from '../../../molecules/CopyableUrl';
import { LinkMenu } from '../../../molecules/LinkMenu';
import type { ComputedRepo } from '../types';
import styles from './RepoTable.module.css';

export interface RepoTableProps {
  repos: ComputedRepo[];
  /** Accessible table caption (visually hidden). */
  caption?: string;
}

/** Organism-private table view of the repositories. */
export function RepoTable({ repos, caption = 'Repositories' }: RepoTableProps) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead className={styles.head}>
          <tr>
            <th className={styles.th}>Repository</th>
            <th className={styles.th}>Owner</th>
            <th className={styles.th}>Visibility</th>
            <th className={styles.th}>IDs</th>
            <th className={styles.th}>URLs</th>
            <th className={`${styles.th} ${styles.alignRight}`}>Links</th>
          </tr>
        </thead>
        <tbody className={styles.body}>
          {repos.map((r) => (
            <tr key={r.repoId} className={styles.row}>
              <td className={styles.td}>
                <div className={styles.repoName}>{r.name}</div>
                <div className={styles.muted}>{r.fullName}</div>
              </td>
              <td className={styles.td}>
                <div className={styles.owner}>{r.owner}</div>
                <Badge tone="indigo">{r.type}</Badge>
              </td>
              <td className={styles.td}>
                {r.isPrivate ? (
                  <Badge tone="amber">Private</Badge>
                ) : (
                  <Badge tone="green">Public</Badge>
                )}
              </td>
              <td className={`${styles.td} ${styles.ids}`}>
                <div>repo: {r.repoId}</div>
                <div>owner: {r.ownerId}</div>
                <div className={styles.nodeId} title={r.nodeId}>
                  node: {r.nodeId}
                </div>
              </td>
              <td className={`${styles.td} ${styles.urlsCell}`}>
                <div className={styles.urls}>
                  <CopyableUrl url={r.computedRepoUrl} />
                  <CopyableUrl url={r.computedSSHUrl} />
                </div>
              </td>
              <td className={`${styles.td} ${styles.alignRight}`}>
                <div className={styles.linksCell}>
                  <LinkMenu baseUrl={r.computedRepoUrl} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
