import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { RateLimitChips } from './RateLimitChips';

const sample = {
  limit: '5000',
  remaining: '4980',
  reset: '1700000000',
  used: '20',
  resource: 'core',
};

describe('RateLimitChips', () => {
  it('renders chip labels', () => {
    render(<RateLimitChips rl={sample} />);
    expect(screen.getByText('remaining')).toBeTruthy();
    expect(screen.getByText('limit')).toBeTruthy();
  });

  it('returns null when rl is missing', () => {
    const { container } = render(<RateLimitChips rl={null} />);
    expect(container.textContent).toBe('');
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <RateLimitChips rl={sample} featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
