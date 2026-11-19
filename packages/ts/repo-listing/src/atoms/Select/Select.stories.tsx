import { useState } from 'react';
import { Select } from './Select';

export default { title: 'atoms/Select', component: Select };

const OPTIONS = [
  { value: 'all', label: 'All visibility' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

export const Default = () => {
  const [v, setV] = useState('all');
  return <Select value={v} onChange={setV} options={OPTIONS} aria-label="Visibility" />;
};

/** Flag off → nothing renders. */
export const Hidden = () => (
  <Select
    value="all"
    onChange={() => {}}
    options={OPTIONS}
    featureFlag="select.enabled"
    featureFlagFallback={<em>hidden</em>}
  />
);
