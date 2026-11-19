/**
 * @fileoverview The three proxy flags, registered once and shared by all eleven
 * CLIs (PRD 0002, R8, RK6).
 *
 * Eleven independent commander programs are eleven chances for `--proxy` to
 * mean something subtly different in `gh-pr` than in `gh-repo`. One
 * registration function and one reader is the answer: the flag names, their
 * help text, the conflict rule and the mapping onto client options are all
 * decided here.
 *
 * `commander` is typed **structurally** rather than imported. This package
 * would otherwise carry a CLI framework so that a library consumer who only
 * wanted a proxy could install it — and every CLI in the repository already has
 * commander of its own.
 * @module cli
 */

import { parseProxyValue } from '@internal/github-sdk-fetch-rest-api';

/**
 * The slice of a commander `Command` this module needs.
 *
 * Structural so any `.option(flags, description)` builder satisfies it, and so
 * `commander` stays out of this package's dependencies.
 */
export interface ProxyFlagTarget {
  option(flags: string, description: string): unknown;
}

/** What commander parses the three flags into. */
export interface ParsedProxyFlags {
  /** `--proxy <url>` as a string, `false` from `--no-proxy`, absent when neither was given. */
  proxy?: string | boolean | undefined;
  /** `--proxy-bypass <list>`. */
  proxyBypass?: string | undefined;
}

/** The client options the flags map onto. Spread straight into a client constructor. */
export interface ProxyClientOptions {
  proxy?: string | null;
  proxyBypass?: string;
}

/**
 * Register `--proxy`, `--no-proxy` and `--proxy-bypass` on a root program (R8).
 *
 * Declared on the **root** `program`, alongside `--token` and `--base-url`, so
 * every subcommand honors them. A proxy is a property of how this process
 * reaches GitHub, not of which subcommand is running.
 */
export function registerProxyOptions(program: ProxyFlagTarget): void {
  program.option('--proxy <url>', 'Route requests through this HTTP proxy (beats HTTPS_PROXY)');
  program.option('--no-proxy', 'Connect direct, ignoring every proxy environment variable');
  program.option(
    '--proxy-bypass <list>',
    'Comma-separated hosts to reach directly, curl NO_PROXY rules (beats NO_PROXY)',
  );
}

/**
 * Whether both `--proxy` and `--no-proxy` appear in an argument vector (R8).
 *
 * Read off `argv` rather than off the parsed options because commander pairs
 * the two onto **one** key and lets the last one win — so by the time the
 * options are parsed, `--proxy X --no-proxy` is indistinguishable from a plain
 * `--no-proxy`. Silently discarding one of two contradictory flags is not an
 * answer to which one the operator meant.
 */
export function hasConflictingProxyFlags(argv: readonly string[] = process.argv): boolean {
  const sawNoProxy = argv.includes('--no-proxy');
  const sawProxy = argv.some((arg) => arg === '--proxy' || arg.startsWith('--proxy='));
  return sawNoProxy && sawProxy;
}

/** The message both conflict paths raise, so the wording is decided once. */
const CONFLICT_MESSAGE =
  '--proxy and --no-proxy cannot be used together. --no-proxy takes no value; ' +
  'drop one of the two and re-run.';

/**
 * Reject a bad combination or a bad value, at startup (R8, R9).
 *
 * Called by every CLI right after registration, **before** commander routes to
 * a subcommand. Leaving these checks to the client factory would catch them
 * only on the paths that build a client — so `gh-repo --proxy nonsense list`
 * would report an unknown command and never mention the proxy, and the operator
 * would leave believing their proxy was fine.
 *
 * Two failures, both before any request is issued:
 *
 * - `--proxy` and `--no-proxy` together, which commander would otherwise
 *   resolve by silently keeping whichever came last;
 * - a `--proxy` value that cannot be a proxy URL, rejected by the fetch layer's
 *   own validator so the flag and `HTTPS_PROXY` reject exactly the same values,
 *   with any password in the rejected value redacted (R10).
 *
 * It prints and exits rather than throwing: at this point there is no command
 * context to attach an error to, and a stack trace tells an operator nothing
 * they can act on.
 */
export function validateProxyFlagsOrExit(argv: readonly string[] = process.argv): void {
  try {
    proxyOptionsFrom(proxyFlagsFromArgv(argv), argv);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}

/**
 * Read the three flags straight off an argument vector (R8).
 *
 * For a CLI that builds its client at **module scope**, before commander has
 * parsed anything — `git`'s does, because its subcommands are registered with a
 * client instance. Commander's own parse has not run at that point, so its
 * `opts()` is empty and a `--proxy` on the command line would be dropped
 * silently.
 *
 * It reads exactly the three flags this module registers, in both `--flag value`
 * and `--flag=value` spellings, and nothing else.
 */
export function proxyFlagsFromArgv(argv: readonly string[] = process.argv): ParsedProxyFlags {
  const flags: ParsedProxyFlags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--no-proxy') {
      flags.proxy = false;
      continue;
    }
    if (arg === '--proxy') {
      flags.proxy = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--proxy=')) {
      flags.proxy = arg.slice('--proxy='.length);
      continue;
    }
    if (arg === '--proxy-bypass') {
      flags.proxyBypass = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--proxy-bypass=')) {
      flags.proxyBypass = arg.slice('--proxy-bypass='.length);
    }
  }

  return flags;
}

/**
 * Turn parsed flags into client options, or throw (R8, R9).
 *
 * Two failures, both **before any request is issued**: the two flags given
 * together, and a `--proxy` value that cannot be a proxy URL. The second reuses
 * the fetch layer's own validator, so `--proxy` and `HTTPS_PROXY` reject
 * exactly the same values with the same message, and a password in a rejected
 * value is redacted the same way (R10).
 */
export function proxyOptionsFrom(
  flags: ParsedProxyFlags,
  argv: readonly string[] = process.argv,
): ProxyClientOptions {
  if (hasConflictingProxyFlags(argv)) {
    throw new Error(CONFLICT_MESSAGE);
  }

  const options: ProxyClientOptions = {};

  // `false` is commander's spelling of `--no-proxy`; `null` is the fetch
  // layer's spelling of "direct, and do not consult the environment for this
  // one setting". Absent stays absent, so the environment is consulted.
  if (flags.proxy === false) {
    options.proxy = null;
  } else if (typeof flags.proxy === 'string') {
    options.proxy = parseProxyValue(flags.proxy, { kind: 'option', name: '--proxy' });
  }

  if (typeof flags.proxyBypass === 'string' && flags.proxyBypass !== '') {
    options.proxyBypass = flags.proxyBypass;
  }

  return options;
}
