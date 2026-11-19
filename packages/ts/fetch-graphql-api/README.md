# `@internal/github-sdk-fetch-graphql-api`

The GitHub GraphQL transport. Built for
[PRD 0002](../../../.ai/planners/RCM-github/PRDs/0002-unified-github-fetch-layer/PRD.md),
requirement **R12**.

## This package has no consumer

Nothing in this repository issues a GraphQL query — no query, no client, no dependency. That is
stated here, not only in a decision record, because a package that looks used but is not is worse
than one that says so.

It is built ahead of a consumer on purpose. GraphQL's `200`-carrying-`errors` envelope is not a
parameter you add to a REST-shaped layer later: it is a different success test, a different error
contract and a different pagination model, and retrofitting all three into a layer that eleven
packages already depend on is the expensive version. See
[D3](../../../.ai/planners/RCM-github/PRDs/0002-unified-github-fetch-layer/decisions/03-graphql-ships-without-a-consumer.md).

Scoped **`Should`**, not `Must`. A `Must` would assert this repository cannot function without it,
which is plainly false today.

## What it shares, and what it does not

It issues one request — `POST /graphql` — through
[`@internal/github-sdk-fetch-rest-api`](../fetch-rest-api/README.md), so the transport seam
(**R2**), authentication (**R4**), the defaults (**R5**), cancellation (**R9**), the HTTP error
contract (**R8**) and the rate limiter (**R10**) are all the REST unit's. Adding this package
required **zero** changes to it (**G5**).

What is not shared is the success test.

## Usage

```ts
import { GitHubGraphQLClient } from '@internal/github-sdk-fetch-graphql-api';

// The token comes from GITHUB_TOKEN or GH_TOKEN, and the host from
// GITHUB_API_URL or GH_HOST — see "Configuration from the environment" below.
const client = new GitHubGraphQLClient();

const data = await client.graphql<{ viewer: { login: string } }>(
  `query { viewer { login } }`,
);
```

GitHub's GraphQL API rejects unauthenticated requests, unlike its REST API — a token is not
optional here in practice.

## A 200 with errors is a failure

```ts
try {
  await client.graphql(query, variables);
} catch (error) {
  if (error instanceof GitHubGraphQLError) {
    error.errors;      // everything GitHub reported
    error.data;        // what it *did* resolve — a partial response keeps both halves
    error.isPartial;   // whether anything resolved at all
    error.requestId;   // x-github-request-id
    error.extensions;  // GitHub's point-cost accounting
  }
}
```

A partial response — `data` and `errors` together — is still an error, and the error carries both
halves so the caller decides which matters. Raising without `data` attached would make that
decision for them.

An HTTP-level failure is **not** a `GitHubGraphQLError`: a `502` carries no envelope to inspect,
so it surfaces as the REST unit's `GitHubHttpError`. The two are not the same failure and do not
collapse into one.

`raw(query, variables, options)` returns `{ envelope, response }` unjudged, for a caller that
wants to inspect `errors` and `extensions` without an exception.

## Cursor pagination

```ts
const nodes = await client.paginate(
  `query($cursor: String) {
     viewer { repositories(first: 100, after: $cursor) {
       nodes { name }
       pageInfo { hasNextPage endCursor }
     } }
   }`,
);
```

- The query must select `pageInfo { hasNextPage endCursor }` and pass the cursor variable as the
  connection's `after`. The variable is named `cursor` unless `cursorVariable` says otherwise.
- The connection is found breadth-first, so the shallowest wins; `connectionPath` resolves a query
  with several at the same depth.
- Nodes come from `nodes`, or from `edges[].node` when the query asked for edges.
- `maxPages` and `maxItems` cap the iteration.
- `hasNextPage: true` with no `endCursor` **stops** rather than replaying with `null`, which would
  restart from page one forever.
- Every page is a separate governed request (**R10**).

`paginateIterator` yields whole pages with the located connection, GitHub's `extensions` and the
transporting response; `paginateEach` yields nodes one at a time.

## Rate limiting

Metered under the limiter's **`graphql`** bucket, not `core` — a separate budget with separate
exhaustion. A query is marked replayable even though it travels as a `POST`; pass
`idempotent: false` for a mutation.

Point-cost accounting is deliberately **not** implemented. PRD 0001 defers it until a GraphQL
consumer exists, and this package inherits that deferral rather than reversing it. GitHub's cost
readout is reachable as `extensions` for a caller that wants it.

## Options

| Option | Environment | Default | Effect |
| --- | --- | --- | --- |
| `token` | `GITHUB_TOKEN`, `GH_TOKEN` | none | Sent as `Authorization: <scheme> <token>`. `null` forces anonymous |
| `authScheme` | — | `Bearer` | The `Authorization` scheme |
| `baseUrl` | `GITHUB_API_URL`, `GH_HOST` | `https://api.github.com` | `/graphql` is appended to it |
| `userAgent` | `GITHUB_USER_AGENT` | the REST unit's | `User-Agent` |
| `timeoutMs` | `GITHUB_API_TIMEOUT` (ms) | `30000` | Per-request timeout |
| `env` | — | `true` | **`false` disables every environment read** for this client |
| `fetch` | — | platform global | The transport, resolved at call time |
| `limiter` | — | one built here | Share one to share a budget with a REST client on the same token |
| `headers` | — | none | Added to every request |
| `proxy` | `GITHUB_PROXY`, `https_proxy`/`HTTPS_PROXY`, `http_proxy`/`HTTP_PROXY` | none | HTTP proxy for every request. `null` forces direct. Needs `@internal/github-sdk-fetch-proxy` |
| `proxyBypass` | `GITHUB_NO_PROXY`, `no_proxy`/`NO_PROXY` | none | Hosts reached directly, by curl's `NO_PROXY` rules |
| `transportInit` | — | none | Merged into the transport's `init`; the undici `Dispatcher` seam for pooling, mTLS and CA bundles |
| `rest` | — | none | An already-configured REST client to issue through. **When supplied, every other option is ignored**, including `env` — it is already configured. This is how the SDK facade gives both units one token, one limiter and one transport |

## Configuration from the environment (PRD 0001)

Every setting resolves **explicit option > environment > default**, at construction. An explicit
option is never overridden by a variable.

This package holds **no** environment resolution of its own. It constructs a
`GitHubRestClient` and inherits that unit's, so a token or a host resolved here is the same one
REST resolves — by construction rather than by agreement.

```ts
new GitHubGraphQLClient();                      // token and host from the environment
new GitHubGraphQLClient({ token: 'ghp_…' });    // the option wins over GITHUB_TOKEN
new GitHubGraphQLClient({ env: false });        // no environment reads at all

new GitHubGraphQLClient().configSources;
// { token: env:GH_TOKEN, baseUrl: default, … } — the source, never the token
```

The full contract — the variable order, the `GH_HOST` mapping, the millisecond unit on
`GITHUB_API_TIMEOUT`, and the `GitHubEnvironmentError` raised for a malformed value — is
documented in
[`@internal/github-sdk-fetch-rest-api`](../fetch-rest-api/README.md#configuration-from-the-environment-prd-0001).

`/graphql` is appended to the **base URL in effect**, so a `GITHUB_API_URL` of
`https://ghe.example.test/api/v3` posts to `https://ghe.example.test/api/v3/graphql`.

> **Known limitation, unchanged by PRD 0001.** GitHub Enterprise Server serves GraphQL at
> `/api/graphql`, not under the REST root — so a GHES base URL that is correct for REST is not
> correct for GraphQL. Appending `/graphql` to the REST base is this package's behavior from the
> day it shipped; the environment simply supplies the base URL it was always going to use. A GHES
> GraphQL consumer needs a separate client, or a `GRAPHQL_PATH` that is configurable — neither is
> in this PRD's scope, and there is no GraphQL consumer in this repository yet.

## Proxying and the transport seam

Node's `fetch` ignores `HTTPS_PROXY`. This client does not.

```sh
npm install @internal/github-sdk-fetch-proxy
```

```ts
import '@internal/github-sdk-fetch-proxy';   // the opt-in: one import

new GitHubGraphQLClient();                                        // HTTPS_PROXY is honored
new GitHubGraphQLClient({ proxy: 'http://proxy.example.test:8080' });
new GitHubGraphQLClient({ proxy: null });                         // direct, whatever the environment says
new GitHubGraphQLClient().proxyConfig;                            // about to proxy? through what?
```

Resolution, the variable order, the `NO_PROXY` matching rules, credential redaction and the
construction-time failure when a proxy is configured without the package installed are all the
REST unit's and are documented
[there](../fetch-rest-api/README.md#proxying) — this package holds no copy of them.

`transportInit` reaches this client too. It is the undici `Dispatcher` seam for connection
pooling, mTLS and custom CA bundles — the same escape hatch the REST unit and the SDK facade have
always exposed, and which this package lacked until the proxy work closed the gap. For **proxying**
use `proxy` rather than a hand-built dispatcher: the platform global `fetch` discards an init
`dispatcher`, and `proxy` also resolves from the environment, honors `NO_PROXY` and redacts its
credentials.

Both are ignored when `rest` is supplied, like every other option — that client is already
configured.

## Testing

39 tests, no network, no live socket, with the layer's environment variables cleared before each
one.

```bash
npm test -w fetch-graphql-api
```
