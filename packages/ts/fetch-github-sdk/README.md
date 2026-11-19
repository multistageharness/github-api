# `@internal/github-sdk-fetch-github-sdk`

The facade composing the REST and GraphQL transports. Built for
[PRD 0002](../../../.ai/planners/RCM-github/PRDs/0002-unified-github-fetch-layer/PRD.md),
requirement **R13**.

The role `@octokit/core` plays in `octokit.js`: one object a consumer constructs, holding the
token, the limiter and the transport, exposing both APIs.

It **composes and configures**. It adds no capability the underlying units lack — anything it could
do that they cannot would be a capability hidden behind a facade, and
[`@internal/github-sdk-fetch-rest-api`](../fetch-rest-api/README.md) would stop being usable on its
own.

## Usage

```ts
import { GitHubSdk } from '@internal/github-sdk-fetch-github-sdk';

// Token and base URL come from the environment — see "Configuration from the
// environment" below. Pass `{ token: '…' }` to override.
const sdk = new GitHubSdk();

const { data } = await sdk.request('GET /repos/{owner}/{repo}', { owner: 'nodejs', repo: 'undici' });
const viewer = await sdk.query('query { viewer { login } }');

for await (const issue of sdk.paginate.each('GET /repos/{owner}/{repo}/issues', {
  owner: 'nodejs',
  repo: 'undici',
})) {
  // …
}
```

`sdk.rest` and `sdk.graphql` are the units themselves, for anything the shorthands do not cover.

## One token, one limiter, one transport

The facade builds **one** limiter and **one** REST client, and constructs the GraphQL client *from
that REST client* rather than from the options a second time — which is how two halves of one SDK
end up with two tokens.

- `sdk.limiter === sdk.rest.limiter === sdk.graphql.limiter`
- `sdk.graphql.rest === sdk.rest`
- `sdk.setToken(t)` replaces the token on both at once.

REST traffic is metered under the bucket the limiter derives from the URL; GraphQL under
`graphql`. One limiter, separate budgets.

## Both units stay usable without it

A consumer needing only REST imports `@internal/github-sdk-fetch-rest-api` directly and pays
nothing for a GraphQL transport that
[has no consumer](../fetch-graphql-api/README.md#this-package-has-no-consumer). That is what this
package's existence is for, not something it works around.

## Options

| Option | Unit | Environment | Default | Effect |
| --- | --- | --- | --- | --- |
| `token` | — | `GITHUB_TOKEN`, `GH_TOKEN` | none | Sent as `Authorization: <scheme> <token>`. `null` forces anonymous; GitHub's GraphQL API requires a token |
| `authScheme` | — | — | `Bearer` | The `Authorization` scheme |
| `baseUrl` | URL | `GITHUB_API_URL`, `GH_HOST` | `https://api.github.com` | REST base, and the host `/graphql` is appended to |
| `userAgent` | — | `GITHUB_USER_AGENT` | `github-sdk-fetch-rest-api/0.0.1` | `User-Agent`. GitHub rejects requests without one |
| `apiVersion` | — | `GITHUB_API_VERSION` | `2022-11-28` | `X-GitHub-Api-Version`, REST only |
| `accept` | — | — | `application/vnd.github+json` | Default REST `Accept`, overridable per request |
| `headers` | — | — | none | Added to every request, beneath any per-request override |
| `timeoutMs` | ms | `GITHUB_API_TIMEOUT` (ms) | `30000` | Per-request timeout; aborts the request |
| `env` | — | — | `true` | **`false` disables every environment read** for this SDK, both units |
| `fetch` | — | — | platform global | The transport, resolved at call time |
| `limiter` | — | — | one built here | Governs every request from both units |
| `limiterOptions` | — | — | none | Configures the limiter built here. **Ignored when `limiter` is supplied** — a caller's limiter is already configured |
| `transportInit` | — | — | none | Merged into the transport's `init`; the undici `Dispatcher` seam for pooling, mTLS and CA bundles. For proxying use `proxy` |
| `proxy` | URL | `GITHUB_PROXY`, `https_proxy`/`HTTPS_PROXY`, `http_proxy`/`HTTP_PROXY` | none | HTTP proxy for **both** units. `null` forces direct. Needs `@internal/github-sdk-fetch-proxy` |
| `proxyBypass` | list | `GITHUB_NO_PROXY`, `no_proxy`/`NO_PROXY` | none | Hosts reached directly, by curl's `NO_PROXY` rules |

`DEFAULTS` is exported, frozen, so a consumer reads the repository's defaults rather than restating
them.

## Configuration from the environment (PRD 0001)

Every setting resolves **explicit option > environment > default**, at construction. An explicit
option is never overridden by a variable.

```ts
new GitHubSdk();                          // token and host from the environment
new GitHubSdk({ token: 'ghp_…' });        // the option wins over GITHUB_TOKEN
new GitHubSdk({ token: null });           // anonymous; the other defaults still resolve
new GitHubSdk({ env: false });            // no environment reads at all, both units

new GitHubSdk().configSources;
// { token: env:GITHUB_TOKEN, baseUrl: default, … } — the source, never the token
```

There is one resolution, and it is the REST unit's: the facade builds one REST client and
constructs the GraphQL client from it, so both halves resolve once and agree by construction. The
full contract — the variable order, the `GH_HOST` mapping, the millisecond unit on
`GITHUB_API_TIMEOUT`, and the `GitHubEnvironmentError` raised for a malformed value — is documented
in
[`@internal/github-sdk-fetch-rest-api`](../fetch-rest-api/README.md#configuration-from-the-environment-prd-0001).

No `.env` file is read and no dependency is added; only `process.env`.

## Proxying

Node's `fetch` ignores `HTTPS_PROXY`. This SDK does not.

```sh
npm install @internal/github-sdk-fetch-proxy
```

```ts
import '@internal/github-sdk-fetch-proxy';   // the opt-in: one import

const sdk = new GitHubSdk();                             // HTTPS_PROXY is honored
new GitHubSdk({ proxy: 'http://proxy.example.test:8080' });
new GitHubSdk({ proxy: null });                          // direct, whatever the environment says

sdk.proxyConfig;
// { source: 'env:HTTPS_PROXY', url: 'http://*****:***@proxy.test:8080',
//   effective: 'proxy', bypassed: false, bypassSource: 'default', bypass: [] }
```

**One proxy, both units.** `sdk.rest` and `sdk.graphql` share one REST client, so they share one
transport — which is the point of the facade. There is no per-unit proxy setting and there is no
way for the two to disagree.

The variable order, the `NO_PROXY` matching rules, credential redaction, and the construction-time
failure when a proxy is configured without the package installed are the REST unit's and are
documented [there](../fetch-rest-api/README.md#proxying). This package adds no proxy behavior of
its own — it composes and configures, exactly as it does for the token and the limiter.

## Re-exports

Both units' error classes and types are re-exported, so a facade user depends on one package
rather than three. This is a convenience — the units remain directly importable.

## Testing

29 tests, no network — including the layer-wide invariants only checkable from here: `process.env`
is read in exactly one module across all three packages, no `.env` loader or I/O module is
imported anywhere in them, and their runtime dependencies are unchanged.

```bash
npm test -w fetch-github-sdk
```
