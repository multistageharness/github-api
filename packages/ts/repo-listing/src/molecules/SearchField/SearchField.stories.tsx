import { useState } from 'react';
import { SearchField } from './SearchField';

export default { title: 'molecules/SearchField', component: SearchField };

export const Default = () => {
  const [q, setQ] = useState('');
  return <SearchField value={q} onChange={setQ} placeholder="Fuzzy search…" />;
};

/** Flag off → nothing renders. */
export const Hidden = () => (
  <SearchField
    value=""
    onChange={() => {}}
    featureFlag="search.enabled"
    featureFlagFallback={<em>hidden</em>}
  />
);
