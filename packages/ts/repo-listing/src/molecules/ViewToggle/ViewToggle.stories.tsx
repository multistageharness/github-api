import { useState } from 'react';
import { ViewToggle } from './ViewToggle';

export default { title: 'molecules/ViewToggle', component: ViewToggle };

const OPTIONS = [
  { value: 'table', label: 'Table' },
  { value: 'cards', label: 'Cards' },
];

export const Default = () => {
  const [v, setV] = useState('table');
  return <ViewToggle value={v} onChange={setV} options={OPTIONS} />;
};

/** Flag off → nothing renders. */
export const Hidden = () => (
  <ViewToggle
    value="table"
    onChange={() => {}}
    options={OPTIONS}
    featureFlag="viewToggle.enabled"
    featureFlagFallback={<em>hidden</em>}
  />
);
