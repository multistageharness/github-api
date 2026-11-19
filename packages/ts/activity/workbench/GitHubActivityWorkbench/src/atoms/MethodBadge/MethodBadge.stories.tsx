import { MethodBadge } from './MethodBadge';

export default { title: 'Atoms/MethodBadge', component: MethodBadge };

export const AllMethods = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <MethodBadge method="GET" />
    <MethodBadge method="PUT" />
    <MethodBadge method="PATCH" />
    <MethodBadge method="POST" />
    <MethodBadge method="DELETE" />
  </div>
);

export const Hidden = () => (
  <MethodBadge method="GET" featureFlag="off" featureFlagFallback={<span>hidden</span>} />
);
