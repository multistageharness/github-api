import { render } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders an svg', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <Icon name="github" featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')).toBeNull();
  });
});
