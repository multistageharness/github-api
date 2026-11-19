import { LinkMenu } from './LinkMenu';

export default { title: 'molecules/LinkMenu', component: LinkMenu };

export const Default = () => <LinkMenu baseUrl="https://github.com/facebook/react" />;

export const CustomLabel = () => (
  <LinkMenu baseUrl="https://github.com/vitejs/vite" label="Open ▾" />
);

/** Flag off → nothing renders. */
export const Hidden = () => (
  <LinkMenu
    baseUrl="https://github.com/x/y"
    featureFlag="linkMenu.enabled"
    featureFlagFallback={<em>hidden</em>}
  />
);
