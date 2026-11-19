import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('renders the label', () => {
    render(<StatusPill tone="ok" label="200 OK" />);
    expect(screen.getByText('200 OK')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <StatusPill tone="error" label="500" featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
