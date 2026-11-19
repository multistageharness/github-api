import { Badge } from './Badge';

export default { title: 'atoms/Badge', component: Badge };

export const Default = () => <Badge>slate</Badge>;

export const Tones = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Badge tone="slate">slate</Badge>
    <Badge tone="green">Public</Badge>
    <Badge tone="amber">Private</Badge>
    <Badge tone="indigo">Organization</Badge>
  </div>
);

/** Flag off → renders the fallback instead of the pill. */
export const Hidden = () => (
  <Badge featureFlag="badge.enabled" featureFlagFallback={<em>hidden</em>}>
    never shown
  </Badge>
);
