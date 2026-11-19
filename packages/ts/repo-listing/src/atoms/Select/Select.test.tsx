import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';
import { FeatureFlagProvider } from '../../featureFlags';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
];

describe('Select', () => {
  it('emits the chosen value on change', () => {
    const onChange = vi.fn();
    render(<Select value="all" onChange={onChange} options={OPTIONS} aria-label="Vis" />);
    fireEvent.change(screen.getByLabelText('Vis'), { target: { value: 'public' } });
    expect(onChange).toHaveBeenCalledWith('public');
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <Select
          value="all"
          onChange={() => {}}
          options={OPTIONS}
          featureFlag="select.enabled"
          featureFlagFallback={<span>fb</span>}
        />
      </FeatureFlagProvider>,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
