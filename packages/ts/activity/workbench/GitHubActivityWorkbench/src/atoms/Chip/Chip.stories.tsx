import { Chip } from './Chip';

export default { title: 'Atoms/Chip', component: Chip };

export const Tones = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Chip label="rate" value="4980" />
    <Chip label="remaining" value="0" tone="alert" />
  </div>
);

export const Hidden = () => (
  <Chip label="rate" value="42" featureFlag="off" featureFlagFallback={<span>hidden</span>} />
);
