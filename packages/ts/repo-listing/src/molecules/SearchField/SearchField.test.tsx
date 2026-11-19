import { render, screen, fireEvent } from '@testing-library/react';
import { SearchField } from './SearchField';
import { FeatureFlagProvider } from '../../featureFlags';

describe('SearchField', () => {
  it('emits typed input', () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} aria-label="Search repos" />);
    fireEvent.change(screen.getByLabelText('Search repos'), { target: { value: 'rea' } });
    expect(onChange).toHaveBeenCalledWith('rea');
  });

  it('renders a search input (native clear button, search role)', () => {
    render(<SearchField value="x" onChange={() => {}} aria-label="Search repos" />);
    const input = screen.getByRole('searchbox', { name: 'Search repos' });
    expect(input.getAttribute('type')).toBe('search');
    expect((input as HTMLInputElement).value).toBe('x');
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <SearchField
          value=""
          onChange={() => {}}
          featureFlag="search.enabled"
          featureFlagFallback={<span>fb</span>}
        />
      </FeatureFlagProvider>,
    );
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
