import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { Chip } from './Chip';

describe('Chip', () => {
  it('renders label and value', () => {
    render(<Chip label="remaining" value="0" />);
    expect(screen.getByText('remaining')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <Chip label="rate" value="42" featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
