import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import { FeatureFlagProvider } from '../../featureFlags';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge tone="green">Public</Badge>);
    expect(document.body.textContent).toBe('Public');
    expect(screen.getByText('Public').tagName).toBe('SPAN');
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <Badge featureFlag="badge.enabled" featureFlagFallback={<span>fb</span>}>
          hidden
        </Badge>
      </FeatureFlagProvider>,
    );
    expect(screen.queryByText('hidden')).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
