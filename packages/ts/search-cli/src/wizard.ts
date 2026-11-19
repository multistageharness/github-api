/**
 * The guided wizard: every interactive question, in order.
 *
 * The prompt module (`clack`) and the cancel guard are **injected**, like
 * `prompt.ts`, so no module under `src/` (other than the `cli.ts` entry) imports
 * the prompt library and the question order, the `labels` branch and the
 * order-skip are unit-testable with a scripted prompt double — no TTY needed.
 */

import { SEARCH_ENDPOINTS } from '@internal/github-sdk-search/endpoints';
import type { CollectedSearch } from './flags.js';
import {
  Q_PLACEHOLDERS,
  composeFileContentQuery,
  validateContentTerm,
  validateFileName,
  validatePage,
  validatePerPage,
  validateQuery,
  validateRepositoryId,
  validateResultWindow,
} from './query.js';
import { sortOptions } from './sort-enums.js';

export const ENDPOINT_HINTS: Record<string, string> = {
  repositories: 'repos by name, topic, language, stars',
  code: 'code inside files — requires a token',
  commits: 'commit messages and metadata',
  issues: 'issues and pull requests',
  users: 'users and organizations',
  labels: 'labels within one repository (needs a repo id)',
  topics: 'topic names',
};

/** One choice in a `select` prompt. */
export interface SelectChoice {
  value: string;
  label: string;
  hint?: string;
}

export interface SelectPromptOptions {
  message: string;
  options: SelectChoice[];
  initialValue?: string;
}

export interface TextPromptOptions {
  message: string;
  placeholder?: string;
  initialValue?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}

/** The slice of `@clack/prompts` the wizard uses (or a scripted double). */
export interface WizardClack {
  select: (opts: SelectPromptOptions) => Promise<string | symbol>;
  text: (opts: TextPromptOptions) => Promise<string | symbol>;
  note: (message?: string, title?: string) => void;
}

/**
 * The cancel guard: resolves to the prompt's value, or ends the process when the
 * user cancels (see `prompt.ts`).
 */
export type PromptGuard = <T>(promptFn: () => Promise<T | symbol>) => Promise<T>;

export interface WizardDeps {
  /** the `@clack/prompts` module (or a scripted double) */
  clack: WizardClack;
  /** cancel guard */
  promptOrExit: PromptGuard;
  defaultPerPage?: number;
}

/** The sort and paging answers. */
export interface SortAndPaging {
  sort: string;
  order: string | undefined;
  perPage: string;
  page: string;
}

/**
 * Collect sort/order/pagination.
 * `order` is skipped when the user takes the default sort: GitHub's default is
 * relevance-ranked best-match, where a direction means nothing.
 */
export async function collectSortAndPaging(
  endpoint: string,
  { clack: p, promptOrExit, defaultPerPage = 30 }: WizardDeps
): Promise<SortAndPaging> {
  const sort = await promptOrExit(() =>
    p.select({ message: 'Sort by', options: sortOptions(endpoint) })
  );

  let order: string | undefined;
  if (sort) {
    order = await promptOrExit(() =>
      p.select({
        message: 'Order',
        initialValue: 'desc',
        options: [
          { value: 'desc', label: 'descending' },
          { value: 'asc', label: 'ascending' },
        ],
      })
    );
  }

  // `initialValue`, not `defaultValue`: clack runs `validate(value)` on the raw
  // input and only applies `defaultValue` afterwards, on the `finalize` event.
  // With `defaultValue` alone, pressing Enter to accept the default validates the
  // empty string — `Number('') === 0` — and the prompt rejects its own default.
  // `initialValue` pre-fills the line buffer, so Enter submits (and displays) it.
  const perPage = await promptOrExit(() =>
    p.text({
      message: 'Results per page',
      placeholder: String(defaultPerPage),
      initialValue: String(defaultPerPage),
      defaultValue: String(defaultPerPage),
      validate: validatePerPage,
    })
  );

  const page = await promptOrExit(() =>
    p.text({
      message: 'Page',
      placeholder: '1',
      initialValue: '1',
      defaultValue: '1',
      validate: (v) => validatePage(v) ?? validateResultWindow(v, perPage),
    })
  );

  return { sort, order, perPage, page };
}

/**
 * The guided wizard. Every prompt is wrapped in `promptOrExit`.
 */
export async function collectInteractive(deps: WizardDeps): Promise<CollectedSearch> {
  const { clack: p, promptOrExit } = deps;

  const mode = await promptOrExit(() =>
    p.select({
      message: 'How do you want to search?',
      options: [
        { value: 'general', label: 'General search', hint: 'pick an endpoint, write a raw query' },
        {
          value: 'file-content',
          label: 'File + content search',
          hint: 'find a term inside a named file (code search)',
        },
      ],
    })
  );

  let endpoint: string;
  let q: string;
  let repositoryId: string | undefined;

  if (mode === 'file-content') {
    // Composes `<content> in:file filename:<name>` and dispatches to code search.
    endpoint = 'code';
    const filename = await promptOrExit(() =>
      p.text({ message: 'File name', placeholder: 'package.json', validate: validateFileName })
    );
    const content = await promptOrExit(() =>
      p.text({
        message: 'Content to find inside that file',
        placeholder: 'lint-staged',
        validate: validateContentTerm,
      })
    );
    q = composeFileContentQuery({ filename, content });
    p.note(q, 'Composed query');
  } else {
    const chosen = await promptOrExit(() =>
      p.select({
        message: 'What do you want to search?',
        options: SEARCH_ENDPOINTS.map((v) => ({ value: v, label: v, hint: ENDPOINT_HINTS[v] })),
      })
    );
    endpoint = chosen;
    q = await promptOrExit(() =>
      p.text({
        message: 'Search query',
        placeholder: Q_PLACEHOLDERS[chosen],
        validate: validateQuery,
      })
    );
    if (endpoint === 'labels') {
      repositoryId = await promptOrExit(() =>
        p.text({
          message: 'Repository ID (numeric)',
          placeholder: '1300192',
          validate: validateRepositoryId,
        })
      );
    }
  }

  return { endpoint, q, repositoryId, ...(await collectSortAndPaging(endpoint, deps)) };
}
