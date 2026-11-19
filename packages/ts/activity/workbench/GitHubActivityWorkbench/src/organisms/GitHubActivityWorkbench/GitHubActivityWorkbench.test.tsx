import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureFlagProvider } from '../../featureFlags';
import { GitHubActivityWorkbench } from './GitHubActivityWorkbench';

describe('GitHubActivityWorkbench', () => {
  it('renders the workbench with the default capability selected', () => {
    render(<GitHubActivityWorkbench />);
    expect(screen.getByText('Activity API Workbench')).toBeTruthy();
    // Default selection is client.getRateLimit → its label in the form header
    // (the same label also appears in the nav list, so scope to the heading).
    expect(screen.getByRole('heading', { name: 'Get rate limit' })).toBeTruthy();
  });

  it('selects a capability from the nav and updates the form', () => {
    render(<GitHubActivityWorkbench />);
    fireEvent.click(screen.getByText('List public events'));
    expect(screen.getByText('client.events.listPublic()')).toBeTruthy();
  });

  it('returns null when the feature flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <GitHubActivityWorkbench featureFlag="workbench" />
      </FeatureFlagProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
