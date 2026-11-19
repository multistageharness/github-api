import { StatusDot } from './StatusDot';

export default { title: 'Atoms/StatusDot', component: StatusDot };

export const Tones = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <StatusDot tone="ok" />
    <StatusDot tone="error" />
    <StatusDot tone="warn" />
    <StatusDot tone="neutral" />
  </div>
);

export const Hidden = () => <StatusDot tone="ok" featureFlag="off" featureFlagFallback="hidden" />;
