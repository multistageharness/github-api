/**
 * Flag parsing via the Node standard library — no third-party CLI dependency.
 *
 * Non-interactive mode is not scope creep: it is the only way to assert the
 * wizard end-to-end without a pseudo-TTY, and it makes the tool scriptable.
 */

import { parseArgs } from 'node:util';

/**
 * A mistake in how the CLI was invoked — as opposed to a bad search value or a
 * failed request. Exits `2`, the conventional usage-error code, so a script can
 * tell "you called me wrong" from "the search failed" (`1`).
 */
export class UsageError extends Error {
  exitCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

/** The parsed flags. Every key is optional: absent means "not given". */
export interface CliArgs {
  endpoint?: string;
  q?: string;
  sort?: string;
  order?: string;
  'per-page'?: string;
  page?: string;
  'repository-id'?: string;
  'output-dir'?: string;
  'no-save'?: boolean;
  token?: string;
  'token-stdin'?: boolean;
  proxy?: string;
  'no-proxy'?: boolean;
  'proxy-bypass'?: string;
  interactive?: boolean;
  json?: boolean;
  help?: boolean;
  version?: boolean;
}

/** Whether each end of the process is attached to a terminal. */
export interface TtyState {
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
}

/**
 * Parse argv into a flat values object.
 *
 * @param args typically `process.argv.slice(2)`
 */
export const parseCliArgs = (args: string[]): CliArgs =>
  parseArgs({
    args,
    options: {
      endpoint: { type: 'string' },
      q: { type: 'string' },
      sort: { type: 'string' },
      order: { type: 'string' },
      'per-page': { type: 'string' },
      page: { type: 'string' },
      'repository-id': { type: 'string' },
      'output-dir': { type: 'string' },
      'no-save': { type: 'boolean' },
      token: { type: 'string' },
      'token-stdin': { type: 'boolean' },
      proxy: { type: 'string' },
      'no-proxy': { type: 'boolean' },
      'proxy-bypass': { type: 'string' },
      interactive: { type: 'boolean', short: 'i' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
    allowPositionals: false,
  }).values;

/**
 * The flags that describe a search. Supplying **any** of them selects
 * non-interactive mode; validation then rejects whatever is missing or empty.
 */
export const SEARCH_FLAGS = [
  'endpoint',
  'q',
  'sort',
  'order',
  'per-page',
  'page',
  'repository-id',
] as const satisfies readonly (keyof CliArgs)[];

/**
 * Presence, not truthiness: `--q ""` (an empty `$QUERY` in a script) is a
 * present-but-empty flag that must fail validation, never a silent switch into
 * the wizard.
 */
export const hasSearchFlags = (argv: CliArgs): boolean =>
  SEARCH_FLAGS.some((flag) => argv[flag] !== undefined);

/** The wizard runs when forced with `--interactive`, or when no search flag was given. */
export const isInteractive = (argv: CliArgs): boolean =>
  Boolean(argv.interactive) || !hasSearchFlags(argv);

/**
 * Decide the mode, refusing combinations that would hang or corrupt output.
 *
 * - Any search flag → non-interactive: zero prompts, including the hidden token
 *   prompt, which degrades to an immediate `AuthError`.
 * - The wizard needs a terminal on both ends. Without one, clack either hangs on
 *   a non-TTY stdin (CI) or paints prompt frames into a pipe, so this exits 2.
 * - The wizard draws on stdout, so `--json` (stdout carries JSON only) cannot be
 *   combined with it.
 *
 * @returns whether the wizard runs.
 * @throws {UsageError}
 */
export function selectMode(argv: CliArgs, { stdinIsTTY, stdoutIsTTY }: TtyState = {}): boolean {
  if (argv.interactive && hasSearchFlags(argv)) {
    throw new UsageError(
      `--interactive cannot be combined with search flags (${SEARCH_FLAGS.map((f) => `--${f}`).join(', ')}).`
    );
  }

  const interactive = isInteractive(argv);
  if (!interactive) return false;

  if (argv.json) {
    throw new UsageError(
      '--json needs a non-interactive search: pass --endpoint and --q. ' +
        'The wizard draws its prompts on stdout, which would corrupt the JSON.'
    );
  }
  if (argv['token-stdin']) {
    throw new UsageError(
      '--token-stdin needs a non-interactive search: the wizard reads its answers from stdin.'
    );
  }
  if (!stdinIsTTY || !stdoutIsTTY) {
    throw new UsageError(
      'No terminal attached, so the interactive wizard cannot run. ' +
        'Pass --endpoint and --q to search non-interactively (see --help).'
    );
  }
  return true;
}

export const HELP_TEXT = `
github-search-wizard — an interactive wizard over the GitHub Search API

USAGE
  github-search-wizard                     Interactive mode (prompts for everything)
  github-search-wizard --endpoint <name> --q <query> [options]
                                           Non-interactive mode (opens zero prompts)

  Any search flag (--endpoint, --q, --sort, --order, --per-page, --page,
  --repository-id) selects non-interactive mode; missing or empty values are
  then an error, never a fallback to the wizard. The wizard needs a terminal:
  without one the CLI exits 2.

FLAGS
  --endpoint <name>     One of: repositories, code, commits, issues, users, labels, topics
  --q <query>           The GitHub search query string
  --sort <field>        Sort field; must be valid for the chosen endpoint
  --order <asc|desc>    Sort direction; only meaningful alongside --sort
  --per-page <1-100>    Results per page (default GITHUB_SEARCH_PER_PAGE, else 30)
  --page <n>            Page number, 1-indexed (default 1). GitHub serves only the
                        first 1000 results, so page × per-page must be <= 1000
  --repository-id <n>   Numeric repo id; mandatory for 'labels', rejected elsewhere
  --output-dir <dir>    Where to persist results (see OUTPUT)
  --no-save             Do not persist the result at all
  --token <token>       GitHub token; overrides GITHUB_TOKEN / GH_TOKEN. Visible in
                        shell history and \`ps\` — prefer the env or --token-stdin
  --token-stdin         Read the token from the first line of stdin
  --proxy <url>         Route requests through this HTTP proxy (beats HTTPS_PROXY)
  --no-proxy            Connect direct, ignoring every proxy environment variable
  --proxy-bypass <list> Comma-separated hosts reached directly (beats NO_PROXY)
  -i, --interactive     Force the wizard (cannot be combined with search flags)
  --json                Print only JSON to stdout (safe to pipe into jq)
  -h, --help            Show this message
  --version             Print the version

AUTH
  A token is mandatory. Resolution order: --token / --token-stdin, then
  GITHUB_TOKEN, then GH_TOKEN (a .env file in the package directory is loaded),
  then a hidden prompt in interactive mode. GitHub's code search does not work
  at all without a token, so this CLI refuses to run unauthenticated.

ENVIRONMENT
  GITHUB_TOKEN, GH_TOKEN      Token (see AUTH)
  GITHUB_API_URL              REST API base URL (GHES: https://host/api/v3)
  GH_HOST                     Hostname, mapped like the gh CLI (used when
                              GITHUB_API_URL is unset)
  GITHUB_API_BASE_URL         Deprecated alias of GITHUB_API_URL
  GITHUB_PROXY, HTTPS_PROXY, NO_PROXY
                              Proxy settings, honored by the transport
  GITHUB_SEARCH_PER_PAGE      Default --per-page (1-100)
  GITHUB_SEARCH_OUTPUT_DIR    Default --output-dir
  GSW_DOTENV=0                Do not load the package's .env file

OUTPUT
  Every completed search is printed first, then saved as JSON to
  $XDG_STATE_HOME/github-search-wizard (default ~/.local/state/github-search-wizard)
  unless --output-dir / GITHUB_SEARCH_OUTPUT_DIR say otherwise, or --no-save is
  given. The path is announced on stderr, so --json stdout stays pipeable. A
  failed save is a warning, never a lost result.

EXIT CODES
  0  success, or the wizard was cancelled with Ctrl-C
  1  the search failed or a flag value is invalid
  2  usage error (bad flag combination, or the wizard has no terminal)

EXAMPLES
  github-search-wizard
  github-search-wizard --endpoint repositories --q "language:typescript stars:>1000" \\
    --sort stars --order desc --per-page 5
  github-search-wizard --endpoint code --q "TODO in:file" --json | jq .total_count
  github-search-wizard --endpoint labels --q bug --repository-id 1300192 --json
`.trim();
