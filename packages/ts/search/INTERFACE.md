# @internal/github-sdk-search — Interface

**Purpose:** An enterprise-grade TypeScript client for the **GitHub Search API**. It exposes a tiered client hierarchy (base → rate-limited → safe), plus cached/batched variants, a `search.*` convenience namespace, and a `github-search` CLI. Every capability maps to a GitHub `GET /search/<type>` REST endpoint.

**Domain:** GitHub Search — repositories, code, commits, issues/PRs, users, labels, and topics. The surface is small (~8 methods on the client) but each search type accepts a rich `q` query string with type-specific qualifiers plus `sort`/`order`/`per_page`/`page`.

---

## Install & Import

**npm name:** `@internal/github-sdk-search`

```bash
npm install @internal/github-sdk-search
```

**ESM (default import — the default export is `SafeSearchClient`):**

```js
import SafeSearchClient from '@internal/github-sdk-search';
const client = new SafeSearchClient({ token: 'ghp_xxx' });
```

**ESM (named imports):**

```js
import {
  BaseSearchClient,
  RateLimitedSearchClient,
  CachedSearchClient,
  BatchedSearchClient,
  SafeSearchClient,
  createSafeSearchClient,
  search,            // convenience namespace
  default as Client  // SafeSearchClient
} from '@internal/github-sdk-search';
```

**CJS (require):**

```js
const Client = require('@internal/github-sdk-search'); // module.exports default = SafeSearchClient
const { createSafeSearchClient, search } = require('@internal/github-sdk-search');
```

**Package `exports` subpaths** (from `package.json`):

| Subpath | Resolves to | Provides |
|---------|-------------|----------|
| `.` | `index.js` | All clients, `createSafeSearchClient`, `search`, default = `SafeSearchClient` |
| `./client` | `lib/SafeSearchClient.js` | `SafeSearchClient`, `createSafeSearchClient`, types |
| `./endpoints` | `endpoints/index.js` | `SEARCH_ENDPOINTS`, `ENDPOINT_METHODS`, `endpointPath`, `SearchEndpoint` |
| `./utils` | `utils/index.js` | Error classes, `normalizeQuery`, `buildCacheKey` |

```js
import { createSafeSearchClient } from '@internal/github-sdk-search/client';
import { SEARCH_ENDPOINTS, endpointPath } from '@internal/github-sdk-search/endpoints';
import { normalizeQuery, buildCacheKey, APIError } from '@internal/github-sdk-search/utils';
```

---

## Authentication

- **Token option:** Pass `token: string` (or `tokens: string[]` — the first element is used) to any client constructor / `createSafeSearchClient`. When set, the SDK sends `Authorization: Bearer <token>`.
- **Env var:** `GITHUB_TOKEN`. **Only the CLI reads it** (`src/cli.ts`: `process.env['GITHUB_TOKEN']`). The SDK library code does **not** read any environment variable — the SDK takes the token only from constructor options. (The CLI also calls `dotenv.config()`, so a `.env` file with `GITHUB_TOKEN` is loaded for the CLI.)
- **No-token behavior:** The SDK works without a token — it simply omits the `Authorization` header and issues unauthenticated requests (subject to GitHub's much lower unauthenticated rate limit). The **CLI**, by contrast, throws `AuthError` if no token is found via `--token`, global `--token`, or `GITHUB_TOKEN`.
- **Base URL:** Defaults to `https://api.github.com`. Override with the `baseURL` option. Stored internally (not a public field). Requests target `<baseURL>/search/<type>`.
- Default `User-Agent`: `GitHub-Search-SDK/1.0.0` (override via `userAgent`). Default request `timeout`: `30000` ms.

---

## Client Construction

**Factory:** `createSafeSearchClient(options?): SafeSearchClient`
**Constructor:** `new SafeSearchClient(options?)` — also `new BaseSearchClient(...)`, `new RateLimitedSearchClient(...)`, `new CachedSearchClient(...)`, `new BatchedSearchClient(...)`.

All option interfaces extend `BaseSearchClientOptions`; `SafeSearchClientOptions` (the production tier) accepts the full set below.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | `''` | PAT; sent as `Authorization: Bearer`. |
| `tokens` | `string[]` | — | Token pool; first element used as `token` if `token` unset. |
| `baseURL` | `string` | `https://api.github.com` | API base URL (internal field). |
| `timeout` | `number` (ms) | `30000` | Request timeout via `AbortController`. |
| `userAgent` | `string` | `GitHub-Search-SDK/1.0.0` | `User-Agent` header. |
| `requestsPerWindow` | `number` | `30` | Rate-limit tracking budget per window (rate-limited tier). |
| `windowMs` | `number` | `60000` | Sliding window size (rate-limited tier). |
| `adaptiveRateLimit` | `boolean` | (not specified in source) | Accepted by rate-limited tier options. |
| `rateLimitBuffer` | `number` | (not specified in source) | Accepted by rate-limited tier options. |
| `failureThreshold` | `number` | `5` | Recent-error count at which health reports `degraded` (safe tier). |
| `circuitBreakerEnabled` | `boolean` | (not specified in source) | Safe-tier option (declared; no enforcement logic in source). |
| `circuitTimeout` | `number` | (not specified in source) | Safe-tier option. |
| `degradationEnabled` | `boolean` | (not specified in source) | Safe-tier option. |
| `autoRecovery` | `boolean` | (not specified in source) | Safe-tier option. |
| `monitoringEnabled` | `boolean` | (not specified in source) | Safe-tier option. |
| `cacheEnabled` | `boolean` | (not specified in source) | Safe-tier option. |
| `cacheStrategy` | `'aggressive' \| 'moderate' \| 'conservative'` | (not specified in source) | Safe-tier option. |
| `cacheTTL` | `number` (ms) | `300000` (cached tier) | Cache TTL. |
| `maxCacheSize` | `number` | `1000` | LRU max entries (cached tier). |
| `normalizeQueries` | `boolean` | (not specified in source) | Cached-tier option. |
| `batchingEnabled` | `boolean` | (not specified in source) | Safe-tier option. |
| `maxBatchSize` | `number` | `10` | Batched tier. |
| `batchWindowMs` | `number` | `100` | Batched tier. |
| `deduplicateRequests` | `boolean` | `true` | Batched tier. |

**Tier hierarchy:** `BaseSearchClient` → `RateLimitedSearchClient` → `SafeSearchClient` (default export). `CachedSearchClient` and `BatchedSearchClient` extend `BaseSearchClient` directly (independent branches). All seven search methods are inherited from `BaseSearchClient`, so every client tier can perform every search.

---

## Capabilities

All seven search methods share the same shape:

- **Signature:** `searchXxx<T = unknown>(params?: SearchParams): Promise<SearchResult<T>>`
- **`params` (`SearchParams`)** — `[key: string]: unknown` so arbitrary extra query keys pass through:

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| **`q`** | `string` | Effectively required | **The search query string** (terms + type-specific qualifiers). Highlight in UI. |
| **`sort`** | `string` | optional | Sort field — valid values differ per type (see each section). |
| **`order`** | `string` | optional | `asc` or `desc`. |
| **`per_page`** | `number` | optional | Results per page (GitHub max 100; CLI default 30). |
| **`page`** | `number` | optional | Page number (CLI default 1). |
| `repository_id` | `string \| number` | labels only | Required for label search. |
| *(any)* | `unknown` | optional | Extra keys serialized into the query string. |

- **Return shape — `SearchResult<T>`:**
  ```ts
  { total_count: number; incomplete_results: boolean; items: T[]; [key: string]: unknown }
  ```
- **Endpoint pattern:** `GET /search/<type>` against `baseURL`. Query params are URL-encoded; `undefined`/`null` values are skipped.

> GitHub's documented `sort`/`order` enums per type are listed below. The SDK does **not** validate these values — it passes whatever string you supply. Values not listed are GitHub's defaults (best-match relevance) and are documented from the GitHub REST API, not enforced in this source.

### Repositories
- **Access:** `client.searchRepositories(params)` · convenience: `search.repositories(query, options)`
- **Endpoint:** `GET /search/repositories`
- **`sort`:** `stars` | `forks` | `help-wanted-issues` | `updated` (default: best match)
- **`order`:** `asc` | `desc`
- **Return:** `{ total_count, incomplete_results, items[] }` — repository objects (`full_name`, etc.)
```js
const r = await client.searchRepositories({ q: 'topic:cli language:typescript', sort: 'stars', order: 'desc', per_page: 20 });
console.log(r.total_count, r.items.length);
```

### Code
- **Access:** `client.searchCode(params)` · convenience: `search.code(query, options)`
- **Endpoint:** `GET /search/code`
- **`sort`:** `indexed` (default: best match)
- **`order`:** `asc` | `desc`
- **Return:** code-result objects (`path`, `name`, etc.). Note: GitHub requires authentication for code search.
```js
const r = await client.searchCode({ q: 'addClass in:file language:js repo:jquery/jquery' });
```

### Commits
- **Access:** `client.searchCommits(params)` · convenience: `search.commits(query, options)`
- **Endpoint:** `GET /search/commits`
- **`sort`:** `author-date` | `committer-date` (default: best match)
- **`order`:** `asc` | `desc`
- **Return:** commit-result objects.
```js
const r = await client.searchCommits({ q: 'repo:octocat/Spoon-Knife css', sort: 'committer-date' });
```

### Issues (and Pull Requests)
- **Access:** `client.searchIssues(params)` · convenience: `search.issues(query, options)`
- **Endpoint:** `GET /search/issues`
- **`sort`:** `comments` | `reactions` | `reactions-+1` | `reactions--1` | `reactions-smile` | `reactions-thinking_face` | `reactions-heart` | `reactions-tada` | `interactions` | `created` | `updated` (default: best match)
- **`order`:** `asc` | `desc`
- **Return:** issue/PR-result objects. Use `is:pr` / `is:issue` qualifiers in `q`.
```js
const r = await client.searchIssues({ q: 'repo:nodejs/node is:open is:pr label:bug', sort: 'created', order: 'desc' });
```

### Users
- **Access:** `client.searchUsers(params)` · convenience: `search.users(query, options)`
- **Endpoint:** `GET /search/users`
- **`sort`:** `followers` | `repositories` | `joined` (default: best match)
- **`order`:** `asc` | `desc`
- **Return:** user-result objects (`login`, etc.).
```js
const r = await client.searchUsers({ q: 'location:berlin language:go followers:>100', sort: 'followers' });
```

### Labels
- **Access:** `client.searchLabels(params)` · convenience: `search.labels(repositoryId, query, options)`
- **Endpoint:** `GET /search/labels`
- **Required:** `repository_id` (number/string) — the repo to search labels within. The convenience helper passes it as the first arg.
- **`sort`:** `created` | `updated` (default: best match)
- **`order`:** `asc` | `desc`
- **Return:** label-result objects.
```js
const r = await client.searchLabels({ repository_id: 1300192, q: 'bug', sort: 'created' });
// convenience: await search.labels(1300192, 'bug', { sort: 'created' });
```

### Topics
- **Access:** `client.searchTopics(params)` · convenience: `search.topics(query, options)`
- **Endpoint:** `GET /search/topics`
- **`sort`:** (not specified — GitHub topic search supports best-match only; no documented `sort`)
- **`order`:** `asc` | `desc` (passes through; topics use relevance order)
- **Return:** topic-result objects. Note: requires the `Accept: application/vnd.github.mercy-preview+json` header per GitHub docs; this SDK sends `application/vnd.github.v3+json`.
```js
const r = await client.searchTopics({ q: 'ruby' });
```

### Aggregating helpers (SafeSearchClient / BatchedSearchClient)

- **`SafeSearchClient.multiEndpointSearch<T>(query, endpoints: string[], options?)`** → `Record<endpoint, { success, data?, error? }>`. Runs one `q` across multiple search types in parallel; per-endpoint success/error capture.
- **`SafeSearchClient.getHealth()`** → `{ status: 'healthy'|'degraded'|'critical'; degradationLevel; recentErrors }`.
- **`RateLimitedSearchClient.getRateLimitStatus()`** → `{ requestsInWindow, requestsPerWindow, windowMs }`.
- **`CachedSearchClient.getCacheStats()`** → `{ size, hits, misses }`; **`clearCache()`**.
- **`BatchedSearchClient.batchSearch<T>(requests: BatchSearchRequest[])`** → `BatchSearchResult<T>[]`. Each `BatchSearchRequest` is `{ type: 'repositories'|'code'|..., ...SearchParams }`.
- **`client.close(): Promise<void>`** — release resources (no-op on base).

---

## Convenience Functions

`search` is a ready-to-use namespace backed by a lazily-created `SafeSearchClient` (no token; for authenticated use construct a client directly). Each method takes `(query, options?)`:

```js
import { search } from '@internal/github-sdk-search';

await search.repositories('react hooks', { sort: 'stars', per_page: 10 });
await search.code('TODO in:file');
await search.commits('fix repo:foo/bar');
await search.issues('is:open label:bug');
await search.users('location:tokyo');
await search.labels(1300192, 'enhancement');   // repositoryId, query, options
await search.topics('python');
```

Other helpers:
- `createSafeSearchClient(options?)` — factory for the production client.
- `endpointPath(endpoint)` → `/search/<endpoint>` (`./endpoints`).
- `SEARCH_ENDPOINTS` (the 7 names), `ENDPOINT_METHODS` (endpoint→method name) (`./endpoints`).
- `normalizeQuery(query)` — trim + collapse whitespace; `buildCacheKey(endpoint, params)` — stable cache key (`./utils`).

---

## Errors

Defined in `src/utils/errors.ts` (re-exported from `./utils` and `.`):

| Class | Extends | Fields | Thrown when |
|-------|---------|--------|-------------|
| `SearchError` | `Error` | `name='SearchError'` | Base class for all SDK errors. |
| `AuthError` | `SearchError` | `name='AuthError'` (default msg `'Authentication required'`) | **CLI** when no token is resolved from `--token`/`GITHUB_TOKEN`. |
| `APIError` | `SearchError` | `status: number`, `documentationUrl: string \| null` | Any non-2xx GitHub response. `message` = GitHub `message` or `Request failed with status <n>`. |
| `RateLimitError` | `APIError` | `retryAfter: number` (ms), `resetTime: number` (epoch ms), `resetAt: Date \| null`, `getTimeUntilReset(): number` (ms); `status=403` | Response is `403` with `x-ratelimit-remaining: 0`. Message includes ISO reset time. |

Detection logic lives in `BaseSearchClient.request()`: rate-limit check (403 + `x-ratelimit-remaining=0`) precedes the generic `!response.ok` `APIError`.

---

## CLI

- **Bin name:** `github-search` (→ `dist/esm/cli.js`).
- **Global options:** `-t, --token <token>`, `--json`, `--version`, `--help`.
- **Subcommands:** one per search type — `repositories`, `code`, `commits`, `issues`, `users`, `labels`, `topics`, each as `github-search <type> <query> [flags]`.
- **Per-command flags:** `-t, --token <token>`, `--sort <sort>`, `--order <order>` (`asc`/`desc`), `--per-page <n>` (default `30`), `--page <n>` (default `1`), `--json`.
- **Token passing:** resolution order = command `--token` → global `--token` → `process.env.GITHUB_TOKEN` (with `dotenv` loading `.env`). Missing token → `AuthError` printed and `exit(1)`.
- **Output:** default = a green `Found <total_count> results` line followed by `  - <name>` per item (name picked from `full_name`/`name`/`login`/`path`). With `--json` = `JSON.stringify(result, null, 2)`. Uses `ora` spinner while searching; errors print red and exit `1`.

```bash
github-search repositories "language:typescript stars:>1000" --sort stars --order desc --per-page 10
github-search issues "repo:nodejs/node is:open label:bug" --json --token ghp_xxx
GITHUB_TOKEN=ghp_xxx github-search code "TODO in:file"
```

> Note: label search via the CLI takes `<query>` only — there is no `--repository-id` flag, so labels search through the CLI omits the required `repository_id` (use the SDK for label search).

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
github-search --proxy http://proxy.example.test:8080 <command>
github-search --proxy-bypass 'ghe.internal,.corp.example' <command>
github-search --no-proxy <command>
```

| Flag | Meaning |
| --- | --- |
| `--proxy <url>` | Route requests through this HTTP proxy. Beats every proxy variable |
| `--no-proxy` | Connect direct, ignoring every proxy variable |
| `--proxy-bypass <list>` | Comma-separated hosts to reach directly, by curl's `NO_PROXY` rules. Beats `NO_PROXY` |

The flags are **global** — declared on the root program, so every subcommand honors them. Passing
`--proxy` and `--no-proxy` together is an error, reported before any request is issued.

With no flag, a proxy is resolved from the environment: `GITHUB_PROXY`, then
`https_proxy`/`HTTPS_PROXY` (or `http_proxy`/`HTTP_PROXY` for an `http:` API host). The bypass list
comes from `GITHUB_NO_PROXY`, then `no_proxy`, then `NO_PROXY`. Lowercase beats uppercase, as in
curl.

A malformed proxy value fails before any request, naming the flag or the exact variable. A password
in a proxy URL is sent to the proxy and appears nowhere else — every message shows
`http://*****:***@host:port`.

Full contract: [`@internal/github-sdk-fetch-rest-api`](../fetch-rest-api/README.md#proxying).

## UI Workbench Generation Guide

Goal: a small single-user web app to exercise every search capability against the live GitHub API.

**Token field (memory only):** A single password-type input at the top for the GitHub PAT. Hold it in memory only — never persist to localStorage/disk. Inject it as `Authorization: Bearer <token>` on each request (or as the SDK `token` option). A token is **optional** but strongly recommended: unauthenticated search hits GitHub's much lower rate limit, and **code search requires a token**.

**Left nav — one entry per search type** (`SEARCH_ENDPOINTS`):
Repositories · Code · Commits · Issues/PRs · Users · Labels · Topics.

**Auto-generated form per search type** (derive from the §5 param table):
- A prominent **`q`** multi-line text field (the query string; hint at type-specific qualifiers, e.g. `language:`, `repo:`, `is:pr`, `in:file`, `location:`).
- A **`sort`** `<select>` populated with that type's enum (below), plus a "best match (default)" empty option.
- An **`order`** `<select>`: `desc` | `asc`.
- **`per_page`** number input (1–100, default 30) and **`page`** number input (default 1).
- **Labels only:** add a required **`repository_id`** number input (numeric repo ID).

**Sort enums per type** (for the select widgets):
- Repositories: `stars`, `forks`, `help-wanted-issues`, `updated`
- Code: `indexed`
- Commits: `author-date`, `committer-date`
- Issues/PRs: `comments`, `reactions`, `reactions-+1`, `reactions--1`, `reactions-smile`, `reactions-thinking_face`, `reactions-heart`, `reactions-tada`, `interactions`, `created`, `updated`
- Users: `followers`, `repositories`, `joined`
- Labels: `created`, `updated`
- Topics: *(none — relevance only)*

**Widget mapping:** `string` → text input; `number` (`per_page`, `page`, `repository_id`) → number input; `boolean` → checkbox; enum (`sort`, `order`) → `<select>`.

**Submit behavior:** Build `GET https://api.github.com/search/<type>?q=...&sort=...&order=...&per_page=...&page=...` (or call the matching `client.searchXxx`/`search.<type>` method). Render:
- `total_count` (prominent) and `incomplete_results` flag.
- `items[]` as a list/table (pick a label from `full_name`/`name`/`login`/`path` and show the raw JSON per item, expandable).
- HTTP status code and **rate-limit headers** — surface `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` (Search API has its own **stricter** limit: ~30 req/min authenticated, ~10/min unauthenticated). A token raises the limit.
- §7 errors: map `APIError` (show `status` + `message` + `documentationUrl`) and `RateLimitError` (show `retryAfter` countdown + `resetTime`) and `AuthError` to friendly messages.

**Constraints:** All operations are read-only `GET /search/*`. Requests hit `https://api.github.com`. Single-user manual testing — no persistence beyond the in-memory token; show the per-request URL so the human can verify the exact query sent.
