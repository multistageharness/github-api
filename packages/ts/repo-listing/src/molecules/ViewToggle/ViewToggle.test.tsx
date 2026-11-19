import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from './ViewToggle';
import { FeatureFlagProvider } from '../../featureFlags';

const OPTIONS = [
  { value: 'table', label: 'Table' },
  { value: 'cards', label: 'Cards' },
];

describe('ViewToggle', () => {
  it('emits the clicked option and marks the active one pressed', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="table" onChange={onChange} options={OPTIONS} />);
    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    expect(onChange).toHaveBeenCalledWith('cards');
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <ViewToggle
          value="table"
          onChange={() => {}}
          options={OPTIONS}
          featureFlag="viewToggle.enabled"
          featureFlagFallback={<span>fb</span>}
        />
      </FeatureFlagProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
