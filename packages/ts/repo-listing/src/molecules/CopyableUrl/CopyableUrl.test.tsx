import { render, screen } from '@testing-library/react';
import { CopyableUrl } from './CopyableUrl';
import { FeatureFlagProvider } from '../../featureFlags';

describe('CopyableUrl', () => {
  it('shows the url and a copy button', () => {
    render(<CopyableUrl url="https://github.com/facebook/react" />);
    const label = screen.getByText('https://github.com/facebook/react');
    expect(label.getAttribute('title')).toBe('https://github.com/facebook/react');
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Copy https://github.com/facebook/react',
    );
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <CopyableUrl
          url="https://github.com/x/y"
          featureFlag="copyableUrl.enabled"
          featureFlagFallback={<span>fb</span>}
        />
      </FeatureFlagProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
