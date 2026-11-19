/**
 * github-search-wizard — the CLI's building blocks.
 *
 * The executable is `cli.ts` (the `github-search-wizard` bin); it is not
 * re-exported here, because importing it runs the CLI. Everything below is pure
 * or dependency-injected and safe to import.
 */

export { UsageError, parseCliArgs, SEARCH_FLAGS, hasSearchFlags, isInteractive, selectMode, HELP_TEXT } from './argv.js';
export type { CliArgs, TtyState } from './argv.js';

export {
  GITHUB_DEFAULT_PER_PAGE,
  baseURLFromHost,
  resolveBaseURL,
  resolvePerPage,
  resolveOutputDir,
  proxyOptionsFromArgv,
} from './config.js';
export type { Env, PerPageSetting, ProxyOptions } from './config.js';

export { methodFor } from './dispatch.js';
export type { SearchMethod } from './dispatch.js';

export { collectFromFlags } from './flags.js';
export type { CollectedSearch, CollectFromFlagsOptions } from './flags.js';

export { slugify, queryHash, utcStamp, writeResult } from './output.js';
export type { WriteResultOptions } from './output.js';

export { promptOrExit } from './prompt.js';
export type { CancelAwareClack, PromptOrExitDeps } from './prompt.js';

export {
  Q_PLACEHOLDERS,
  validateQuery,
  validateRepositoryId,
  validatePerPage,
  validatePage,
  MAX_SEARCH_RESULTS,
  validateResultWindow,
  ORDERS,
  validateOrder,
  validateFileName,
  validateContentTerm,
  composeFileContentQuery,
  buildParams,
} from './query.js';
export type { BuildParamsInput, SearchParams, Validator } from './query.js';

export { itemName, summaryLine, renderHuman, renderJson, formatDuration, renderError } from './render.js';
export type {
  LogFn,
  PageInfo,
  RenderableResult,
  RenderErrorOptions,
  RenderHumanOptions,
  SearchItem,
} from './render.js';

export { SORT_ENUMS, sortOptions } from './sort-enums.js';
export type { SortOption } from './sort-enums.js';

export { TOKEN_ENV_VARIABLES, resolveToken, readTokenFromStream } from './token.js';
export type { ResolveTokenInput } from './token.js';

export { ENDPOINT_HINTS, collectSortAndPaging, collectInteractive } from './wizard.js';
export type {
  PromptGuard,
  SelectChoice,
  SelectPromptOptions,
  SortAndPaging,
  TextPromptOptions,
  WizardClack,
  WizardDeps,
} from './wizard.js';

export { findPackageDir, entryFile } from './package-dir.js';
export { PACKAGE_NAME, VERSION } from './version.js';
