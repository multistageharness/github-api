import { render, screen, fireEvent } from '@testing-library/react';
import { LinkMenu } from './LinkMenu';
import { FeatureFlagProvider } from '../../featureFlags';

function setup() {
  render(
    <>
      <LinkMenu baseUrl="https://github.com/facebook/react" />
      <button type="button">outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'GitHub ▾' });
  return { trigger, outside: screen.getByRole('button', { name: 'outside' }) };
}

/** Move focus like a Tab press: blur `from` towards `to`, then focus `to`. */
function moveFocus(from: HTMLElement, to: HTMLElement) {
  fireEvent.blur(from, { relatedTarget: to });
  to.focus();
}

/** All open links; fails loudly (rather than yielding `undefined`) if fewer than two render. */
function getLinks(): [HTMLElement, HTMLElement, ...HTMLElement[]] {
  const [first, second, ...rest] = screen.getAllByRole('link');
  if (!first || !second) throw new Error('expected at least two links');
  return [first, second, ...rest];
}

describe('LinkMenu', () => {
  it('opens on click and links resolve against the base url', () => {
    const { trigger } = setup();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const issues = screen.getByRole('link', { name: /^Issues/ });
    expect(issues.getAttribute('href')).toBe('https://github.com/facebook/react/issues');
    expect(screen.getAllByRole('link')).toHaveLength(8);
  });

  it('is a disclosure: aria-controls points at the list, no menu roles', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    const list = document.getElementById(trigger.getAttribute('aria-controls')!);
    expect(list?.tagName).toBe('UL');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('stays open while focus moves from the trigger into the links', () => {
    const { trigger } = setup();
    trigger.focus();
    fireEvent.click(trigger);
    const [code, issues] = getLinks();

    moveFocus(trigger, code);
    moveFocus(code, issues);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(issues);
  });

  it('closes when focus leaves the widget', () => {
    const { trigger, outside } = setup();
    fireEvent.click(trigger);
    const [code] = getLinks();
    code.focus();

    moveFocus(code, outside);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const [, issues] = getLinks();
    issues.focus();

    fireEvent.keyDown(issues, { key: 'Escape' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('moves between links with the arrow keys', () => {
    const { trigger } = setup();
    trigger.focus();
    fireEvent.click(trigger);
    const links = getLinks();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(links[1]);
    fireEvent.keyDown(links[1], { key: 'ArrowUp' });
    fireEvent.keyDown(links[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(links[links.length - 1]);
  });

  it('marks links that open a new tab', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const code = screen.getByRole('link', { name: 'Code (opens in new tab)' });
    expect(code.getAttribute('target')).toBe('_blank');
  });

  it('returns the fallback when the flag is off', () => {
    render(
      <FeatureFlagProvider resolver={() => false}>
        <LinkMenu
          baseUrl="https://github.com/x/y"
          featureFlag="linkMenu.enabled"
          featureFlagFallback={<span>fb</span>}
        />
      </FeatureFlagProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).toBe('fb');
  });
});
