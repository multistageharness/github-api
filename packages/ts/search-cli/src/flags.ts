/**
 * Non-interactive collection: flags → the search the CLI will run.
 *
 * Pure and prompt-free, so every rule is unit-testable. Every failure throws a
 * plain `Error` (exit 1) with a clear message, and opens no prompt — reusing the
 * same validators the wizard's prompts use, so there is one source of truth.
 */

import { SEARCH_ENDPOINTS } from '@internal/github-sdk-search/endpoints';
import type { CliArgs } from './argv.js';
import {
  validateOrder,
  validatePage,
  validatePerPage,
  validateQuery,
  validateRepositoryId,
  validateResultWindow,
} from './query.js';
import { SORT_ENUMS } from './sort-enums.js';

/** The search the CLI will run, as collected from flags or from the wizard. */
export interface CollectedSearch {
  endpoint: string;
  q: string;
  repositoryId: string | undefined;
  sort: string | undefined;
  order: string | undefined;
  perPage: string | undefined;
  page: string | undefined;
}

export interface CollectFromFlagsOptions {
  /**
   * A configured `GITHUB_SEARCH_PER_PAGE`, used when `--per-page` is absent;
   * leave it undefined to let GitHub apply its default.
   */
  defaultPerPage?: number;
  warn?: (message: string) => void;
}

/**
 * @param argv parsed flags
 */
export function collectFromFlags(
  argv: CliArgs,
  { defaultPerPage, warn = () => {} }: CollectFromFlagsOptions = {}
): CollectedSearch {
  const endpoint = argv.endpoint;
  if (endpoint === undefined) {
    throw new Error(
      `--endpoint is required in non-interactive mode. Valid endpoints: ${SEARCH_ENDPOINTS.join(', ')}`
    );
  }
  if (!(SEARCH_ENDPOINTS as readonly string[]).includes(endpoint)) {
    throw new Error(
      `Unknown endpoint: ${endpoint}. Valid endpoints: ${SEARCH_ENDPOINTS.join(', ')}`
    );
  }

  // Present-but-empty (`--q "$UNSET"`) fails here; it never falls into the wizard.
  const q = argv.q;
  const queryError = validateQuery(q);
  // `q === undefined` is already covered by `validateQuery`; the check narrows the type.
  if (queryError || q === undefined) throw new Error(`--q: ${queryError}`);

  const repositoryId = argv['repository-id'];
  if (endpoint === 'labels') {
    if (repositoryId === undefined) {
      throw new Error('--repository-id is mandatory for the `labels` endpoint.');
    }
    const idError = validateRepositoryId(repositoryId);
    if (idError) throw new Error(idError);
  } else if (repositoryId !== undefined) {
    // Otherwise it would reach the wire as a stray `repository_id=` on, say, a
    // repositories query.
    throw new Error(`--repository-id applies only to the \`labels\` endpoint, not \`${endpoint}\`.`);
  }

  if (argv.sort) {
    const allowed = (SORT_ENUMS as Record<string, string[] | undefined>)[endpoint] ?? [];
    if (!allowed.includes(argv.sort)) {
      throw new Error(
        `Invalid --sort "${argv.sort}" for ${endpoint}. ` +
          (allowed.length
            ? `Valid values: ${allowed.join(', ')}`
            : `${endpoint} has no sort field — it is relevance-only.`)
      );
    }
  }

  if (argv.order !== undefined) {
    const error = validateOrder(argv.order);
    if (error) throw new Error(`--${error}`);
    if (!argv.sort) warn('--order is ignored without --sort: best-match ranking has no direction.');
  }

  if (argv['per-page'] !== undefined) {
    const error = validatePerPage(argv['per-page']);
    if (error) throw new Error(error);
  }
  if (argv.page !== undefined) {
    const error = validatePage(argv.page);
    if (error) throw new Error(error);
  }

  const perPage =
    argv['per-page'] ?? (defaultPerPage === undefined ? undefined : String(defaultPerPage));
  const windowError = validateResultWindow(argv.page ?? 1, perPage ?? 30);
  if (windowError) throw new Error(windowError);

  return {
    endpoint,
    q,
    repositoryId: endpoint === 'labels' ? repositoryId : undefined,
    sort: argv.sort,
    order: argv.order,
    perPage,
    page: argv.page,
  };
}
