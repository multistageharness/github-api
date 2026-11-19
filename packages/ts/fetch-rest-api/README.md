# `@internal/github-sdk-fetch-rest-api`

The one GitHub REST transport for this repository. Built for
[PRD 0002](../../../.ai/planners/RCM-github/PRDs/0002-unified-github-fetch-layer/PRD.md),
requirements **R1–R11**.

Everything a GitHub call needs above the socket lives here once: the request contract, auth, the
three defaults every request carries, body handling, cancellation, the response contract, the
error contract, and pagination. Before it, those were rebuilt per package — nine `Link`-header
parsers, eighteen files hardcoding `https://api.github.com`, five hardcoding the API version, two
`Authorization` schemes.

**Rate limiting is not here.** It belongs to
[`@internal/github-sdk-ratelimit`](../ratelimit/README.md), which shipped in PRD 0001. This
package contains zero lines of classification, pacing, waiting or backoff; it is where the
limiter plugs in (**R10**).

## Install

Workspace-linked. Add it to a package's `dependencies`:

```json
{ "dependencies": { "@internal/github-sdk-fetch-rest-api": "^0.0.1" } }
```

## Quick start

```ts
import { GitHubRestClient } from '@internal/github-sdk-fetch-rest-api';

// Token and base URL come from the environment. Pass them explicitly to
// override — see "Configuration from the environment" below.
const client = new GitHubRestClient();

const { data, status, rateLimit } = await client.request('GET /repos/{owner}/{repo}', {
  owner: 'nodejs',
  repo: 'undici',
});

for await (const issue of client.paginate.each('GET /repos/{owner}/{repo}/issues', {
  owner: 'nodejs',
  repo: 'undici',
  state: 'open',
})) {
  // one issue at a time, across every page
}
```

## The request contract (R3)

`request(route, parameters, options)`.

- **`route`** — `"GET /repos/{owner}/{repo}"`, a bare path, or an **absolute URL**. An absolute
  URL is used verbatim, which is how a `Link`-header URL is followed rather than rebuilt.
- **`parameters`** — names matching a `{placeholder}` are substituted into the path and
  URL-encoded, so a `/` in a branch name or a `#` in a query cannot corrupt it. `{+path}` keeps
  segment separators, for GitHub's file-path routes. Whatever is left becomes **query
  parameters** for `GET`/`HEAD`/`DELETE`/`OPTIONS` and a **JSON body** otherwise. `undefined` and
  `null` are dropped, never serialized — `sort=undefined` earns a `422` from GitHub. An array
  repeats its key (`labels=a&labels=b`).
- **`options`** — a separate object, so no parameter name is reserved.

| Option | Unit | Default | Effect |
| --- | --- | --- | --- |
| `headers` | — | none | Merged over the client's, case-insensitively. A per-request header always wins; setting one to `undefined` removes a default |
| `accept` | — | client's `accept` | Shorthand for `headers.accept` — the media type (R11) |
| `contentType` | — | derived | Shorthand for `headers['content-type']`. Set automatically for a JSON body |
| `body` | — | the leftover parameters | An explicit body. Strings, `URLSearchParams`, buffers, typed arrays, `Blob`, `FormData` and streams go out verbatim; anything else is JSON |
| `timeoutMs` | ms | client's `timeoutMs` | Per-request timeout; aborts the request (R9) |
| `signal` | — | none | Caller cancellation. Composes with the timeout — first to fire wins |
| `responseType` | — | `auto` | `auto` \| `json` \| `text` \| `arrayBuffer` \| `stream` (R11) |
| `resource` | — | derived from the URL | Force the rate-limit bucket |
| `idempotent` | — | `true` for GET/HEAD/OPTIONS | Whether the limiter may replay after a wait |
| `transportInit` | — | none | Merged into the transport's `init`. The undici `Dispatcher` seam — pooling, mTLS, CA bundles. For proxying use the client's [`proxy`](#proxying) option |

Verb helpers — `get`, `post`, `patch`, `put`, `delete`, `head` — take the same arguments with the
method supplied.

## The response contract (R7)

Every successful call returns the same shape, whatever the media type:

```ts
{ status, url, headers, data, response, rateLimit, links }
```

- `data` is `null` — never a parse error — for `204`, `205`, `304`, an empty body, and
  `responseType: 'stream'`.
- A body that claims JSON but does not parse **degrades to text**. GitHub does occasionally answer
  with an HTML error page carrying a JSON content type, and the page's text is the only diagnostic
  there is.
- `response` is the underlying `Response`. Its body is already consumed unless `responseType` was
  `stream`.
- `rateLimit` carries GitHub's headers, parsed once, on **success and failure alike**.
- `links` carries the `Link` header's four cursors, parsed once.

`304` is returned rather than thrown, so a conditional request stays distinguishable from a `200`
(**R16**'s seam).

## The error contract (R8)

| Error | Raised when |
| --- | --- |
| `GitHubHttpError` | GitHub answered outside 2xx. Carries `status`, `method`, `url`, GitHub's `message`, `documentationUrl`, `requestId`, `data`, `response`, `headers`, `rateLimit` |
| `GitHubNetworkError` | The request never produced a response — DNS, connection refused, TLS, reset |
| `GitHubTimeoutError` | The per-request timeout fired. Carries `timeoutMs` |
| `GitHubAbortError` | The caller's `AbortSignal` fired |
| `GitHubEnvironmentError` | An environment variable cannot mean what it claims to. Raised at **construction**, not at request time. Carries `variable`, `value` and `kind` (`environment` or `option`) |
| `GitHubProxyError` | The request failed while a proxy was in the path. A **subclass of `GitHubNetworkError`**, so existing catches still match; carries the redacted `proxy` and names it in the message |
| `GitHubProxyUnavailableError` | A proxy is configured but proxy support is not installed. Raised at **construction**; carries `package` and the redacted `proxy` |

All of them extend `GitHubFetchError`, so "anything the layer threw" is one `instanceof`. They are
distinguishable **by type**, not by matching a message string.

A **rate limit is not re-classified here.** `GitHubRateLimitError` from
`@internal/github-sdk-ratelimit` passes through untouched, with GitHub's own wording intact.

A token never appears in an error message, an error's `toJSON()`, or a URL — request headers are
never carried on an error at all (**N8**).

## Pagination (R6)

```ts
await client.paginate(route, params, options);         // every item
client.paginate.iterator(route, params, options);      // whole pages
client.paginate.each(route, params, options);          // one item at a time
```

- The `next` URL GitHub returned is followed **verbatim**. GitHub's cursor endpoints do not accept
  a reconstructed `?page=N`.
- `maxPages` and `maxItems` cap the iteration — and stop it, not just its output: an item cap that
  falls mid-page issues no further request.
- Cancellable mid-iteration via `signal`, checked before each page so a cancelled iteration issues
  no further request.
- **Every page is a separate governed request**, so the whole iteration is rate-limited, not just
  its first page.
- Items come from an array body, an `items` array, or the first array-valued property of a
  `total_count` envelope. Anything else throws with a usable message rather than silently yielding
  nothing; `itemsOf` is the override.

## Rate limiting (R10)

```ts
import { GitHubRateLimiter } from '@internal/github-sdk-ratelimit';

const limiter = new GitHubRateLimiter();
const a = new GitHubRestClient({ token, limiter });
const b = new GitHubRestClient({ token, limiter }); // one token, one budget
```

The governed task returns the layer's own response contract, which is exactly the shape the
limiter's **default** extractor reads — `status`, `headers`, and the parsed `data`. That is what
makes GitHub's secondary-limit signal, which appears only in the response body, available with no
per-consumer `extractResponse` shim. Eight of those shims exist in this repository today.

Omit `limiter` and the client builds its own. Never layer a second limiter over a client: two
limiters on one token double-count the same budget.

## The transport (R2, D2)

The platform's global `fetch` — Node's undici-backed implementation — resolved **at call time**,
so a test double installed after import is honored. The package declares no HTTP dependency.

```ts
new GitHubRestClient({ fetch: myFetch });                 // a double, or a host's wrapper
new GitHubRestClient({ transportInit: { dispatcher } });  // undici Agent — pooling, mTLS, CA bundle
```

`transportInit` is merged **beneath** the request contract, so a pass-through cannot clobber the
method, headers, body or signal.

**To proxy, use the [`proxy` option](#proxying-prd-0002) rather than `transportInit`.** Hand-building
a dispatcher was once the only way, and it does not work on its own any more: the platform global
`fetch` **discards** an init `dispatcher`, so `transportInit: { dispatcher }` alone reaches the
socket only if you also replace `fetch` with undici's. The `proxy` option handles that, and
resolves from the environment, honors `NO_PROXY`, validates at construction and redacts its
credentials — none of which a hand-built dispatcher does.

Supplying `fetch` **replaces the transport wholesale, proxying included**: the proxy needs that
slot for its own undici-bound `fetch`. Its dispatcher is still passed in each request's `init`, so
an injected transport built on undici proxies anyway — one built on anything else does not. Prefer
`transportInit` over `fetch` when you want to instrument requests *and* keep `proxy` working.

## Proxying

> Requirement ids in this section are from the **proxy-support** PRD
> (`.ai/planners/RCM-github/PRDs/0002-proxy-support-…`), a different document from the
> "unified GitHub fetch layer" PRD the rest of this README cites. The two share a number and
> nothing else.

Node's `fetch` ignores `HTTPS_PROXY`. This layer does not.

```sh
npm install @internal/github-sdk-fetch-proxy
```

```ts
import '@internal/github-sdk-fetch-proxy';                    // the opt-in: one import
import { GitHubRestClient } from '@internal/github-sdk-fetch-rest-api';

new GitHubRestClient();                                       // HTTPS_PROXY is now honored
new GitHubRestClient({ proxy: 'http://proxy.example.test:8080' });
new GitHubRestClient({ proxy: null });                        // direct, whatever the environment says
```

**The HTTP stack lives in that separate package, and this one's dependency list is unchanged.** A
consumer who never proxies installs nothing and gets a byte-identical dependency tree.

**A configured proxy is never silently ignored.** Configure one without installing the package and
construction throws `GitHubProxyUnavailableError`, naming the package and the install command —
because a proxy that is quietly skipped sends traffic you believed was proxied straight out of the
network, and leaves no trace that it did.

| Setting | Variables, in order | Option | Notes |
| --- | --- | --- | --- |
| Proxy | `GITHUB_PROXY`, then `https_proxy`/`HTTPS_PROXY` **or** `http_proxy`/`HTTP_PROXY` | `proxy` | The pair is selected by the **resolved** base URL's scheme, so only one pair is ever read. Lowercase beats uppercase, following curl |
| Bypass list | `GITHUB_NO_PROXY`, `no_proxy`, `NO_PROXY` | `proxyBypass` | Comma-separated, or an array in the option |

Both obey the layer's one resolution order — **explicit option > environment > no proxy** — and
both are turned off by `env: false` along with everything else. `proxy: null` forces a direct
connection for the proxy alone, leaving the token and base URL still resolved.

### The bypass list

curl's rules, so an operator's existing `NO_PROXY` keeps meaning to this layer what it already
means to every other tool on the machine.

| Entry | Matches |
| --- | --- |
| `*` | Everything — a total bypass |
| `example.test` | That host exactly, **and any subdomain of it** |
| `.example.test` | Any subdomain of it, and the bare host |
| `example.test:8080` | That host **only on that port** |
| `10.0.0.5` | That literal address |

Entries are comma-separated, surrounding whitespace is ignored, matching is case-insensitive, and
an **empty entry bypasses nothing** — a stray comma must not become a total bypass. An entry that
cannot match anything is not an error: failing a deployment over a typo in a bypass list is worse
than ignoring it.

### Credentials

A proxy URL's `user:password@` is sent to the proxy as `Proxy-Authorization` and appears
**nowhere else**. Every accessor, error message and diagnostic shows `http://*****:***@host:port`;
the real value is not readable back out of a client at all. Your GitHub token goes to GitHub, and
the proxy credential goes to the proxy — never the other way round.

### Is this client about to proxy?

```ts
new GitHubRestClient().proxyConfig;
// { source: 'env:HTTPS_PROXY', url: 'http://*****:***@proxy.test:8080',
//   effective: 'direct', bypassed: true,
//   bypassSource: 'env:NO_PROXY', bypass: ['api.github.com'] }
```

Answerable without issuing a request. It distinguishes the two states an operator otherwise
conflates: **no proxy configured** (`source: 'default'`) versus **a proxy configured and this host
bypassed** (`bypassed: true`). `configSources` is unchanged and still covers the five PRD 0001
settings.

### When the proxy is the thing that failed

A request that fails while a proxy is in the path raises `GitHubProxyError` — a subclass of
`GitHubNetworkError`, so existing `catch` blocks still catch it — whose message names the **proxy**
rather than `api.github.com`. With a proxy configured the socket is opened to the proxy, so
"cannot reach GitHub" is the wrong diagnosis and the wrong thing to escalate.

### What it does not do

SOCKS, PAC/WPAD auto-configuration, custom CA bundles, mTLS and per-request proxy overrides are
all out of scope. `NODE_EXTRA_CA_CERTS` covers the common TLS-intercepting case with no code here;
`transportInit` remains the seam for the rest.

## Defaults (R5)

| Value | Environment | Default | Override |
| --- | --- | --- | --- |
| Base URL | `GITHUB_API_URL` → `GH_HOST` | `https://api.github.com` | `baseUrl` — no route string changes |
| API version | `GITHUB_API_VERSION` | `2022-11-28` | `apiVersion` |
| `Accept` | — | `application/vnd.github+json` | `accept`, per client or per request |
| `User-Agent` | `GITHUB_USER_AGENT` | `github-sdk-fetch-rest-api/0.0.1` | `userAgent` |
| Auth scheme | — | `Bearer` | `authScheme` |
| Timeout | `GITHUB_API_TIMEOUT` (ms) | `30000` ms | `timeoutMs`, per client or per request |
| Proxy | `GITHUB_PROXY`, `https_proxy`/`HTTPS_PROXY`, `http_proxy`/`HTTP_PROXY` | none | `proxy`; `null` forces direct |
| Proxy bypass | `GITHUB_NO_PROXY`, `no_proxy`/`NO_PROXY` | none | `proxyBypass` |

Each is exported as a `DEFAULT_*` constant, so a consumer reads it rather than restating it.

## Configuration from the environment (PRD 0001)

Every setting a request carries resolves in one order:

```
explicit option  >  environment  >  package default
```

An explicit option is **never** overridden by a variable. Resolution happens **at construction**,
so a variable set after this module was imported is honored — the same rule the transport already
follows.

| Setting | Variables, in order | Notes |
| --- | --- | --- |
| Token | `GITHUB_TOKEN`, `GH_TOKEN` | Actions sets the first; the `gh` CLI exports the second |
| Base URL | `GITHUB_API_URL`, `GH_HOST` | `GITHUB_API_URL` is a full URL, used **verbatim** including any `/api/v3` prefix. `GH_HOST` is a **hostname**: `github.com` → `https://api.github.com`, anything else → `https://<host>/api/v3` |
| API version | `GITHUB_API_VERSION` | `X-GitHub-Api-Version` |
| Timeout | `GITHUB_API_TIMEOUT` | **Milliseconds**, the same unit as `timeoutMs` |
| `User-Agent` | `GITHUB_USER_AGENT` | |
| Proxy | `GITHUB_PROXY`, then `https_proxy`/`HTTPS_PROXY` or `http_proxy`/`HTTP_PROXY` | Scheme-selected against the **resolved** base URL; lowercase beats uppercase. See [Proxying](#proxying) |
| Proxy bypass | `GITHUB_NO_PROXY`, `no_proxy`, `NO_PROXY` | curl's matching rules |

The first variable holding a **non-empty** value wins; empty and whitespace-only are treated as
absent, and a value is trimmed before use (a token from `$(…)` arrives with a newline).

`Accept` and the `Authorization` scheme have **no** variable. Neither describes which instance you
are talking to — one is a per-request media type, the other a per-consumer compatibility knob.

```ts
new GitHubRestClient();                                  // everything from the environment
new GitHubRestClient({ baseUrl: 'https://ghe…/api/v3' }); // host in code, token from GITHUB_TOKEN
new GitHubRestClient({ token: null });                    // anonymous here; other defaults still resolve
new GitHubRestClient({ env: false });                     // no environment reads at all
new GitHubRestClient({ proxy: null });                    // direct, whatever HTTPS_PROXY says
```

**`env: false`** is the opt-out: one switch, not one per setting. With it off, a client is
behaviorally identical to one built before this feature existed, whatever the environment holds.

An **environment token follows the base URL in effect** — the common case being a private host in
code and a token in the environment. There is no cross-host suppression; `token: null` is how a
caller says "anonymous, against this host".

### Where a value came from

```ts
new GitHubRestClient().configSources;
// { token: env:GH_TOKEN, baseUrl: env:GITHUB_API_URL,
//   apiVersion: default, userAgent: default, timeoutMs: default }
```

`'option'`, `'default'`, or the **exact variable**. It answers "which token is this client about
to send, and where did it come from" without issuing a request — and carries the token's *source*,
never its *value*.

### A malformed value fails at construction

`GITHUB_API_URL=not a url`, a non-`http(s)` scheme, a `GH_HOST` carrying a path, a
`GITHUB_API_TIMEOUT` that is not a positive number, or a proxy value that is not an `http:`/`https:`
URL with a port in range all raise **`GitHubEnvironmentError`** — one of
this layer's own errors, naming the variable and showing the offending value, rather than a
`TypeError` from `new URL` on the first request. A credential-shaped variable has its value
redacted from the message. An **unset** variable is never an error.

### What it does not do

No `.env` file is read, no `~/.config/gh/hosts.yml`, no filesystem or network at construction, and
no dependency is added. Only `process.env`. A CLI that wants `.env` loading keeps doing it at the
CLI boundary, where it already does.

## Authentication (R4)

- Resolved at construction from `token`, then `GITHUB_TOKEN`, then `GH_TOKEN`; applied to every
  request.
- No token — or an empty string — means **no `Authorization` header at all**, not an empty one.
  Unauthenticated requests work.
- A **per-request** `Authorization` header always beats the client's, environment-resolved or not.
- `token: null` forces an anonymous client without disabling the other environment defaults.
- `setToken(token)` replaces it at runtime; `setToken(undefined)` drops it and does **not**
  re-consult the environment.
- The token is never readable back out: `hasToken()` is presence-only, and no error, `toJSON()`,
  URL or introspection surface carries it.

## Testing

The whole suite runs with no network and no live socket, against an injected transport. 191 tests
in well under a second, with the layer's environment variables cleared before each one so the
suite depends on what it sets rather than on the shell it runs in. Coverage reporting needs
`@vitest/coverage-v8`, which this checkout's registry does not serve; `tests/units.test.ts` covers
the composed modules directly in its place.

```bash
npm test -w fetch-rest-api
```
