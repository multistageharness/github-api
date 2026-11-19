import { FeatureFlagProvider } from '../../featureFlags';
import { GitHubActivityWorkbench } from './GitHubActivityWorkbench';

export default { title: 'Organisms/GitHubActivityWorkbench', component: GitHubActivityWorkbench };

/** Happy path — default base URL, no token. */
export const Default = () => <GitHubActivityWorkbench />;

/** Seeded with a base URL override (e.g. GHES). */
export const EnterpriseBaseUrl = () => (
  <GitHubActivityWorkbench initialBaseUrl="https://github.example.com/api/v3" />
);

/** Seeded with an (obviously fake) token to show the unusual-format warning. */
export const UnusualToken = () => <GitHubActivityWorkbench initialToken="not-a-real-token" />;

/** Gate off → renders the fallback instead of the workbench. */
export const Hidden = () => (
  <FeatureFlagProvider resolver={() => false}>
    <GitHubActivityWorkbench featureFlag="workbench" featureFlagFallback={<p>Workbench hidden.</p>} />
  </FeatureFlagProvider>
);
