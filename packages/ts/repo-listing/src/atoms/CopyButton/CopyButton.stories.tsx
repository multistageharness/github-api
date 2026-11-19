import { CopyButton } from './CopyButton';

export default { title: 'atoms/CopyButton', component: CopyButton };

export const Default = () => <CopyButton value="git@github.com:facebook/react.git" />;

export const CustomLabels = () => (
  <CopyButton value="hello" idleLabel="copy url" copiedLabel="copied!" />
);

/** Flag off → nothing renders. */
export const Hidden = () => (
  <CopyButton value="x" featureFlag="copy.enabled" featureFlagFallback={<em>—</em>} />
);
