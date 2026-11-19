import { useState } from 'react';
import { Field, type FieldDescriptor, type FieldValue } from './Field';

export default { title: 'Molecules/Field', component: Field };

function Demo({ param }: { param: FieldDescriptor }) {
  const [value, setValue] = useState<FieldValue>(undefined);
  return <Field param={param} value={value} onChange={setValue} />;
}

export const StringField = () => (
  <Demo param={{ name: 'owner', type: 'string', required: true, eg: 'octocat' }} />
);

export const NumberField = () => (
  <Demo param={{ name: 'per_page', type: 'number', in: 'query', min: 1, max: 100, hint: 'page size' }} />
);

export const EnumField = () => (
  <Demo param={{ name: 'sort', type: 'enum', in: 'query', options: ['created', 'updated'] }} />
);

export const BooleanField = () => <Demo param={{ name: 'draft', type: 'boolean', in: 'body' }} />;

export const DateField = () => <Demo param={{ name: 'since', type: 'date', in: 'query' }} />;

export const Hidden = () => (
  <Field
    param={{ name: 'owner', type: 'string' }}
    value={undefined}
    onChange={() => {}}
    featureFlag="off"
    featureFlagFallback={<span>hidden</span>}
  />
);
