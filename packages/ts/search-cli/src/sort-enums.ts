/**
 * Per-endpoint `sort` enums, transcribed verbatim from the SDK's `INTERFACE.md`
 * (§Capabilities and §UI Workbench "Sort enums per type").
 *
 * The SDK does **not** validate `sort` — it passes any string straight through
 * to GitHub. Constraining the choices at the prompt is therefore the only place
 * a bad value is caught before the API rejects it.
 *
 * `topics` has no documented sort: GitHub topic search is relevance-only.
 */

import type { SearchEndpoint } from '@internal/github-sdk-search/endpoints';

export const SORT_ENUMS: Record<SearchEndpoint, string[]> = {
  repositories: ['stars', 'forks', 'help-wanted-issues', 'updated'],
  code: ['indexed'],
  commits: ['author-date', 'committer-date'],
  // All 11 values, including the awkward `reactions-+1` / `reactions--1`.
  // A truncated list silently removes capability.
  issues: [
    'comments',
    'reactions',
    'reactions-+1',
    'reactions--1',
    'reactions-smile',
    'reactions-thinking_face',
    'reactions-heart',
    'reactions-tada',
    'interactions',
    'created',
    'updated',
  ],
  users: ['followers', 'repositories', 'joined'],
  labels: ['created', 'updated'],
  topics: [],
};

/** One choice in a clack `select`. */
export interface SortOption {
  value: string;
  label: string;
}

/**
 * Prompt options for an endpoint's `sort` field.
 *
 * Always leads with the empty "best match (default)" choice, so `topics` — which
 * has no sort enum — offers exactly one option.
 */
export const sortOptions = (endpoint: string): SortOption[] => [
  { value: '', label: 'best match (default)' },
  ...((SORT_ENUMS as Record<string, string[] | undefined>)[endpoint] ?? []).map((v) => ({
    value: v,
    label: v,
  })),
];
