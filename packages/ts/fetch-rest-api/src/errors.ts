/**
 * @fileoverview One HTTP error contract for this layer (R8).
 *
 * Four distinguishable failures, all sharing a base class: GitHub answered with
 * an error status, the socket failed, the timeout fired, or the caller
 * cancelled. Distinguishable **by type** — eight packages in this repository
 * currently tell them apart by matching message strings, and disagree about
 * which are retryable.
 *
 * A rate limit is deliberately **not** classified here. It belongs to
 * `@internal/github-sdk-ratelimit`, whose error contract already exists (R10).
 * @module errors
 */

import type { RateLimitHeaders } from './types.js';

/** Shape of the JSON body GitHub returns on an error. */
export interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
  status?: string | number;
  errors?: unknown[];
  [key: string]: unknown;
}

/**
 * Base class for every failure this layer raises.
 *
 * Exists so a consumer can catch "anything the fetch layer threw" in one
 * `instanceof` without enumerating the four subclasses.
 */
export class GitHubFetchError extends Error {
  /** HTTP method of the failed request. */
  readonly method: string;
  /** URL of the failed request. Never carries a token — GitHub auth is a header (N8). */
  readonly url: string;

  constructor(message: string, method: string, url: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'GitHubFetchError';
    this.method = method;
    this.url = url;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /**
   * Serializable form.
   *
   * Deliberately enumerated rather than spread: request headers are never
   * carried on these errors, and this method is what keeps that true if a field
   * is ever added (N8).
   */
  toJSON(): Record<string, unknown> {
    return { name: this.name, message: this.message, method: this.method, url: this.url };
  }
}

/**
 * GitHub answered, with a status outside 2xx (R8).
 *
 * Carries everything a caller needs to act without re-reading the response:
 * status, method, URL, GitHub's own `message`, its `documentation_url`, and the
 * `x-github-request-id` that GitHub support asks for. The originating response
 * stays reachable so a consumer can build its own error from GitHub's body —
 * the mistake PRD 0001 had to correct in the limiter, and cheaper to avoid than
 * to fix.
 */
export class GitHubHttpError extends GitHubFetchError {
  readonly status: number;
  /** GitHub's `documentation_url`, when it sent one. */
  readonly documentationUrl: string | null;
  /** `x-github-request-id`, when present. */
  readonly requestId: string | null;
  /** The parsed error body, exactly as {@link GitHubResponse.data} would have carried it. */
  readonly data: unknown;
  /** The originating response. Its body has already been read. */
  readonly response: Response;
  /** Response headers. */
  readonly headers: Headers;
  /** Rate-limit headers off the failing response (R7). */
  readonly rateLimit: RateLimitHeaders;

  constructor(init: {
    message: string;
    status: number;
    method: string;
    url: string;
    data: unknown;
    response: Response;
    rateLimit: RateLimitHeaders;
  }) {
    super(init.message, init.method, init.url);
    this.name = 'GitHubHttpError';
    this.status = init.status;
    this.data = init.data;
    this.response = init.response;
    this.headers = init.response.headers;
    this.rateLimit = init.rateLimit;

    const body = isErrorBody(init.data) ? init.data : undefined;
    this.documentationUrl =
      typeof body?.documentation_url === 'string' ? body.documentation_url : null;
    this.requestId = init.response.headers.get('x-github-request-id');
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      status: this.status,
      documentationUrl: this.documentationUrl,
      requestId: this.requestId,
    };
  }
}

/**
 * The request never produced a response: DNS failure, connection refused, TLS
 * failure, socket reset (R8).
 */
export class GitHubNetworkError extends GitHubFetchError {
  constructor(message: string, method: string, url: string, cause: unknown) {
    super(message, method, url, { cause });
    this.name = 'GitHubNetworkError';
  }
}

/**
 * The per-request timeout fired (R9).
 *
 * Distinct from {@link GitHubAbortError}: a timeout is this layer giving up, a
 * cancellation is the caller doing so, and a consumer deciding whether to retry
 * needs to tell them apart.
 */
export class GitHubTimeoutError extends GitHubFetchError {
  readonly timeoutMs: number;

  constructor(method: string, url: string, timeoutMs: number, cause?: unknown) {
    super(`Request timed out after ${timeoutMs}ms`, method, url, { cause });
    this.name = 'GitHubTimeoutError';
    this.timeoutMs = timeoutMs;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs };
  }
}

/** The caller's `AbortSignal` fired (R9). */
export class GitHubAbortError extends GitHubFetchError {
  constructor(method: string, url: string, cause?: unknown) {
    super('Request was aborted by the caller', method, url, { cause });
    this.name = 'GitHubAbortError';
  }
}

/**
 * An environment variable cannot mean what it claims to (PRD 0001, R9).
 *
 * Raised at **construction**, not at request time: a malformed `GITHUB_API_URL`
 * is a configuration error, and discovering it as a `TypeError` from `new URL`
 * on the first request names neither the variable nor the value. It extends
 * {@link GitHubFetchError} so a consumer catching "anything the layer threw"
 * catches it too.
 *
 * No request exists yet, so `method` and `url` are empty and are left out of
 * {@link GitHubEnvironmentError.toJSON} rather than serialized as blanks.
 */
export class GitHubEnvironmentError extends GitHubFetchError {
  /** The variable — or, when {@link kind} is `option`, the option — that could not be used. */
  readonly variable: string;
  /** Its value — redacted when it holds a secret, or carries one in a URL (R10, N7). */
  readonly value: string;
  /**
   * Whether the bad value arrived from the environment or from a constructor
   * option (PRD 0002, R9).
   *
   * Named rather than left to the message, so a consumer can branch on it: an
   * operator fixes a variable, a developer fixes a call site, and telling them
   * apart is the whole point of naming the source.
   */
  readonly kind: 'environment' | 'option';

  constructor(
    variable: string,
    value: string,
    expected: string,
    kind: 'environment' | 'option' = 'environment',
  ) {
    const shown = redactIfSecret(variable, value);
    super(
      `${kind === 'option' ? 'Option' : 'Environment variable'} ${variable} is not usable: ` +
        `expected ${expected}, received ${JSON.stringify(shown)}.`,
      '',
      '',
    );
    this.name = 'GitHubEnvironmentError';
    this.variable = variable;
    this.value = shown;
    this.kind = kind;
  }

  override toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      variable: this.variable,
      value: this.value,
    };
  }
}

/** Whether `value` is a malformed-environment failure. */
export function isGitHubEnvironmentError(value: unknown): value is GitHubEnvironmentError {
  return value instanceof GitHubEnvironmentError;
}

/**
 * Redact a value whose variable name says it is a credential (R10).
 *
 * Two rules, because a secret arrives two ways. A name that says "secret"
 * redacts the value wholesale — defensive rather than load-bearing, since no
 * token variable can *fail* validation and any non-empty string is a usable
 * token. Everything else still runs through {@link redactUrlCredentials},
 * because a proxy URL carries its password **inside an otherwise
 * showable value** and `HTTPS_PROXY` is not a name that says "secret"
 * (PRD 0002, R10, RK3).
 */
function redactIfSecret(variable: string, value: string): string {
  if (/TOKEN|SECRET|PASSWORD|_KEY$|^KEY$/i.test(variable)) return '<redacted>';
  return redactUrlCredentials(value);
}

/**
 * Replace a URL's password with `***`, leaving everything else readable
 * (PRD 0002, R10).
 *
 * Applied to any value that reaches an error, a log, a CLI line or a provenance
 * report. It runs on **unparseable** values too: R9 shows the offending value
 * back to the operator, and a value that failed to parse can still carry a
 * password. Re-exported by `proxy` as `redactProxyUrl`, which is the name the
 * rest of the layer uses; it lives here so an error can redact what it shows
 * without the two modules importing each other.
 *
 * The username survives deliberately. It is not the secret, and an operator
 * diagnosing "which proxy identity is this" needs it.
 */
export function redactUrlCredentials(value: string): string {
  // Cheap reject first: the overwhelming majority of values that reach here
  // carry no authority at all, and `new URL` on each of them is wasted work.
  if (!value.includes('@')) return value;

  let parsed: URL | undefined;
  try {
    parsed = new URL(value);
  } catch {
    parsed = undefined;
  }

  if (parsed !== undefined) {
    if (parsed.password === '') return value;
    parsed.password = '***';
    return parsed.toString();
  }

  // Unparseable, so done textually: everything between `://` and the `@` that
  // ends the authority is userinfo, and everything after its first `:` is
  // secret.
  return value.replace(
    /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#@]*)@/,
    (_match: string, scheme: string, userinfo: string) => {
      const separator = userinfo.indexOf(':');
      if (separator === -1) return `${scheme}${userinfo}@`;
      return `${scheme}${userinfo.slice(0, separator)}:***@`;
    },
  );
}

/**
 * A proxy is configured but nothing can dial it (PRD 0002, R11, RK2).
 *
 * Raised at **construction**, and deliberately never recoverable by falling
 * back to a direct connection: the operator configured a proxy, and sending
 * their traffic straight out of the network instead is a compliance failure
 * that leaves no trace. The message names the package and the exact install
 * command, because a `MODULE_NOT_FOUND` names neither.
 */
export class GitHubProxyUnavailableError extends GitHubFetchError {
  /** The package that supplies the dispatcher. */
  readonly package: string;
  /** The proxy that was configured, redacted (R10). */
  readonly proxy: string;

  constructor(redactedProxy: string, packageName = '@internal/github-sdk-fetch-proxy') {
    super(
      `A proxy is configured (${redactedProxy}) but proxy support is not installed. ` +
        `Install it with \`npm install ${packageName}\` and import it once — ` +
        `\`import '${packageName}';\` — before constructing a client. ` +
        'Requests are never sent direct when a proxy is configured.',
      '',
      '',
    );
    this.name = 'GitHubProxyUnavailableError';
    this.package = packageName;
    this.proxy = redactedProxy;
  }

  override toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      package: this.package,
      proxy: this.proxy,
    };
  }
}

/**
 * The request failed while a proxy was in the path (PRD 0002, N9, RK8).
 *
 * A subclass of {@link GitHubNetworkError} rather than a sibling, so every
 * consumer already catching "the socket failed" keeps catching this. What it
 * adds is the one fact today's message cannot carry: **which** host refused —
 * with a proxy configured, the socket is opened to the proxy, so "cannot reach
 * api.github.com" is the wrong diagnosis and the wrong thing to escalate.
 */
export class GitHubProxyError extends GitHubNetworkError {
  /** The proxy the request was routed through, redacted (R10). */
  readonly proxy: string;

  constructor(message: string, method: string, url: string, redactedProxy: string, cause: unknown) {
    super(message, method, url, cause);
    this.name = 'GitHubProxyError';
    this.proxy = redactedProxy;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), proxy: this.proxy };
  }
}

/** Whether `value` is a failure reaching or traversing a proxy (N9). */
export function isGitHubProxyError(value: unknown): value is GitHubProxyError {
  return value instanceof GitHubProxyError;
}

/** Whether `value` is a configured-proxy-with-no-dispatcher failure (R11). */
export function isGitHubProxyUnavailableError(
  value: unknown,
): value is GitHubProxyUnavailableError {
  return value instanceof GitHubProxyUnavailableError;
}

/** Whether `value` is any error this layer raised. */
export function isGitHubFetchError(value: unknown): value is GitHubFetchError {
  return value instanceof GitHubFetchError;
}

/** Whether `value` is a GitHub error *status*, as opposed to a transport failure. */
export function isGitHubHttpError(value: unknown): value is GitHubHttpError {
  return value instanceof GitHubHttpError;
}

function isErrorBody(value: unknown): value is GitHubErrorBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The message to raise for a failed response.
 *
 * GitHub's own `message` is used verbatim when it sent one; PRD 0001 learned
 * that substituting our own wording for GitHub's is a loss the consumer cannot
 * recover from.
 */
export function messageForStatus(status: number, statusText: string, data: unknown): string {
  if (isErrorBody(data) && typeof data.message === 'string' && data.message !== '') {
    return data.message;
  }
  if (typeof data === 'string' && data.trim() !== '') {
    return data.length > 200 ? `${data.slice(0, 200)}…` : data;
  }
  return statusText === '' ? `HTTP ${status}` : `HTTP ${status}: ${statusText}`;
}
