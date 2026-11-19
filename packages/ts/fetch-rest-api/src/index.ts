/**
 * @fileoverview `@internal/github-sdk-fetch-rest-api` — the one GitHub REST
 * transport for this repository (PRD 0002, R1–R11).
 *
 * Built on the platform's global `fetch`, with the transport injectable so the
 * whole suite runs with no socket (R2, D2). Zero runtime dependencies beyond
 * `@internal/github-sdk-ratelimit`, which is itself zero-dependency: this sits
 * beneath every SDK in the monorepo and its footprint is inherited by all of
 * them (N2).
 *
 * It owns **no** rate-limit logic. Waiting, pacing, classification and backoff
 * belong to `@internal/github-sdk-ratelimit`, which shipped in PRD 0001; this
 * package is where it plugs in (R10).
 * @module @internal/github-sdk-fetch-rest-api
 */

export { GitHubRestClient, createRestClient, type Paginate } from './client.js';

export {
  DEFAULT_ACCEPT,
  DEFAULT_API_VERSION,
  DEFAULT_AUTH_SCHEME,
  DEFAULT_BASE_URL,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
} from './defaults.js';

export {
  GitHubAbortError,
  GitHubEnvironmentError,
  GitHubFetchError,
  GitHubHttpError,
  GitHubNetworkError,
  GitHubProxyError,
  GitHubProxyUnavailableError,
  GitHubTimeoutError,
  isGitHubEnvironmentError,
  isGitHubFetchError,
  isGitHubHttpError,
  isGitHubProxyError,
  isGitHubProxyUnavailableError,
  messageForStatus,
  redactUrlCredentials,
  type GitHubErrorBody,
} from './errors.js';

// The environment contract (PRD 0001). The variable names are exported so a
// consumer documents or clears them without restating the strings, and
// `resolveConfig` so a caller can compose options before construction.
export {
  API_VERSION_VARIABLE,
  BASE_URL_VARIABLES,
  ENVIRONMENT_VARIABLES,
  TIMEOUT_VARIABLE,
  TOKEN_VARIABLES,
  USER_AGENT_VARIABLE,
  resolveConfig,
  type ConfigSource,
  type GitHubConfigSources,
  type GitHubProxyReport,
  type ResolvableOptions,
  type ResolvedConfig,
} from './env.js';

// The proxy contract (PRD 0002). `setProxyDispatcherFactory` is the seam the
// opt-in `@internal/github-sdk-fetch-proxy` package registers through — the one
// thing proxying needs that cannot be done without an HTTP stack (R11, D1).
// Everything else here is string and `URL` work, exported so a CLI can validate
// a `--proxy` flag and redact it with the layer's own rules rather than a second
// implementation that eventually disagrees.
export {
  GITHUB_PROXY_VARIABLE,
  HTTPS_PROXY_VARIABLES,
  HTTP_PROXY_VARIABLES,
  NO_PROXY_VARIABLES,
  PROXY_VARIABLES,
  createProxyTransport,
  getProxyTransportFactory,
  isBypassed,
  isProxySupportInstalled,
  parseBypassList,
  parseProxyValue,
  proxyVariablesFor,
  redactProxyUrl,
  setProxyTransportFactory,
  type ProxyTarget,
  type ProxyTransport,
  type ProxyTransportFactory,
  type ProxyValueSource,
} from './proxy.js';

export {
  buildRequest,
  isAbsoluteUrl,
  joinPath,
  parseRoute,
  type BuiltRequest,
  type ParsedRoute,
} from './endpoint.js';

export { mergeHeaders, readRateLimitHeaders } from './headers.js';
export { NO_LINKS, defaultItemsOf, followableNext, parseLinkHeader, parseLinks } from './pagination.js';
export { encodeBody, isJsonType, readBody, type EncodedBody } from './body.js';
export { composeSignal, isAbortLike, type ComposedSignal } from './signal.js';

export type {
  FetchLike,
  GitHubProxyOptions,
  GitHubResponse,
  GitHubRestClientOptions,
  PaginateOptions,
  PaginationLinks,
  RateLimitHeaders,
  RequestOptions,
  RequestParameters,
  ResponseType,
} from './types.js';
