import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { RequestLine } from './RequestLine';

describe('RequestLine', () => {
  it('renders the method and path', () => {
    render(<RequestLine method="GET" path="/events" />);
    expect(screen.getByText('GET')).toBeTruthy();
    expect(screen.getByText('/events')).toBeTruthy();
  });

  it('returns null when flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <RequestLine method="GET" path="/events" featureFlag="hide" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
