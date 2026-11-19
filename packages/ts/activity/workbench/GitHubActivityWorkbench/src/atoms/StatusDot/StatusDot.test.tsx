import { render } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('renders a dot element', () => {
    const { container } = render(<StatusDot tone="ok" />);
    expect(container.querySelector('span')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <StatusDot tone="ok" featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.querySelector('span')).toBeNull();
  });
});
