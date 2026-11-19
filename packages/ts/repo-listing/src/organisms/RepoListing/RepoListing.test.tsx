import { render, screen, fireEvent, within } from '@testing-library/react';
import { RepoListing } from './RepoListing';
import { FeatureFlagProvider } from '../../featureFlags';
import type { Repo } from './types';

const REPOS: Repo[] = [
  {
    repoId: 1,
    nodeId: 'N1',
    name: 'react',
    fullName: 'facebook/react',
    isPrivate: false,
    owner: 'facebook',
    ownerId: 10,
    ownerNodeId: 'O10',
    type: 'Organization',
  },
  {
    repoId: 2,
    nodeId: 'N2',
    name: 'internal-dashboard',
    fullName: 'rcmarte/internal-dashboard',
    isPrivate: true,
    owner: 'rcmarte',
    ownerId: 20,
    ownerNodeId: 'O20',
    type: 'User',
  },
  {
    repoId: 3,
    nodeId: 'N3',
    name: 'jest',
    fullName: 'facebook/jest',
    isPrivate: false,
    owner: 'facebook',
    ownerId: 10,
    ownerNodeId: 'O10',
    type: 'Organization',
  },
];

/** Repo names in render order (table rows or cards). */
function shownNames(): string[] {
  const rows = screen.queryAllByRole('row').slice(1); // skip the header row
  if (rows.length > 0) {
    return rows.map((row) => within(row).getAllByRole('cell')[0]!.firstElementChild!.textContent!);
  }
  return screen
    .queryAllByRole('article')
    .map((card) => card.getAttribute('aria-labelledby')!)
    .map((id) => document.getElementById(id)!.textContent!);
}

/** The result-count live region (CopyButtons have their own status regions). */
function countStatus(): HTMLElement {
  const el = screen.getByText(/ shown · read-only$/);
  expect(el.getAttribute('role')).toBe('status');
  return el;
}

function search(value: string) {
  fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value } });
}

function pick(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('RepoListing', () => {
  it('renders all repos, sorted by full name, with the count summary', () => {
    render(<RepoListing repos={REPOS} />);
    expect(countStatus().textContent).toBe('3 of 3 shown · read-only');
    expect(shownNames()).toEqual(['jest', 'react', 'internal-dashboard']);
  });

  it('announces the count through a polite live region', () => {
    render(<RepoListing repos={REPOS} />);
    const status = countStatus();
    expect(status.getAttribute('aria-live')).toBe('polite');
    search('dash');
    expect(status.textContent).toBe('1 of 3 shown · read-only');
  });

  it('fuzzy-filters the table by the search query', () => {
    render(<RepoListing repos={REPOS} />);
    search('dash');
    expect(shownNames()).toEqual(['internal-dashboard']);
  });

  it('ranks fuzzy matches by score, not alphabetically', () => {
    render(<RepoListing repos={REPOS} />);
    // "re" is a substring of "react" at index 0 and of "rcmarte/internal-dashboard"
    // only via the owner/fullName later on, so react ranks first.
    search('re');
    expect(shownNames()[0]).toBe('react');
  });

  it('filters by visibility', () => {
    render(<RepoListing repos={REPOS} />);
    pick('Visibility filter', 'private');
    expect(shownNames()).toEqual(['internal-dashboard']);
    pick('Visibility filter', 'public');
    expect(shownNames()).toEqual(['jest', 'react']);
  });

  it('filters by owner type', () => {
    render(<RepoListing repos={REPOS} />);
    pick('Owner type filter', 'User');
    expect(shownNames()).toEqual(['internal-dashboard']);
    pick('Owner type filter', 'Organization');
    expect(shownNames()).toEqual(['jest', 'react']);
  });

  it('filters by owner', () => {
    render(<RepoListing repos={REPOS} />);
    const options = within(screen.getByLabelText('Owner filter'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['All owners', 'facebook', 'rcmarte']);
    pick('Owner filter', 'rcmarte');
    expect(shownNames()).toEqual(['internal-dashboard']);
  });

  it('drops a stale owner filter when repos change', () => {
    const { rerender } = render(<RepoListing repos={REPOS} />);
    pick('Owner filter', 'rcmarte');
    expect(shownNames()).toEqual(['internal-dashboard']);

    rerender(<RepoListing repos={REPOS.filter((r) => r.owner === 'facebook')} />);

    expect(shownNames()).toEqual(['jest', 'react']);
    expect((screen.getByLabelText('Owner filter') as HTMLSelectElement).value).toBe('all');
  });

  it('switches to the cards view, rendered as a list of articles', () => {
    render(<RepoListing repos={REPOS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Repositories' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(shownNames()).toEqual(['jest', 'react', 'internal-dashboard']);
  });

  it('starts in the cards view with initialView="cards"', () => {
    render(<RepoListing repos={REPOS} initialView="cards" />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('captions the table with the title', () => {
    render(<RepoListing repos={REPOS} title="My repos" />);
    expect(screen.getByRole('table', { name: 'My repos' })).toBe(screen.getByRole('table'));
  });

  it('renders the title as an h2 by default, configurable via headingLevel', () => {
    const { rerender } = render(<RepoListing repos={REPOS} title="Repos" />);
    expect(screen.getByRole('heading', { name: 'Repos' }).tagName).toBe('H2');
    rerender(<RepoListing repos={REPOS} title="Repos" headingLevel={3} />);
    expect(screen.getByRole('heading', { name: 'Repos' }).tagName).toBe('H3');
  });

  it('forwards className to the root section', () => {
    render(<RepoListing repos={REPOS} className="host-class" data-testid="listing" />);
    expect(screen.getByTestId('listing').className).toMatch(/host-class/);
  });

  it('derives github.com URLs by default', () => {
    render(<RepoListing repos={REPOS.slice(0, 1)} />);
    expect(screen.getByText('https://github.com/facebook/react')).not.toBeNull();
    expect(screen.getByText('git@github.com:facebook/react.git')).not.toBeNull();
  });

  it('derives URLs from a GitHub Enterprise baseUrl', () => {
    render(<RepoListing repos={REPOS.slice(0, 1)} baseUrl="https://ghe.example.com/" />);
    expect(screen.getByText('https://ghe.example.com/facebook/react')).not.toBeNull();
    expect(screen.getByText('git@ghe.example.com:facebook/react.git')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'GitHub ▾' }));
    expect(screen.getByRole('link', { name: /^Issues/ }).getAttribute('href')).toBe(
      'https://ghe.example.com/facebook/react/issues',
    );
  });

  it('de-duplicates repos with the same repoId', () => {
    render(<RepoListing repos={[...REPOS, REPOS[0]!]} />);
    expect(countStatus().textContent).toBe('3 of 3 shown · read-only');
  });

  it('shows the empty state when nothing matches', () => {
    render(<RepoListing repos={REPOS} />);
    search('zzzzz-no-match');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No repositories match your filters.').tagName).toBe('DIV');
  });

  it('uses emptyMessage when filters exclude everything', () => {
    render(<RepoListing repos={REPOS} emptyMessage="Nothing here" />);
    search('zzzzz-no-match');
    expect(screen.queryByText('Nothing here')).not.toBeNull();
  });

  it('distinguishes no data from no matches', () => {
    const { rerender } = render(<RepoListing repos={[]} />);
    expect(screen.queryByText('No repositories to show.')).not.toBeNull();
    expect(screen.queryByText('No repositories match your filters.')).toBeNull();
    rerender(<RepoListing repos={[]} noDataMessage="Connect an account" />);
    expect(screen.queryByText('Connect an account')).not.toBeNull();
  });

  it('returns null (fallback) when the flag is off', () => {
    const { container } = render(
      <FeatureFlagProvider resolver={() => false}>
        <RepoListing repos={REPOS} featureFlag="repoListing.enabled" />
      </FeatureFlagProvider>,
    );
    expect(within(container).queryByText('react')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
