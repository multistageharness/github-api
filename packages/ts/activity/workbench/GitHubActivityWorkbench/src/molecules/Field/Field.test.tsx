import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { Field } from './Field';

describe('Field', () => {
  it('renders the param name in the label', () => {
    render(<Field param={{ name: 'owner', type: 'string' }} value={undefined} onChange={() => {}} />);
    expect(screen.getAllByText('owner').length).toBeGreaterThan(0);
  });

  it('renders a required tag when required', () => {
    render(
      <Field param={{ name: 'owner', type: 'string', required: true }} value={undefined} onChange={() => {}} />,
    );
    expect(screen.getByText('required')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <Field param={{ name: 'owner', type: 'string' }} value={undefined} onChange={() => {}} featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
