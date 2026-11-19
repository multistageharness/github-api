# @internal/github-sdk-gist — Interface

A TypeScript client and CLI for the **GitHub Gists API**. It wraps the GitHub
REST Gists endpoints (`/gists/**`) behind a small `fetch`-based HTTP client,
exposing strongly-typed domain endpoints for gists, comments, commits
(revisions), forks, and stars.

**Purpose:** manage GitHub gists programmatically — create/read/update/delete
gists and their files, list public/user/starred gists, comment, fork, star, and
inspect revision history.

**Domain:** GitHub Gists (gists, files map, comments, stars, forks, commits/revisions).

---

## Install & Import

**npm name:** `@internal/github-sdk-gist`

```bash
npm install @internal/github-sdk-gist
```

**ESM — default + named:**

```js
import GistAPI from '@internal/github-sdk-gist';            // default export (facade class)
import {
  GistAPI,            // named alias of the default class
  gistAPI,            // pre-configured singleton instance (no token unless env set)
  GistClient,
  GistsEndpoint,
  CommentsEndpoint,
  CommitsEndpoint,
  ForksEndpoint,
  StarsEndpoint,
  AuthManager,
  ConfigManager,
  Formatter,
  paginate,
  paginateAll,
  // error classes:
  GistAPIError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  handleAPIError,
} from '@internal/github-sdk-gist';

// type-only exports (Gist, GistFile, GistComment, GistCommit, ClientOptions, etc.):
import type {
  Gist, GistFile, GistUser, GistHistory, GistComment, GistCommit,
  CreateGistInput, UpdateGistInput, PaginationOptions, ClientOptions,
  MediaTypeOptions, GistCommitStats, OutputFormat, PageFetcher,
} from '@internal/github-sdk-gist';
```

**CJS — require:**

```js
const GistAPI = require('@internal/github-sdk-gist').default;
const { GistClient, GistsEndpoint } = require('@internal/github-sdk-gist');
```

**`exports` subpaths:** only the package root (`.`) is exported. There are no
deep subpath exports. (`types` → `./dist/esm/index.d.ts`, `import` →
`./dist/esm/index.js`, `require` → `./dist/cjs/index.js`.)

---

## Authentication

- **Token option:** pass `{ token: '<PAT>' }` to the `GistAPI`/`GistClient`
  constructor.
- **Env vars (exact):** if no `token` option is given, the token is loaded from
  the environment, preferring **`GITHUB_TOKEN`** then **`GH_TOKEN`**
  (`process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN']`). (Also,
  `process.env['DEBUG']` is checked in the CLI for verbose error output — not an
  auth var.)
- **Auth header:** when a token is present, requests send
  `Authorization: Bearer <token>`. Every request also sends
  `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`.
- **No-token behavior:** unauthenticated requests are allowed for read-only
  public endpoints (e.g. `gists.listPublic`, `gists.get`, `gists.listForUser`).
  Methods that call `client.auth.requireAuth()` throw an `AuthenticationError`
  when no token is configured. These are: `gists.listStarred`, `gists.create`,
  `gists.update`, `gists.delete`, `gists.fork`, all `comments.create/update/delete`,
  all `stars.check/add/remove/list`, `forks.create`, and `GistAPI.getUser()`.
- **Base URL:** defaults to `https://api.github.com`, overridable via the
  `baseURL` option.

---

## Client Construction

**Factory / facade:** `new GistAPI(options)` — the default export. It constructs
an internal `GistClient` and the five endpoint groups.

```js
import GistAPI from '@internal/github-sdk-gist';
const api = new GistAPI({ token: process.env.GITHUB_TOKEN });
```

**Low-level client:** `new GistClient(options)` — the raw HTTP client (used by
endpoints; exposes `request/get/post/patch/put/delete`). You normally use
`GistAPI`, not `GistClient` directly.

**Constructor options** (`ClientOptions`, all optional; same shape for `GistAPI`
and `GistClient`):

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | `GITHUB_TOKEN` / `GH_TOKEN` env, else `undefined` | GitHub personal access token. |
| `baseURL` | `string` | `https://api.github.com` | API base URL. |
| `timeout` | `number` | `30000` | Per-request timeout in ms (via `AbortSignal.timeout`). |
| `retryAttempts` | `number` | `3` | Max attempts; only network/transport failures are retried, not API (4xx) errors. |
| `retryDelay` | `number` | `1000` | Delay in ms between retry attempts. |

The facade also exposes the constructed `client` and the endpoint instances:
`api.client`, `api.gists`, `api.comments`, `api.commits`, `api.forks`, `api.stars`.

---

## Capabilities

The facade groups capabilities under five sub-modules. Each method returns the
parsed `data` (not the raw `RequestResult`). All `gistId` / `sha` / `commentId`
params are typed optional in source but throw `ValidationError` if omitted.

### The gist files map shape

GitHub represents gist files as a **map keyed by filename**:

- **On create** (`CreateGistInput.files`): `Record<string, { content: string }>`
  — every file MUST have non-empty `content`. Filenames starting with `gistfile`
  are rejected client-side (`ValidationError`).
- **On update** (`UpdateGistInput.files`):
  `Record<string, { content?: string; filename?: string } | null>` — set an
  entry to `null` to delete that file; set `filename` to rename it; set
  `content` to change its body.
- **On read** (`Gist.files`): `Record<string, GistFile>` where `GistFile` =
  `{ filename?, type?, language?, raw_url?, size?, truncated?, content?, encoding? }`.

```js
// create shape
files: { 'hello.js': { content: 'console.log("hi")' }, 'README.md': { content: '# Hi' } }
// update shape (rename + delete)
files: { 'old.js': { filename: 'new.js' }, 'drop.txt': null }
```

**`public`/secret flag:** `CreateGistInput.public` (boolean, default `false` in
both SDK create and CLI) — `true` makes the gist public, `false` (or omitted)
makes it **secret**.

**`MediaTypeOptions`** (for content-negotiating GETs): `{ raw?: boolean; base64?: boolean }`.
`raw` → `Accept: application/vnd.github.raw+json`; `base64` →
`Accept: application/vnd.github.base64+json`. `raw` wins if both set.

**`PaginationOptions`:** `{ per_page?: number; page?: number; since?: string }`
(sent as query params).

---

### gists — `api.gists` (`GistsEndpoint`)

#### `gists.list(options?)`
List the authenticated user's gists.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `PaginationOptions` | no | `per_page`, `page`, `since`. |
- **Endpoint:** `GET /gists`
- **Returns:** `Gist[]`
```js
const gists = await api.gists.list({ per_page: 30, page: 1 });
```

#### `gists.listPublic(options?)`
List all public gists.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/public`
- **Returns:** `Gist[]`
```js
const pub = await api.gists.listPublic({ per_page: 10 });
```

#### `gists.listStarred(options?)`  *(auth required)*
List the authenticated user's starred gists.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/starred`
- **Returns:** `Gist[]`

#### `gists.listForUser(username, options?)`
List gists for a specific user.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | `string` | yes (throws `ValidationError` if missing) | GitHub username. |
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /users/{username}/gists`
- **Returns:** `Gist[]`
```js
const theirs = await api.gists.listForUser('octocat');
```

#### `gists.get(gistId, options?)`
Get a single gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `options` | `MediaTypeOptions` | no | `raw` / `base64` content negotiation. |
- **Endpoint:** `GET /gists/{gistId}`
- **Returns:** `Gist`
```js
const g = await api.gists.get('aa5a315d61ae9438b18d', { raw: true });
```

#### `gists.getRevision(gistId, sha, options?)`
Get a specific revision (version) of a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `sha` | `string` | yes | Revision SHA. |
| `options` | `MediaTypeOptions` | no | `raw` / `base64`. |
- **Endpoint:** `GET /gists/{gistId}/{sha}`
- **Returns:** `Gist`

#### `gists.create(data)`  *(auth required)*
Create a new gist. Validates that ≥1 file exists, each file has `content`, and no
filename starts with `gistfile`.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | `CreateGistInput` | yes | `{ description?, public?, files }`. |
| `data.description` | `string` | no | Description text. |
| `data.public` | `boolean` | no (default `false`) | `true` = public, else secret. |
| `data.files` | `Record<string, { content: string }>` | yes | Files map (see files-map shape). |
- **Endpoint:** `POST /gists`
- **Returns:** `Gist`
```js
const created = await api.gists.create({
  description: 'My gist', public: true,
  files: { 'hello.js': { content: 'console.log(1)' } },
});
```

#### `gists.update(gistId, data?)`  *(auth required)*
Update a gist's description and/or files (rename/delete/edit via the update files map).
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `data` | `UpdateGistInput` | no (default `{}`) | `{ description?, files? }`. |
- **Endpoint:** `PATCH /gists/{gistId}`
- **Returns:** `Gist`

#### `gists.delete(gistId)`  *(auth required)*
Delete a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `DELETE /gists/{gistId}`
- **Returns:** `boolean` (`true` on success)

#### `gists.fork(gistId)`  *(auth required)*
Fork a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `POST /gists/{gistId}/forks`
- **Returns:** `Gist` (the new fork)

#### `gists.listForks(gistId, options?)`
List forks of a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/{gistId}/forks`
- **Returns:** `Gist[]`

#### `gists.iterate(options?)` *(async generator)*
Async-iterate the authenticated user's gists across all pages (auto-increments `page`).
- Backed by `GET /gists` per page. **Yields:** `Gist`.
```js
for await (const g of api.gists.iterate()) { /* ... */ }
```

#### `gists.iteratePublic(options?)` *(async generator)*
Async-iterate all public gists across all pages.
- Backed by `GET /gists/public`. **Yields:** `Gist`.

---

### comments — `api.comments` (`CommentsEndpoint`)

#### `comments.list(gistId, options?)`
List comments on a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/{gistId}/comments`
- **Returns:** `GistComment[]`

#### `comments.get(gistId, commentId, options?)`
Get a single comment.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `commentId` | `number` | yes | Comment ID. |
| `options` | `MediaTypeOptions` | no | `raw` / `base64`. |
- **Endpoint:** `GET /gists/{gistId}/comments/{commentId}`
- **Returns:** `GistComment`

#### `comments.create(gistId, data?)`  *(auth required)*
Add a comment.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `data` | `{ body: string }` | no (default `{ body: '' }`) | Comment body. |
- **Endpoint:** `POST /gists/{gistId}/comments`
- **Returns:** `GistComment`
```js
await api.comments.create('aa5a315d', { body: 'Nice gist!' });
```

#### `comments.update(gistId, commentId, data?)`  *(auth required)*
Edit a comment.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `commentId` | `number` | yes | Comment ID. |
| `data` | `{ body: string }` | no (default `{ body: '' }`) | New body. |
- **Endpoint:** `PATCH /gists/{gistId}/comments/{commentId}`
- **Returns:** `GistComment`

#### `comments.delete(gistId, commentId)`  *(auth required)*
Delete a comment.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `commentId` | `number` | yes | Comment ID. |
- **Endpoint:** `DELETE /gists/{gistId}/comments/{commentId}`
- **Returns:** `boolean` (`true`)

#### `comments.iterate(gistId, options?)` *(async generator)*
Async-iterate a gist's comments across all pages.
- Backed by `GET /gists/{gistId}/comments`. **Yields:** `GistComment`.

---

### commits — `api.commits` (`CommitsEndpoint`)

#### `commits.list(gistId, options?)`
List a gist's commits (revisions).
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/{gistId}/commits`
- **Returns:** `GistCommit[]`

#### `commits.get(gistId, sha)`
Get the gist as of a specific revision SHA.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `sha` | `string` | yes | Revision SHA. |
- **Endpoint:** `GET /gists/{gistId}/{sha}`
- **Returns:** `Gist`

#### `commits.iterate(gistId, options?)` *(async generator)*
Async-iterate a gist's commits across all pages.
- Backed by `GET /gists/{gistId}/commits`. **Yields:** `GistCommit`.

#### `commits.getStats(gistId)`
Aggregate change statistics across ALL of a gist's commits (iterates internally).
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `GET /gists/{gistId}/commits` (paged, all pages)
- **Returns:** `GistCommitStats` = `{ totalCommits, totalAdditions, totalDeletions, totalChanges, commits: GistCommit[] }`

---

### forks — `api.forks` (`ForksEndpoint`)

#### `forks.list(gistId, options?)`
List forks of a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/{gistId}/forks`
- **Returns:** `Gist[]`

#### `forks.create(gistId)`  *(auth required)*
Fork a gist (same endpoint as `gists.fork`).
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `POST /gists/{gistId}/forks`
- **Returns:** `Gist`

#### `forks.iterate(gistId, options?)` *(async generator)*
Async-iterate a gist's forks across all pages.
- Backed by `GET /gists/{gistId}/forks`. **Yields:** `Gist`.

---

### stars — `api.stars` (`StarsEndpoint`)

#### `stars.check(gistId)`  *(auth required)*
Check whether the authenticated user has starred a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `GET /gists/{gistId}/star`
- **Returns:** `boolean` (`true` if status 204; `false` if `NotFoundError`/404)

#### `stars.add(gistId)`  *(auth required)*
Star a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `PUT /gists/{gistId}/star` (empty `{}` body)
- **Returns:** `boolean` (`true`)

#### `stars.remove(gistId)`  *(auth required)*
Unstar a gist.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoint:** `DELETE /gists/{gistId}/star`
- **Returns:** `boolean` (`true`)

#### `stars.list(options?)`  *(auth required)*
List the authenticated user's starred gists.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `PaginationOptions` | no | Pagination. |
- **Endpoint:** `GET /gists/starred`
- **Returns:** `Gist[]`

#### `stars.toggle(gistId)`  *(auth required)*
Toggle star state: checks, then stars or unstars.
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gistId` | `string` | yes | Gist ID. |
- **Endpoints:** `GET /gists/{gistId}/star` then `PUT` or `DELETE /gists/{gistId}/star`
- **Returns:** `boolean` (new state: `true` = now starred, `false` = now unstarred)

---

### Facade-level helpers — `GistAPI` instance

#### `api.getRateLimit()`
- **Endpoint:** `GET /rate_limit`
- **Returns:** `unknown` (raw rate-limit object)

#### `api.getUser()`  *(auth required)*
- **Endpoint:** `GET /user`
- **Returns:** `unknown` (authenticated user object)

#### `api.withOptions(options)`
Returns a new `GistAPI` merging the current auth with new options. **Returns:** `GistAPI`.

---

## Convenience Functions

- **`paginate(fetchPage, options?)`** → `AsyncIterableIterator<T>`. Generic
  page-walker: calls `fetchPage({...options, per_page, page})` (default
  `per_page` 30, `page` 1), yields each item, stops when a page is empty or
  shorter than `per_page`.
- **`paginateAll(fetchPage, options?)`** → `Promise<T[]>`. Same, collecting all
  items into an array.
- **`AuthManager`** — `new AuthManager({ token?, baseURL? })`; methods
  `loadToken()`, `getHeaders(extra?)`, `isAuthenticated()`, `requireAuth()`.
- **`ConfigManager`** / **`config`** — persists CLI config to
  `~/.config/gist/config.json`; methods `load()`, `save(obj)`, `get(key)`,
  `set(key, value)`, `delete(key)`, `clear()`.
- **`Formatter`** — `new Formatter(format)` where `format` ∈
  `'json' | 'yaml' | 'table'`; methods `format_data(data)`, `toTable(data)`,
  `print(data)`. Table mode renders arrays of flat objects, else falls back to JSON.

```js
import { paginateAll } from '@internal/github-sdk-gist';
const all = await paginateAll((opts) => api.gists.list(opts), { per_page: 50 });
```

---

## Errors

All extend `GistAPIError` (which extends `Error`). Base fields: `message`,
`name`, `statusCode: number`, `response: unknown`.

| Class | `name` | `statusCode` | Extra fields | Thrown when |
|-------|--------|--------------|--------------|-------------|
| `GistAPIError` | `GistAPIError` | `500` (or actual status) | `response` | Base / any unmapped HTTP error status. |
| `AuthenticationError` | `AuthenticationError` | `401` | — | No token configured (`requireAuth`), or HTTP 401. |
| `RateLimitError` | `RateLimitError` | `429` | `resetTime: number` (epoch ms, `0` = unknown), `resetAt: Date \| null`, `limit: number`, `remaining: number`; `getTimeUntilReset(): number` (ms) | HTTP 403 with `x-ratelimit-remaining: 0`. Message includes ISO reset date. |
| `ValidationError` | `ValidationError` | `422` | `errors: unknown[]` | Client-side input validation (missing id/files/etc.) or HTTP 422. |
| `NotFoundError` | `NotFoundError` | `404` | — | HTTP 404 (used by `stars.check` to return `false`). |
| `ForbiddenError` | `ForbiddenError` | `403` | — | HTTP 403 that is NOT a rate-limit. |

`handleAPIError(response, responseBody)` is the dispatcher (status → class). It
reads rate-limit headers (`x-ratelimit-remaining`, `x-ratelimit-reset`,
`x-ratelimit-limit`) on 403. Retries in the client apply only to
network/transport failures — these API error classes are never retried.

---

## CLI

**Bin name:** `gist` (→ `dist/esm/cli.js`).

**Global options** (apply before any subcommand):

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --token <token>` | GitHub PAT (else `GITHUB_TOKEN`/`GH_TOKEN` env). | — |
| `-f, --format <format>` | Output format: `json`, `yaml`, `table`. | `json` |
| `--no-color` | Disable colored output. | color on |
| `-V, --version` | Print version. | — |

**Token passing:** `--token`, or `GITHUB_TOKEN`/`GH_TOKEN` env, or
`gist config set token <pat>` (note: the config-stored token is persisted but
the entrypoint only wires `--token`/env into the client).

**Output:** results printed via the `Formatter` in the chosen `--format`;
spinners (`ora`) show progress; errors print red messages. Auth/rate-limit/
validation errors get tailored messages (see `cli.ts` error handler). Exit code
`1` on failure; `DEBUG` env prints full error.

**Commands:**

| Command (aliases) | Args | Options | Action / SDK call |
|-------------------|------|---------|-------------------|
| `config` | `[action] [key] [value]` | — | `get`/`set`/`delete`/`list`/`clear` on `ConfigManager` (`~/.config/gist/config.json`). |
| `list` (`ls`) | — | `--public`, `--starred`, `--user <username>`, `--per-page <n>` (def 30), `--page <n>` (def 1) | `gists.listStarred` / `listPublic` / `listForUser` / `list`. |
| `create` | — | `-d, --description <d>`, `--public`, `-f, --file <path...>` | reads each file from disk, `gists.create` (POST). |
| `get` | `<gistId>` | `--raw`, `--base64` | `gists.get`. |
| `update` | `<gistId>` | `-d, --description <d>`, `-f, --file <path...>` | `gists.update` (PATCH). |
| `delete` (`rm`) | `<gistId>` | `--force` | inquirer confirm unless `--force`, then `gists.delete` (DELETE). |
| `star` | `<gistId>` | `--remove`, `--check` | `stars.check` / `stars.remove` (DELETE) / `stars.add` (PUT). |
| `fork` | `<gistId>` | — | `forks.create` (POST). |
| `comment` | `<gistId>` | `--list`, `-b, --body <body>`, `--delete <commentId>` | `comments.delete` (DELETE) / `comments.create` (POST) / `comments.list`. |
| `commits` | `<gistId>` | `--stats` | `commits.getStats` or `commits.list`. |

The `create`/`update` CLI files are sourced from local file paths and the gist
filename is the file's `basename`.

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
gist --proxy http://proxy.example.test:8080 <command>
gist --proxy-bypass 'ghe.internal,.corp.example' <command>
gist --no-proxy <command>
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

Build a single-user, no-persistence web workbench that exercises every SDK
capability above against the live GitHub API.

- **Token field (top, memory only):** a single PAT input at the top of the app,
  held in memory only (never persisted to localStorage/disk). Send it as
  `Authorization: Bearer <pat>` (or pass to the SDK `{ token }`). Show an
  "authenticated / anonymous" indicator.
- **Left nav grouped by sub-module:** sections **gists**, **comments**,
  **commits**, **forks**, **stars**, plus **facade** (`getRateLimit`, `getUser`,
  `withOptions`). One nav entry per capability listed in §5.
- **Auto-form per capability** from each method's param table:
  - `string` → text input (e.g. `gistId`, `sha`, `username`, `description`, `body`).
  - `number` → number input (e.g. `commentId`, `per_page`, `page`).
  - `boolean` → checkbox (e.g. `public`, `raw`, `base64`).
  - enum → select. Enums to list: output `format` ∈ `json|yaml|table`;
    `MediaTypeOptions` is two booleans `raw`/`base64` (render as checkboxes or a
    3-way select none/raw/base64).
  - array → repeatable field group (e.g. CLI-style multi-file selection).
  - object / request body → JSON editor (e.g. `UpdateGistInput.files`,
    `PaginationOptions`).
  - **The gist files map** → a dedicated repeatable **filename + content** editor
    (one row per file: filename text + content textarea). For create, content is
    required. For update, allow per-row "rename to" (filename) and a "delete this
    file" toggle that sends `null` for that key.
- **Submit:** call the SDK method (or equivalent REST call) with the form
  values; render the returned JSON, the HTTP status, the rate-limit response
  headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`),
  and on failure map to the §7 error classes (show `name`, `statusCode`,
  `message`, and `resetTime` for `RateLimitError`).
- **Live endpoint:** all calls hit `https://api.github.com` with the real PAT
  from the token field. Base URL should be overridable (maps to `baseURL`).
- **Mutating verbs:** flag and require an explicit confirm dialog for every
  mutating capability (POST/PATCH/PUT/DELETE): `gists.create`, `gists.update`,
  `gists.delete`, `gists.fork`, `forks.create`, `comments.create`,
  `comments.update`, `comments.delete`, `stars.add`, `stars.remove`,
  `stars.toggle`. Read capabilities (`list*`, `get*`, `check`, `iterate*`,
  `getStats`, `getRateLimit`, `getUser`) need no confirm.
- **Scope:** single-user manual testing only; no persistence beyond the
  in-memory token and current form state.
