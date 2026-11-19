import { Icon } from './Icon';

export default { title: 'Atoms/Icon', component: Icon };

export const AllIcons = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Icon name="warn" />
    <Icon name="play" />
    <Icon name="check" />
    <Icon name="spinner" />
    <Icon name="github" />
    <Icon name="chevron" />
  </div>
);

export const Spinning = () => <Icon name="check" spin />;

export const Hidden = () => (
  <Icon name="github" featureFlag="off" featureFlagFallback={<span>hidden</span>} />
);
