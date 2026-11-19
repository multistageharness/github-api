import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyButton } from './CopyButton';
import { FeatureFlagProvider } from '../../featureFlags';

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

afterEach(() => {
  vi.useRealTimers();
  if (original) Object.defineProperty(navigator, 'clipboard', original);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

/** Click and let the clipboard promise settle. */
async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

describe('CopyButton', () => {
  it('writes the value and shows the copied label only after the write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyButton value="abc" />);
    const button = screen.getByRole('button', { name: 'Copy abc' });
    await click(button);

    expect(writeText).toHaveBeenCalledWith('abc');
    expect(button.textContent).toBe('✓');
    expect(screen.getByRole('status').textContent).toBe('Copied');
  });

  it('does not confirm while the clipboard write is still pending', async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    stubClipboard(writeText);

    render(<CopyButton value="abc" />);
    const button = screen.getByRole('button');
    await click(button);

    expect(writeText).toHaveBeenCalledWith('abc');
    expect(button.textContent).toBe('copy');
    expect(screen.getByRole('status').textContent).toBe('');

    await act(async () => resolve());
    expect(button.textContent).toBe('✓');
  });

  it('shows the failed label when the write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));

    render(<CopyButton value="abc" />);
    const button = screen.getByRole('button');
    await click(button);

    expect(button.textContent).toBe('✗');
    expect(screen.getByRole('status').textContent).toBe('Copy failed');
  });

  it('shows the failed label when the clipboard API is missing', async () => {
    stubClipboard(undefined);

    render(<CopyButton value="abc" failedLabel="no clipboard" />);
    const button = screen.getByRole('button');
    await click(button);

    expect(button.textContent).toBe('no clipboard');
  });

  it('returns to the idle label after resetAfterMs, restarting on repeat clicks', async () => {
    vi.useFakeTimers();
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    render(<CopyButton value="abc" resetAfterMs={1000} />);
    const button = screen.getByRole('button');
    await click(button);
    act(() => vi.advanceTimersByTime(600));
    await click(button);
    act(() => vi.advanceTimersByTime(600));
    // The second click restarted the window: still confirmed at 1200ms total.
    expect(button.textContent).toBe('✓');
    act(() => vi.advanceTimersByTime(400));
    expect(button.textContent).toBe('copy');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('clears its timer on unmount', async () => {
    vi.useFakeTimers();
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    const { unmount } = render(<CopyButton value="abc" />);
    await click(screen.getByRole('button'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives each button a distinct accessible name', () => {
    render(
      <>
        <CopyButton value="https://github.com/a/b" />
        <CopyButton value="git@github.com:a/b.git" />
        <CopyButton value="x" aria-label="Copy the thing" />
      </>,
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Copy https://github.com/a/b',
      'Copy git@github.com:a/b.git',
      'Copy the thing',
    ]);
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <CopyButton value="abc" featureFlag="copy.enabled" featureFlagFallback={<span>fb</span>} />
      </FeatureFlagProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
