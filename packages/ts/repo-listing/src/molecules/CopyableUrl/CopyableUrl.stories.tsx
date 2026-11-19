import { CopyableUrl } from './CopyableUrl';

export default { title: 'molecules/CopyableUrl', component: CopyableUrl };

export const Https = () => <CopyableUrl url="https://github.com/facebook/react" />;

export const Ssh = () => <CopyableUrl url="git@github.com:facebook/react.git" />;

/** Flag off → nothing renders. */
export const Hidden = () => (
  <CopyableUrl
    url="https://github.com/x/y"
    featureFlag="copyableUrl.enabled"
    featureFlagFallback={<em>hidden</em>}
  />
);
