# @internal/github-sdk-pulls — Interface

A TypeScript client + CLI for the **GitHub Pull Requests REST API**. Covers pull requests (list/get/create/update/close/reopen), merges, reviews, review comments, requested reviewers, commits, changed files, branch updates, and PR search. Domain: GitHub `/repos/{owner}/{repo}/pulls/*`, the merge sub-resource, and `/search/issues`.

> All response objects are loosely typed (documented subset fields + an index signature preserving every other key GitHub returns). "(not specified in source)" is noted where the source does not constrain a value.

## Install & Import

npm name: **`@internal/github-sdk-pulls`** (version `0.0.1`, `"type": "module"`).

ESM — default import (facade object) and named imports:

```js
import sdk from '@internal/github-sdk-pulls';
// sdk = { createClient, listPullRequests, getPullRequest, createPullRequest,
//         updatePullRequest, mergePullRequest, closePullRequest, reopenPullRequest }

import {
  createClient,
  PullRequestClient,
  RateLimitedPullRequestClient,
  getAuth,
  loadConfig,
  paginate,
  ApiError, AuthError, ValidationError, RateLimitError,
  listPullRequests, getPullRequest, createPullRequest,
  updatePullRequest, mergePullRequest, closePullRequest, reopenPullRequest,
  types,   // namespace: export * as types from './lib/types.js'
  utils    // namespace: export * as utils from './utils/format.js'
} from '@internal/github-sdk-pulls';
```

CJS:

```js
const sdk = require('@internal/github-sdk-pulls');
const { createClient, PullRequestClient } = require('@internal/github-sdk-pulls');
```

`exports` subpaths — only the root is exported:

| Subpath | types | import (ESM) | require (CJS) |
|---------|-------|--------------|----------------|
| `.` | `./dist/esm/index.d.ts` | `./dist/esm/index.js` | `./dist/cjs/index.js` |

(No deep subpaths such as `./client` or `./errors` are published.)

## Authentication

Token is supplied via the `auth` option to `createClient` / `new PullRequestClient(...)`. When `auth` is not passed explicitly, the token is resolved from the environment.

Environment variables (checked in priority order by `getAuth()`):
1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `GITHUB_PAT`
4. `GITHUB_PERSONAL_ACCESS_TOKEN`

Note: the bare `PullRequestClient` constructor only consults `process.env.GITHUB_TOKEN` directly when no `auth` key is present; the full priority chain above is applied by `getAuth()`, which `createClient` uses as its default.

Auth header sent: `Authorization: token <auth>` (only when a token is present).

No-token behavior: a warning is logged — `"No authentication token provided. API rate limits will be restrictive."` — and requests proceed unauthenticated (GitHub's low anonymous rate limit applies).

Base URL: defaults to `https://api.github.com`. Overridable via the `baseUrl` option, the `.gh-pr.json` config `baseUrl` field, or the `GITHUB_API_URL` env var (config precedence: global file < project file < env).

## Client Construction

Two ways to construct:

- **Factory:** `createClient(options?: CreateClientOptions): PullRequestClient` — merges loaded config, resolves auth via `getAuth()` when `auth` is absent, and (by default) returns a **`RateLimitedPullRequestClient`**. It returns a plain `PullRequestClient` only when `enableRateLimiting === false` **or** `process.env.NODE_ENV === 'test'`.
- **Direct:** `new PullRequestClient(options?)` or `new RateLimitedPullRequestClient(options?)`.

`createClient` options (`CreateClientOptions`):

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `auth` | `string \| null` | `getAuth()` result | Token. Pass `null` to force unauthenticated even if env is set; omit to auto-resolve from env. |
| `baseUrl` | `string` | `config.baseUrl` ?? `https://api.github.com` | API base URL. |
| `owner` | `string` | `config.owner` | Default repository owner. |
| `repo` | `string` | `config.repo` | Default repository name. |
| `enableRateLimiting` | `boolean` | `true` (unless `NODE_ENV==='test'`) | `false` → plain client (no limiter). |
| *(any other key)* | `unknown` | — | Index signature; passed through. |

`PullRequestClient` / `RateLimitedPullRequestClient` constructor options (`PullRequestClientOptions`):

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `auth` | `string \| null` | `process.env.GITHUB_TOKEN` | Token; warns if falsy. |
| `baseUrl` | `string` | `https://api.github.com` | API base URL. |
| `owner` | `string` | `undefined` | Default owner (used when a method's options omit `owner`). |
| `repo` | `string` | `undefined` | Default repo. |

`RateLimitedPullRequestClient` extends `PullRequestClient` and routes every `request()` through `new API_Rate_Limiter('core', {})` (from `@internal/npm-api-rate-limiter`).

Every method below accepts per-call `owner`/`repo` inside its options object; if omitted, the constructor's `owner`/`repo` are used. Missing both throws `ValidationError` (`"Repository owner is required"` / `"Repository name is required"`).

## Capabilities

All methods live on a `PullRequestClient` instance (e.g. `const client = createClient({ owner, repo })`).

### Pull Requests

#### `client.list(options?)`
List pull requests.
`list(options?: ListOptions): Promise<PullRequest[]>`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `options.state` | `string` | no | `'open'` | enum: `open`, `closed`, `all` |
| `options.sort` | `string` | no | `'created'` | enum: `created`, `updated`, `popularity`, `long-running` |
| `options.direction` | `string` | no | `'desc'` | enum: `asc`, `desc` |
| `options.base` | `string` | no | — | base branch filter (sent only if set) |
| `options.head` | `string` | no | — | head filter `user:ref` (sent only if set) |
| `options.per_page` | `number` | no | `30` | |
| `options.page` | `number` | no | `1` | |
| `options.owner` / `options.repo` | `string` | no | constructor value | |

Endpoint: `GET /repos/{owner}/{repo}/pulls`
Returns: array of `PullRequest`.

```js
const prs = await client.list({ state: 'all', sort: 'updated', per_page: 50 });
```

#### `client.listAll(options?)`
Async-generator that auto-paginates `list`.
`listAll(options?: ListOptions): AsyncGenerator<PullRequest>`
Same params as `list`; `per_page` defaults to `100`. Stops when a page returns fewer than `per_page` items.
Endpoint: `GET /repos/{owner}/{repo}/pulls` (repeated).

```js
for await (const pr of client.listAll({ state: 'open' })) console.log(pr.number);
```

#### `client.get(pullNumber, options?)`
Get a single pull request.
`get(pullNumber: number, options?: RepoTarget): Promise<PullRequest>`

| Param | Type | Required |
|-------|------|----------|
| `pullNumber` | `number` | yes |
| `options.owner` / `options.repo` | `string` | no |

Endpoint: `GET /repos/{owner}/{repo}/pulls/{pullNumber}`
Returns: `PullRequest`.

#### `client.create(data?)`
Create a pull request.
`create(data?: CreateData): Promise<PullRequest>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `data.title` | `string` | yes* | required unless `issue` is provided |
| `data.head` | `string` | yes* | source branch (`user:ref` allowed) |
| `data.base` | `string` | yes* | target branch |
| `data.body` | `string` | no | description |
| `data.draft` | `boolean` | no | create as draft |
| `data.issue` | `number` | no | create PR from an existing issue (then title/head/base not required) |
| `data.maintainer_can_modify` | `boolean` | no | |
| `data.owner` / `data.repo` | `string` | no | |

\* Validation: if `issue` is `undefined`, all of `title`, `head`, `base` must be truthy or `ValidationError("Title, head, and base are required to create a pull request")` is thrown.
Endpoint: `POST /repos/{owner}/{repo}/pulls`
Returns: `PullRequest`.

```js
await client.create({ title: 'Fix', head: 'feature', base: 'main', body: '...', draft: true });
```

#### `client.update(pullNumber, data?)`
Update a pull request.
`update(pullNumber: number, data?: UpdateData): Promise<PullRequest>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `pullNumber` | `number` | yes | |
| `data.title` | `string` | no | |
| `data.body` | `string` | no | |
| `data.base` | `string` | no | change base branch |
| `data.state` | `string` | no | enum: `open`, `closed` |
| `data.owner` / `data.repo` | `string` | no | |

Endpoint: `PATCH /repos/{owner}/{repo}/pulls/{pullNumber}`
Returns: `PullRequest`.

#### `client.updateBranch(pullNumber, options?)`
Update the PR branch with the latest base (`update-branch`).
`updateBranch(pullNumber: number, options?: { expected_head_sha?: string } & RepoTarget): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `pullNumber` | `number` | yes | |
| `options.expected_head_sha` | `string` | no | sent in body |
| `options.owner` / `options.repo` | `string` | no | |

Endpoint: `PUT /repos/{owner}/{repo}/pulls/{pullNumber}/update-branch`
Returns: GitHub job-acceptance payload (unknown shape; subset typically `{ message, url }`).

### Merge

#### `client.merge(pullNumber, options?)`
Merge a pull request.
`merge(pullNumber: number, options?: MergeOptions): Promise<MergeResult>`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `pullNumber` | `number` | yes | — | |
| `options.merge_method` | `string` | no | `'merge'` | enum: `merge`, `squash`, `rebase` |
| `options.commit_title` | `string` | no | — | sent only if set |
| `options.commit_message` | `string` | no | — | sent only if set |
| `options.sha` | `string` | no | — | require this SHA at HEAD; sent only if set |
| `options.owner` / `options.repo` | `string` | no | constructor | |

Endpoint: `PUT /repos/{owner}/{repo}/pulls/{pullNumber}/merge`
Returns: `MergeResult` `{ merged?: boolean, sha?: string, message?: string, ... }`.

```js
await client.merge(42, { merge_method: 'squash', commit_title: 'Squashed' });
```

#### `client.isMerged(pullNumber, options?)`
Check whether a PR is merged.
`isMerged(pullNumber: number, options?: RepoTarget): Promise<boolean>`
Endpoint: `GET /repos/{owner}/{repo}/pulls/{pullNumber}/merge` — returns `true` on 2xx, `false` on a 404 error, re-throws otherwise.

### Commits & Files

#### `client.listCommits(pullNumber, options?)`
`listCommits(pullNumber: number, options?: PageOptions): Promise<Commit[]>`

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `pullNumber` | `number` | yes | — |
| `options.per_page` | `number` | no | `30` |
| `options.page` | `number` | no | `1` |
| `options.owner` / `options.repo` | `string` | no | constructor |

Endpoint: `GET /repos/{owner}/{repo}/pulls/{pullNumber}/commits`
Returns: array of `Commit`.

#### `client.listFiles(pullNumber, options?)`
`listFiles(pullNumber: number, options?: PageOptions): Promise<PullRequestFile[]>`
Same params as `listCommits`.
Endpoint: `GET /repos/{owner}/{repo}/pulls/{pullNumber}/files`
Returns: array of `PullRequestFile` `{ filename, status?, additions?, deletions?, changes?, patch?, ... }`.

### Reviews

#### `client.listReviews(pullNumber, options?)`
`listReviews(pullNumber: number, options?: PageOptions): Promise<Review[]>`
Params: `per_page` (def 30), `page` (def 1), `owner`/`repo`.
Endpoint: `GET /repos/{owner}/{repo}/pulls/{pullNumber}/reviews`
Returns: array of `Review` `{ id?, user?, body?, state?, submitted_at?, ... }`. Review `state` values: `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`, `PENDING`.

#### `client.createReview(pullNumber, reviewData?)`
`createReview(pullNumber: number, reviewData?: Record<string, unknown>): Promise<Review>`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `pullNumber` | `number` | yes | |
| `reviewData.event` | `string` | no | enum: `APPROVE`, `REQUEST_CHANGES`, `COMMENT` (omit for a PENDING review) |
| `reviewData.body` | `string` | no | review summary text |
| `reviewData.commit_id` | `string` | no | SHA the review is against |
| `reviewData.comments` | `array` | no | inline comments `[{ path, line/position, body, side?, ... }]` |
| `reviewData.owner` / `reviewData.repo` | `string` | no | |

(`reviewData` is a free-form GitHub payload — fields above are the GitHub review-create body; the SDK forwards it verbatim.)
Endpoint: `POST /repos/{owner}/{repo}/pulls/{pullNumber}/reviews`
Returns: `Review`.

```js
await client.createReview(42, { event: 'APPROVE', body: 'LGTM' });
```

### Review Comments

#### `client.listReviewComments(pullNumber, options?)`
`listReviewComments(pullNumber: number, options?: ReviewCommentListOptions): Promise<ReviewComment[]>`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `pullNumber` | `number` | yes | — | |
| `options.sort` | `string` | no | `'created'` | enum: `created`, `updated` |
| `options.direction` | `string` | no | `'desc'` | enum: `asc`, `desc` |
| `options.since` | `string` | no | — | ISO-8601; sent only if set |
| `options.per_page` | `number` | no | `30` | |
| `options.page` | `number` | no | `1` | |
| `options.owner` / `options.repo` | `string` | no | constructor | |

Endpoint: `GET /repos/{owner}/{repo}/pulls/{pullNumber}/comments`
Returns: array of `ReviewComment` `{ id?, user?, body?, created_at?, path?, line?, commit_id?, ... }`.

#### `client.createReviewComment(pullNumber, commentData?)`
`createReviewComment(pullNumber: number, commentData?: Record<string, unknown>): Promise<ReviewComment>`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `pullNumber` | `number` | yes | |
| `commentData.body` | `string` | (GitHub-required) | comment text |
| `commentData.commit_id` | `string` | (GitHub-required) | SHA to comment on |
| `commentData.path` | `string` | (GitHub-required) | file path |
| `commentData.line` | `number` | no | line in the diff |
| `commentData.side` | `string` | no | enum: `LEFT`, `RIGHT` |
| `commentData.start_line` | `number` | no | multi-line range start |
| `commentData.start_side` | `string` | no | enum: `LEFT`, `RIGHT` |
| `commentData.position` | `number` | no | (legacy) diff position |
| `commentData.in_reply_to` | `number` | no | reply to an existing comment |
| `commentData.owner` / `commentData.repo` | `string` | no | |

(Free-form payload forwarded verbatim; required-ness above reflects GitHub, not SDK validation.)
Endpoint: `POST /repos/{owner}/{repo}/pulls/{pullNumber}/comments`
Returns: `ReviewComment`.

### Requested Reviewers

#### `client.requestReviewers(pullNumber, reviewerData?)`
`requestReviewers(pullNumber: number, reviewerData?: Record<string, unknown>): Promise<PullRequest>`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `pullNumber` | `number` | yes | |
| `reviewerData.reviewers` | `string[]` | no | usernames |
| `reviewerData.team_reviewers` | `string[]` | no | team slugs |
| `reviewerData.owner` / `reviewerData.repo` | `string` | no | |

Endpoint: `POST /repos/{owner}/{repo}/pulls/{pullNumber}/requested_reviewers`
Returns: `PullRequest`.

```js
await client.requestReviewers(42, { reviewers: ['octocat'], team_reviewers: ['core'] });
```

#### `client.removeRequestedReviewers(pullNumber, reviewerData?)`
`removeRequestedReviewers(pullNumber: number, reviewerData?: Record<string, unknown>): Promise<PullRequest>`
Same fields as `requestReviewers` (`reviewers`, `team_reviewers`).
Endpoint: `DELETE /repos/{owner}/{repo}/pulls/{pullNumber}/requested_reviewers` (body forwarded).
Returns: `PullRequest`.

### Search

#### `client.search(query, options?)`
Search PRs via the issues-search endpoint.
`search(query: string, options?: SearchOptions): Promise<SearchResult>`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `query` | `string` | yes | — | GitHub search `q` (e.g. `repo:o/r is:pr is:open`) |
| `options.sort` | `string` | no | `'created'` | enum: `created`, `updated`, `comments`, `reactions`, etc. |
| `options.order` | `string` | no | `'desc'` | enum: `asc`, `desc` |
| `options.per_page` | `number` | no | `30` | |
| `options.page` | `number` | no | `1` | |

Endpoint: `GET /search/issues`
Returns: `SearchResult` `{ total_count, incomplete_results, items: PullRequest[], ... }`.

#### `client.request(method, endpoint, body?)`
Low-level escape hatch used by all methods.
`request(method: string, endpoint: string, body?: unknown): Promise<unknown>`
`endpoint` may be a path (prefixed with `baseUrl`) or a full URL. Sends `Accept: application/vnd.github.v3+json`. Returns `null` on HTTP 204 / `content-length: 0`, otherwise parsed JSON. Non-2xx routes through `handleApiError`; network failures throw `ApiError("Network error: ...", 0, null)`.

#### `client.validateRepo(options?)` / `client.buildQuery(...)`
`validateRepo({ owner?, repo? })` resolves and validates the target (throws `ValidationError` on missing owner/repo). `buildQuery` is a private query-string builder.

## Convenience Functions

Module-level helpers that each construct a client internally via `createClient({ owner, repo })`:

| Function | Signature | Delegates to | Endpoint |
|----------|-----------|--------------|----------|
| `listPullRequests` | `(owner, repo, options?: ListOptions) => Promise<PullRequest[]>` | `client.list` | `GET …/pulls` |
| `getPullRequest` | `(owner, repo, pullNumber) => Promise<PullRequest>` | `client.get` | `GET …/pulls/{n}` |
| `createPullRequest` | `(owner, repo, data: CreateData) => Promise<PullRequest>` | `client.create` | `POST …/pulls` |
| `updatePullRequest` | `(owner, repo, pullNumber, data: UpdateData) => Promise<PullRequest>` | `client.update` | `PATCH …/pulls/{n}` |
| `mergePullRequest` | `(owner, repo, pullNumber, options?: MergeOptions) => Promise<MergeResult>` | `client.merge` | `PUT …/pulls/{n}/merge` |
| `closePullRequest` | `(owner, repo, pullNumber) => Promise<PullRequest>` | `client.update(n, { state: 'closed' })` | `PATCH …/pulls/{n}` |
| `reopenPullRequest` | `(owner, repo, pullNumber) => Promise<PullRequest>` | `client.update(n, { state: 'open' })` | `PATCH …/pulls/{n}` |

```js
import { listPullRequests, mergePullRequest } from '@internal/github-sdk-pulls';
const prs = await listPullRequests('octocat', 'hello', { state: 'open' });
await mergePullRequest('octocat', 'hello', 7, { merge_method: 'rebase' });
```

Other exported helpers:
- `getAuth(): string | undefined` — resolve token from env chain.
- `loadConfig(): Config` — merge global/project `.gh-pr.json` + env overrides.
- `paginate(fetcher, options?)` — generic page iterator (from `utils/pagination`). Companion (not re-exported at root but in source): `collectAllPages`, `createPaginatedFetcher`, `paginateWithCursor`, `parseLinkHeader`, `getPaginationInfo`, `calculateTotalPages`, `buildPaginationParams`.
- `utils` namespace — `formatOutput`, `formatPullRequest`, `formatState`, `formatReviewState`, `formatFileChanges`, `formatJson`, `formatDate`, `createPullRequestTable`, `truncate`, `formatUrl`.
- `types` namespace — all interfaces (`PullRequest`, `Review`, `ReviewComment`, `Commit`, `PullRequestFile`, `SearchResult`, `MergeResult`, `ListOptions`, `CreateData`, `UpdateData`, `MergeOptions`, etc.).

## Errors

All extend `ApiError extends Error`. Fields: `name`, `message`, `status: number`, `data: unknown`.

| Class | `status` | Extra fields | Thrown when |
|-------|----------|--------------|-------------|
| `ApiError` | `0` (or any unmapped HTTP status) | `status`, `data` | Network failure (`status 0`); any non-mapped non-2xx response. |
| `AuthError` | `401` | — | HTTP 401 (bad/missing token). |
| `PermissionError` | `403` | — | HTTP 403 that is **not** a rate limit. |
| `RateLimitError` | `403` | `resetTime: number \| null` (epoch ms); `resetAt: Date \| null`; method `getTimeUntilReset(): number` (ms) | HTTP 403 with `x-ratelimit-remaining: 0` (reads `x-ratelimit-reset`). |
| `NotFoundError` | `404` | — | HTTP 404. |
| `ConflictError` | `409` | — | HTTP 409 (e.g. merge conflict). |
| `ValidationError` | `422` | `errors: ValidationErrorEntry[]`; method `getErrorMessages(): string[]` | HTTP 422, and SDK-side input validation (missing owner/repo, or missing title/head/base on create). |

Only `ApiError`, `AuthError`, `ValidationError`, `RateLimitError` are exported from the package root. `NotFoundError`, `PermissionError`, `ConflictError` exist in `utils/errors` but are not re-exported.
Helpers: `handleApiError(response, errorData?)` (maps status → throws); `formatError(error): string` (human-readable, used by the CLI).

## CLI

Bin name: **`gh-pr`** (→ `dist/esm/cli.js`). Built on `commander`, with `chalk` (color), `ora` (spinner), `inquirer` (interactive/confirm prompts).

Global options: `-r, --repo <owner/repo>`, `-t, --token <token>`, `-o, --output <format>` (`json`|`table`|`text`, default `table`), `--no-color`, `--config`, `-V/--version`, `-h/--help`.

Token passing: `--token` flag wins, else `getAuth()` env chain; missing → warning, request proceeds unauthenticated. Repo resolved from `--repo owner/repo`, or config `owner`/`repo` / env (`GITHUB_OWNER`, `GITHUB_REPO`); missing repo → error + exit 1.

Commands:

| Command (aliases) | Args | Key options |
|-------------------|------|-------------|
| `list` (`ls`) | — | `-s/--state <open\|closed\|all>` (def open), `-b/--base`, `-h/--head`, `--sort <created\|updated\|popularity>` (def created), `--direction <asc\|desc>` (def desc), `-l/--limit <n>`, `--all` |
| `get` (`show`) | `<number>` | `--comments`, `--reviews`, `--commits`, `--files` |
| `create` (`new`) | — | `--title`, `--body`, `--head`, `--base`, `--draft`, `-i/--interactive` |
| `update` (`edit`) | `<number>` | `--title`, `--body`, `--base`, `--state <open\|closed>` |
| `merge` | `<number>` | `--method <merge\|squash\|rebase>` (def merge), `--title`, `--message`, `--confirm` (skip prompt) |
| `review` | `<number>` | `--approve`, `--request-changes`, `--comment <text>`, `-i/--interactive` → review event `APPROVE`/`REQUEST_CHANGES`/`COMMENT` |
| `comments` | `<number>` | `--add <comment>`, `--list` (default true) |
| `files` (`diff`) | `<number>` | `--names-only`, `--stats` |
| `search` | `<query>` | `--repo`, `--author`, `--assignee`, `--label`, `--sort <created\|updated\|comments>` (def created), `--order <asc\|desc>` (def desc), `-l/--limit <n>` |
| `config` | — | `--init`, `--global`, `--get <key>`, `--set <key=value>` |
| `interactive` (`i`) | — | menu-driven (list/get/create…) |

Output: `formatOutput(result, format, { colorize })`. `json` → pretty JSON; `table` → `cli-table3` for arrays (cols `# / Title / State / Author / Created`), JSON otherwise; `text` → human PR cards. With `-o json` the spinner is suppressed. Errors print `✗ <formatError(error)>` to stderr and `process.exit(1)`. `merge` confirms via an inquirer `confirm` prompt unless `--confirm`, and pre-checks the PR is open and `mergeable !== false`.

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
gh-pr --proxy http://proxy.example.test:8080 <command>
gh-pr --proxy-bypass 'ghe.internal,.corp.example' <command>
gh-pr --no-proxy <command>
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

### `gh-pr` honors the proxy

`gh-pr` used `node-fetch`, which honors no dispatcher and could not be proxied by anything this
repository configures. It now issues every request through
`@internal/github-sdk-fetch-rest-api`, so `--proxy`, `GITHUB_PROXY`, `HTTPS_PROXY` and `NO_PROXY`
all take effect — and `node-fetch` is gone from its dependencies.

The wire is unchanged: `Authorization: token <auth>`, the same `null`-on-204 rule, and the same
error classes.

## UI Workbench Generation Guide

Build a single-user manual testing workbench (no persistence) that exercises every SDK capability against the live GitHub API.

- **Token field:** one PAT input at the top, held in memory only (never persisted/logged). Pass it as the `auth` option to `createClient` (or `Authorization: token <PAT>` for direct REST). Also surface `owner` and `repo` as top-level inputs reused across forms.
- **Left nav grouped by sub-module:**
  - *Pull Requests* — `list`, `listAll`, `get`, `create`, `update`, `updateBranch`, plus convenience `closePullRequest`/`reopenPullRequest`
  - *Merge* — `merge`, `isMerged`
  - *Commits & Files* — `listCommits`, `listFiles`
  - *Reviews* — `listReviews`, `createReview`
  - *Review Comments* — `listReviewComments`, `createReviewComment`
  - *Requested Reviewers* — `requestReviewers`, `removeRequestedReviewers`
  - *Search* — `search`
- **Auto-form per capability** from the param tables above. Widget mapping:
  - `string` → text input
  - `number` (`pullNumber`, `per_page`, `page`, `line`, `issue`) → number input
  - `boolean` (`draft`, `maintainer_can_modify`, `all`) → checkbox
  - enum → select. Enum lists found in source:
    - PR `state` (list): `open`, `closed`, `all`
    - PR update `state`: `open`, `closed`
    - PR `sort` (list): `created`, `updated`, `popularity`
    - search `sort`: `created`, `updated`, `comments`
    - `direction` / `order`: `asc`, `desc`
    - review-comment `sort`: `created`, `updated`
    - `merge_method`: `merge`, `squash`, `rebase`
    - review `event`: `APPROVE`, `REQUEST_CHANGES`, `COMMENT`
    - review `state` (read): `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`, `PENDING`
    - comment `side` / `start_side`: `LEFT`, `RIGHT`
  - array (`reviewers`, `team_reviewers`, review `comments`) → repeatable input rows
  - object/free-form body (`createReview` `reviewData`, `createReviewComment` `commentData`, `requestReviewers`/`removeRequestedReviewers` `reviewerData`) → JSON editor
- **Submit** calls the SDK method (or REST endpoint) and renders: the JSON result, HTTP status, rate-limit headers (`x-ratelimit-remaining`, `x-ratelimit-reset`, `x-ratelimit-limit`), and any §Errors thrown (show `name`, `status`, `message`, `getErrorMessages()` for `ValidationError`, `getTimeUntilReset()` for `RateLimitError`).
- **Live calls** hit `https://api.github.com` (overridable base URL) with the real PAT.
- **Flag mutating verbs** — confirm before submit for: `create`/`createReview`/`createReviewComment`/`requestReviewers` (POST), `update` (PATCH), `merge`/`updateBranch` (PUT), `removeRequestedReviewers` (DELETE). Read verbs (`list`, `get`, `listAll`, `isMerged`, `listCommits`, `listFiles`, `listReviews`, `listReviewComments`, `search`) need no confirm.
