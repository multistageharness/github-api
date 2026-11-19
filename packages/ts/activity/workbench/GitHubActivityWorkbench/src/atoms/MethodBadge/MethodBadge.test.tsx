import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { MethodBadge } from './MethodBadge';

describe('MethodBadge', () => {
  it('renders the method label', () => {
    render(<MethodBadge method="DELETE" />);
    expect(screen.getByText('DELETE')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <MethodBadge method="GET" featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
