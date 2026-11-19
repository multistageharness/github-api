import { vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('toggles on click', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="enable" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <Toggle checked onChange={() => {}} featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });
});
