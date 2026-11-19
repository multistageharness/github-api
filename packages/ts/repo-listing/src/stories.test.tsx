/// <reference types="vite/client" />
/**
 * Smoke test for every `*.stories.tsx` export. Storybook is not installed, so
 * this is what keeps the stories compiling and rendering.
 */
import { render, cleanup } from '@testing-library/react';
import type { ComponentType } from 'react';

const modules = import.meta.glob<Record<string, unknown>>('./**/*.stories.tsx', { eager: true });

describe('stories', () => {
  it('finds the story files', () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(8);
  });

  for (const [file, mod] of Object.entries(modules)) {
    for (const [name, Story] of Object.entries(mod)) {
      if (name === 'default' || typeof Story !== 'function') continue;
      it(`${file} › ${name} renders`, () => {
        const S = Story as ComponentType;
        expect(() => render(<S />)).not.toThrow();
        cleanup();
      });
    }
  }

  it('RepoListing › Hidden renders only the fallback', () => {
    const mod = modules['./organisms/RepoListing/RepoListing.stories.tsx'];
    if (!mod) throw new Error('RepoListing.stories.tsx not found');
    const Hidden = mod.Hidden as ComponentType;
    const { container } = render(<Hidden />);
    expect(container.textContent).toBe('Repository listing is disabled.');
  });
});
