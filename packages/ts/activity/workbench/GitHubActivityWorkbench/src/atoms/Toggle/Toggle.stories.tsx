import { useState } from 'react';
import { Toggle } from './Toggle';

export default { title: 'Atoms/Toggle', component: Toggle };

export const States = () => {
  const [on, setOn] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Toggle checked={false} onChange={() => {}} label="off" />
      <Toggle checked={true} onChange={() => {}} label="on" />
      <Toggle checked={on} onChange={setOn} label="interactive" />
    </div>
  );
};

export const Hidden = () => (
  <Toggle checked onChange={() => {}} featureFlag="off" featureFlagFallback={<span>hidden</span>} />
);
