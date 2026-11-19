import { StatusPill } from './StatusPill';

export default { title: 'Molecules/StatusPill', component: StatusPill };

export const Ok = () => <StatusPill tone="ok" label="200 OK" />;

export const Error = () => <StatusPill tone="error" label="404 Not Found" />;

export const Hidden = () => (
  <StatusPill tone="ok" label="200 OK" featureFlag="off" featureFlagFallback={<span>hidden</span>} />
);
