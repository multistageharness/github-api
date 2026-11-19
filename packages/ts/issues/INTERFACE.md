# @internal/github-sdk-issues — Interface

**Purpose:** A TypeScript SDK + CLI for the GitHub Issues REST API. It wraps the issues, comments, labels, milestones, assignees, and issue-event endpoints behind a single `IssuesClient` class, plus a set of free-function convenience helpers and a `gh-issues` command-line tool.

**Domain:** GitHub Issues — issues (list/get/create/update/lock/unlock), issue comments, labels (on issue + repo), milestones, assignees, issue events & timeline, and issue search.

> Faithfulness note: All SDK methods live as flat methods on a single `IssuesClient` class (there are no nested sub-module objects like `client.comments.x` in the source). The "sub-modules" used in §5 below are a documentation grouping only; the real access path is always `client.<method>(...)`.

---

## Install & Import

**npm name:** `@internal/github-sdk-issues` (version `0.0.1`)

**ESM — default import:**
```js
import githubIssues from '@internal/github-sdk-issues';
const client = githubIssues.createClient({ owner: 'octocat', repo: 'hello-world' });
```

**ESM — named imports:**
```js
import {
  createClient,
  IssuesClient,
  RateLimitedIssuesClient,
  getAuth,
  loadConfig, saveConfig, initConfig, resolveRepository,
  paginate, collectAllPages,
  // convenience helpers
  listIssues, getIssue, createIssue, updateIssue, closeIssue, reopenIssue,
  addComment, updateComment, deleteComment,
  addLabels, removeLabel, addAssignees, removeAssignees,
  lockIssue, unlockIssue,
  // error classes (re-exported via `export * from './utils/errors.js'`)
  ApiError, AuthError, ValidationError, RateLimitError,
  NotFoundError, PermissionError, ConflictError, NetworkError,
  // formatting helpers namespace
  format,
} from '@internal/github-sdk-issues';
```

**CJS — require:**
```js
const githubIssues = require('@internal/github-sdk-issues');
const { createClient, IssuesClient } = require('@internal/github-sdk-issues');
```

**`exports` subpaths (from package.json):**
- `.` only — the package exposes a single entry point. (`types` → `./dist/esm/index.d.ts`, `import` → `./dist/esm/index.js`, `require` → `./dist/cjs/index.js`.) There are no deep subpath exports.

---

## Authentication

**Token option:** Pass `auth` (a GitHub token string) in the client options: `createClient({ auth: 'ghp_...' })` or `new IssuesClient({ auth })`.

**Env var resolution (`getAuth()`):** When no `auth` is given, `createClient` calls `getAuth()`, which checks these env vars **in order** and returns the first non-empty value:
1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `GITHUB_ACCESS_TOKEN`
4. `GITHUB_PAT`

**No-token behavior:** If none of the above is set, `getAuth()` throws `AuthError` with the message: `Authentication required. Provide a token via the --token option or set the GITHUB_TOKEN environment variable`.

**Auth header format:** `Authorization: token <token>` (built by `getAuthHeader`). The client also always sends `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and `User-Agent: @internal/github-sdk-issues`.

**Base URL:** Default `https://api.github.com`. Override via the `baseUrl` option.

---

## Client Construction

**Factory:** `createClient(options?: CreateClientOptions): IssuesClient`
- Resolves `auth` from `options.auth` or `getAuth()`.
- Returns a `RateLimitedIssuesClient` **by default**, unless `options.enableRateLimiting === false` **or** `process.env.NODE_ENV === 'test'`, in which case it returns a plain `IssuesClient`.

**Direct construction:** `new IssuesClient(options?)` or `new RateLimitedIssuesClient(options?)`. (Note: direct construction does NOT auto-resolve a token from env — you must pass `auth` yourself; only `createClient` calls `getAuth()`.)

### Options table

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `auth` | `string` | (from `getAuth()` in `createClient`; `undefined` if constructing directly) | GitHub token; sent as `Authorization: token <auth>`. |
| `baseUrl` | `string` | `https://api.github.com` | API base URL. |
| `owner` | `string` | `undefined` | Repository owner; required for repo-scoped methods. |
| `repo` | `string` | `undefined` | Repository name; required for repo-scoped methods. |
| `enableRateLimiting` | `boolean` | `true` (effectively) | `createClient` only. If not `false` (and not test env), returns the rate-limited client. |
| `rateLimitPadding` | `number` | `100` (ms) | `RateLimitedIssuesClient` only. Minimum spacing between requests. |
| `[key: string]: unknown` | — | — | Options bag is permissive; extra keys are retained on `client.options`. |

---

## Capabilities

All methods are async and return `Promise<unknown>` (GitHub JSON, dynamically shaped). Repo-scoped methods throw `ValidationError('Repository owner and name are required')` if `owner`/`repo` are unset. The low-level `request(endpoint, options)` is also public.

Pagination: many list calls accept a free-form query options object. If you pass `includePagination: true` in the options, the result is `{ data, links }` (a `ClientPage`) instead of the raw array; otherwise the raw JSON is returned. Common query keys observed in source: `state`, `sort`, `direction`, `labels`, `assignee`, `creator`, `milestone`, `since`, `page`, `per_page`.

**Enum values found in source:**
- Issue `state` (list filter): `open` | `closed` | `all` (CLI default `open`)
- Issue `state` (update): `open` | `closed`
- `state_reason` (close/reopen): `completed` | `not_planned` | `duplicate` | `reopened`
- `sort` (list): `created` | `updated` | `comments` (CLI default `created`)
- `direction`: `asc` | `desc` (CLI default `desc`)
- `lock_reason`: `off-topic` | `too heated` | `resolved` | `spam`
- Milestone `state`: `open` | `closed` (CLI default `open`)
- Search `sort`: `comments` | `reactions` | `interactions` | `created` | `updated`; `order`: `asc` | `desc`

---

### Issues sub-module

#### `client.list(options?)`
- Signature: `list(options?: Record<string, unknown>): Promise<unknown>`
- Lists issues assigned to the authenticated user.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `options` | object | no | query filters + optional `includePagination` |

- Endpoint: `GET /issues`
- Returns: array of issue objects (or `{ data, links }` if `includePagination`).
```js
const issues = await client.list({ state: 'open', per_page: 30 });
```

#### `client.listForOrg(org, options?)`
- Signature: `listForOrg(org: string, options?: Record<string, unknown>): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `org` | string | yes | organization login |
| `options` | object | no | query filters + optional `includePagination` |

- Endpoint: `GET /orgs/{org}/issues`
- Returns: array of issue objects.
```js
const issues = await client.listForOrg('github', { state: 'all' });
```

#### `client.listForRepo(options?)`
- Signature: `listForRepo(options?: Record<string, unknown>): Promise<unknown>`
- Uses configured `owner`/`repo`.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `options` | object | no | query filters + optional `includePagination` |

- Endpoint: `GET /repos/{owner}/{repo}/issues`
- Returns: array of issue objects.
```js
const issues = await client.listForRepo({ labels: 'bug', sort: 'updated' });
```

#### `client.get(issueNumber)`
- Signature: `get(issueNumber: number): Promise<unknown>`

| Param | Type | Required |
|-------|------|----------|
| `issueNumber` | number | yes |

- Endpoint: `GET /repos/{owner}/{repo}/issues/{issueNumber}`
- Returns: a single issue object.
```js
const issue = await client.get(42);
```

#### `client.create(data)`
- Signature: `create(data: unknown): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `data` | object (issue body) | yes | e.g. `{ title, body, labels[], assignees[], milestone }` |

- Endpoint: `POST /repos/{owner}/{repo}/issues`
- Returns: the created issue object.
```js
const issue = await client.create({ title: 'Bug', body: 'Steps...', labels: ['bug'] });
```

#### `client.update(issueNumber, data)`
- Signature: `update(issueNumber: number, data: unknown): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `issueNumber` | number | yes | |
| `data` | object | yes | e.g. `{ title, body, state, state_reason, labels[], milestone }` |

- Endpoint: `PATCH /repos/{owner}/{repo}/issues/{issueNumber}`
- Returns: the updated issue object. (Close/reopen are done by passing `state` + `state_reason`.)
```js
await client.update(42, { state: 'closed', state_reason: 'completed' });
```

#### `client.lock(issueNumber, lockReason?)`
- Signature: `lock(issueNumber: number, lockReason?: string | null): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `issueNumber` | number | yes | |
| `lockReason` | string \| null | no (default `null`) | enum: `off-topic`, `too heated`, `resolved`, `spam`; sent as `{ lock_reason }` only if provided |

- Endpoint: `PUT /repos/{owner}/{repo}/issues/{issueNumber}/lock`
- Returns: typically empty (204).
```js
await client.lock(42, 'resolved');
```

#### `client.unlock(issueNumber)`
- Signature: `unlock(issueNumber: number): Promise<unknown>`
- Endpoint: `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/lock`
- Returns: typically empty (204).
```js
await client.unlock(42);
```

#### `client.listEvents(issueNumber)`
- Signature: `listEvents(issueNumber: number): Promise<unknown>`
- Endpoint: `GET /repos/{owner}/{repo}/issues/{issueNumber}/events`
- Returns: array of event objects.

#### `client.listTimelineEvents(issueNumber)`
- Signature: `listTimelineEvents(issueNumber: number): Promise<unknown>`
- Endpoint: `GET /repos/{owner}/{repo}/issues/{issueNumber}/timeline`
- Returns: array of timeline-event objects.

---

### Comments sub-module

#### `client.listComments(issueNumber, options?)`
- Signature: `listComments(issueNumber: number, options?: Record<string, unknown>): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `issueNumber` | number | yes | |
| `options` | object | no | query, e.g. `{ since }` |

- Endpoint: `GET /repos/{owner}/{repo}/issues/{issueNumber}/comments`
- Returns: array of comment objects.
```js
const comments = await client.listComments(42, { since: '2024-01-01T00:00:00Z' });
```

#### `client.getComment(commentId)`
- Signature: `getComment(commentId: number): Promise<unknown>`
- Endpoint: `GET /repos/{owner}/{repo}/issues/comments/{commentId}`
- Returns: a single comment object.

#### `client.createComment(issueNumber, body)`
- Signature: `createComment(issueNumber: number, body: string): Promise<unknown>`

| Param | Type | Required |
|-------|------|----------|
| `issueNumber` | number | yes |
| `body` | string | yes |

- Endpoint: `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` (body `{ body }`)
- Returns: the created comment object.
```js
await client.createComment(42, 'Thanks for the report!');
```

#### `client.updateComment(commentId, body)`
- Signature: `updateComment(commentId: number, body: string): Promise<unknown>`
- Endpoint: `PATCH /repos/{owner}/{repo}/issues/comments/{commentId}` (body `{ body }`)
- Returns: the updated comment object.

#### `client.deleteComment(commentId)`
- Signature: `deleteComment(commentId: number): Promise<unknown>`
- Endpoint: `DELETE /repos/{owner}/{repo}/issues/comments/{commentId}`
- Returns: typically empty (204).

---

### Labels sub-module

#### `client.listLabelsOnIssue(issueNumber)`
- Signature: `listLabelsOnIssue(issueNumber: number): Promise<unknown>`
- Endpoint: `GET /repos/{owner}/{repo}/issues/{issueNumber}/labels`
- Returns: array of label objects.

#### `client.listLabelsForRepo()`
- Signature: `listLabelsForRepo(): Promise<unknown>`
- Endpoint: `GET /repos/{owner}/{repo}/labels`
- Returns: array of label objects.

#### `client.addLabels(issueNumber, labels)`
- Signature: `addLabels(issueNumber: number, labels: string[]): Promise<unknown>`

| Param | Type | Required |
|-------|------|----------|
| `issueNumber` | number | yes |
| `labels` | string[] | yes |

- Endpoint: `POST /repos/{owner}/{repo}/issues/{issueNumber}/labels` (body `{ labels }`)
- Returns: array of the issue's labels.
```js
await client.addLabels(42, ['bug', 'p1']);
```

#### `client.setLabels(issueNumber, labels)`
- Signature: `setLabels(issueNumber: number, labels: string[]): Promise<unknown>`
- Endpoint: `PUT /repos/{owner}/{repo}/issues/{issueNumber}/labels` (body `{ labels }`) — replaces all labels.
- Returns: array of the issue's labels.

#### `client.removeLabel(issueNumber, label)`
- Signature: `removeLabel(issueNumber: number, label: string): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `issueNumber` | number | yes | |
| `label` | string | yes | URL-encoded into the path |

- Endpoint: `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/labels/{label}`
- Returns: remaining labels.

---

### Assignees sub-module

#### `client.listAssignees()`
- Signature: `listAssignees(): Promise<unknown>`
- Endpoint: `GET /repos/{owner}/{repo}/assignees`
- Returns: array of users who can be assigned.

#### `client.addAssignees(issueNumber, assignees)`
- Signature: `addAssignees(issueNumber: number, assignees: string[]): Promise<unknown>`

| Param | Type | Required |
|-------|------|----------|
| `issueNumber` | number | yes |
| `assignees` | string[] (usernames) | yes |

- Endpoint: `POST /repos/{owner}/{repo}/issues/{issueNumber}/assignees` (body `{ assignees }`)
- Returns: the issue object (with `assignees`).
```js
await client.addAssignees(42, ['octocat']);
```

#### `client.removeAssignees(issueNumber, assignees)`
- Signature: `removeAssignees(issueNumber: number, assignees: string[]): Promise<unknown>`
- Endpoint: `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/assignees` (body `{ assignees }`)
- Returns: the issue object (with remaining `assignees`).

---

### Milestones sub-module

#### `client.listMilestones(options?)`
- Signature: `listMilestones(options?: Record<string, unknown>): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `options` | object | no | query, e.g. `{ state }` (`open`/`closed`/`all`) |

- Endpoint: `GET /repos/{owner}/{repo}/milestones`
- Returns: array of milestone objects.

#### `client.createMilestone(data)`
- Signature: `createMilestone(data: unknown): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `data` | object | yes | `{ title, description?, due_on?, state? }` |

- Endpoint: `POST /repos/{owner}/{repo}/milestones`
- Returns: the created milestone object.
```js
await client.createMilestone({ title: 'v1.0', due_on: '2026-09-01', state: 'open' });
```

#### `client.updateMilestone(milestoneNumber, data)`
- Signature: `updateMilestone(milestoneNumber: number, data: unknown): Promise<unknown>`
- Endpoint: `PATCH /repos/{owner}/{repo}/milestones/{milestoneNumber}`
- Returns: the updated milestone object.

#### `client.deleteMilestone(milestoneNumber)`
- Signature: `deleteMilestone(milestoneNumber: number): Promise<unknown>`
- Endpoint: `DELETE /repos/{owner}/{repo}/milestones/{milestoneNumber}`
- Returns: typically empty (204).

---

### Low-level sub-module

#### `client.request(endpoint, options?)`
- Signature: `request(endpoint: string, options?: ClientRequestOptions): Promise<unknown>`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `endpoint` | string | yes | path (e.g. `/repos/o/r/issues`) or absolute URL |
| `options.method` | string | no | default `GET` |
| `options.body` | unknown | no | JSON-serialized for POST/PUT/PATCH/DELETE |
| `options.query` | `Record<string,unknown>` | no | appended as query string (null/undefined skipped) |
| `options.includePagination` | boolean | no | when true returns `{ data, links }` |

- Endpoint: any (`METHOD {endpoint}`) — escape hatch for endpoints not wrapped above (e.g. `GET /search/issues`).
- Returns: parsed JSON, or `{ data, links }` if `includePagination`.

**Search note:** Issue search (`GET /search/issues?q=...&sort=...&order=...`) is NOT a client method — it is implemented only in the CLI `search` command via a direct `fetch`. To replicate in the SDK, use `client.request('/search/issues', { query: { q, sort, order } })` (full URL form) or a raw fetch.

---

## Convenience Functions

Top-level free functions exported from the package. Each creates a client internally (via `createClient`) and delegates to a method. `options` is `CreateClientOptions` (accepts `auth`, `baseUrl`, `owner`, `repo`, `enableRateLimiting`).

| Function | Signature | Delegates to |
|----------|-----------|--------------|
| `listIssues` | `(options?: ListIssuesOptions)` — `options` may carry `org`, `owner`, `repo` | `listForOrg` / `listForRepo` / `list` (chosen by which of `org` / `owner+repo` is present) |
| `getIssue` | `(owner, repo, issueNumber, options?)` | `get(issueNumber)` |
| `createIssue` | `(owner, repo, data, options?)` | `create(data)` |
| `updateIssue` | `(owner, repo, issueNumber, data, options?)` | `update(issueNumber, data)` |
| `closeIssue` | `(owner, repo, issueNumber, options?: {...,reason?})` | `update(n, { state:'closed', state_reason: reason||'completed' })` |
| `reopenIssue` | `(owner, repo, issueNumber, options?)` | `update(n, { state:'open' })` |
| `addComment` | `(owner, repo, issueNumber, body, options?)` | `createComment(n, body)` |
| `updateComment` | `(owner, repo, commentId, body, options?)` | `updateComment(commentId, body)` |
| `deleteComment` | `(owner, repo, commentId, options?)` | `deleteComment(commentId)` |
| `addLabels` | `(owner, repo, issueNumber, labels: string[], options?)` | `addLabels(n, labels)` |
| `removeLabel` | `(owner, repo, issueNumber, label: string, options?)` | `removeLabel(n, label)` |
| `addAssignees` | `(owner, repo, issueNumber, assignees: string[], options?)` | `addAssignees(n, assignees)` |
| `removeAssignees` | `(owner, repo, issueNumber, assignees: string[], options?)` | `removeAssignees(n, assignees)` |
| `lockIssue` | `(owner, repo, issueNumber, lockReason?: string\|null, options?)` | `lock(n, lockReason)` |
| `unlockIssue` | `(owner, repo, issueNumber, options?)` | `unlock(n)` |

```js
import { getIssue, closeIssue } from '@internal/github-sdk-issues';
const issue = await getIssue('octocat', 'hello-world', 42);
await closeIssue('octocat', 'hello-world', 42, { reason: 'not_planned' });
```

**Other helpers:**
- `getAuth(): string` — resolve token from env (throws `AuthError` if none).
- `loadConfig() / saveConfig(config) / initConfig() / resolveRepository(options)` — CLI config stored at `~/.github-issues/config.json` (`{ owner, repo, baseUrl }`). `resolveRepository` parses `options.repo` as `owner/repo`, else falls back to config; throws plain `Error('Repository not specified...')` if unresolved.
- `paginate(fetchFn, options?, maxPages?)` — async generator yielding individual items across pages (uses `links.next`; default `per_page` 100).
- `collectAllPages(fetchFn, options?, maxItems?)` — collects all items into an array (default `per_page` capped at 100, sliced to `maxItems`).
- `format` namespace — `import { format } from ...` then `format.formatIssue`, `format.formatOutput`, `format.formatComment`, `format.formatLabel`, `format.formatMilestone`, `format.formatError`, `format.formatSuccess`, `format.formatWarning`, `format.formatDate`, `format.formatIssueTable`, `format.getStateIcon`, `format.truncate`. `formatOutput(data, { output })` honors `output` of `json` | `table` | `text`. (Also exported but NOT on `IssuesClient`: `parseLinkHeader`, `extractPageNumber`, `createPaginatedResponse` from the pagination module.)

---

## Errors

All thrown errors extend `ApiError` (which extends `Error`). HTTP errors are mapped by status in `IssuesClient.toError`.

| Class | `name` | `statusCode` | Extra fields | Thrown when |
|-------|--------|--------------|--------------|-------------|
| `ApiError` | `ApiError` | given (default 0) | `details: unknown` | Base / any unmapped HTTP status. |
| `AuthError` | `AuthError` | 401 | — | HTTP 401, or `getAuth()` finds no token. |
| `PermissionError` | `PermissionError` | 403 | — | HTTP 403. |
| `NotFoundError` | `NotFoundError` | 404 | — | HTTP 404. Constructor takes a `resource` string → message `"<resource> not found"`. |
| `ConflictError` | `ConflictError` | 409 | — | HTTP 409. |
| `ValidationError` | `ValidationError` | 422 | `errors: unknown[]`, `details` | HTTP 422; also thrown locally when `owner`/`repo` missing on a repo-scoped call. |
| `RateLimitError` | `RateLimitError` | 429 | `resetTime: number\|null` (epoch ms), `resetDate?: Date`, `resetAt: Date\|null`, `minutesUntilReset?: number`; `getTimeUntilReset(): number` (ms) | HTTP 429; `resetTime` from `x-ratelimit-reset` header. |
| `NetworkError` | `NetworkError` | 0 | — | `fetch` itself throws (transport failure). |

Notes: the error message comes from the response body's `message` field when present, else `Request failed with status <n>`. `format.formatError` renders `ValidationError.errors` and `RateLimitError.minutesUntilReset` nicely.

---

## CLI

**Bin name:** `gh-issues` (→ `./dist/esm/cli.js`). Built with `commander`, `chalk`, `ora`, `inquirer`.

**Global options:**
- `-r, --repo <owner/repo>` — repository in `owner/repo` format.
- `-t, --token <token>` — GitHub token (falls back to `getAuth()` env vars).
- `-o, --output <format>` — `json` | `table` | `text` (default `text`).
- `--no-color` — disable colored output.
- `--config` — show configuration.

**Token passing:** `--token` flag, else env (`GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_ACCESS_TOKEN`/`GITHUB_PAT`). Repo resolved from `--repo` else `~/.github-issues/config.json`.

**Commands:**

| Command (aliases) | Args / key flags | Action |
|-------------------|------------------|--------|
| `list` (`ls`) | `-s/--state` (open/closed/all, def open), `-l/--labels`, `-a/--assignee`, `-c/--creator`, `-m/--milestone`, `--sort` (created/updated/comments), `--direction` (asc/desc), `--limit <n>`, `--all`, `--org <org>` | List issues (repo / org / authenticated user). |
| `get <number>` (`show`) | `--comments`, `--events`, `--timeline` | Get issue details, optionally with comments/events/timeline. |
| `create` (`new`) | `--title`, `--body`, `--labels`, `--assignees`, `--milestone`, `-i/--interactive` | Create an issue (interactive mode prompts via inquirer). |
| `update <number>` (`edit`) | `--title`, `--body`, `--state` (open/closed), `--labels`, `--milestone` | Update an issue. |
| `close <number>` | `--reason` (completed/not_planned/duplicate, def completed) | Close issue (PATCH state=closed). |
| `reopen <number>` | — | Reopen issue (PATCH state=open, state_reason=reopened). |
| `lock <number>` | `--reason` (off-topic/too heated/resolved/spam) | Lock issue. |
| `unlock <number>` | — | Unlock issue. |
| `comments <action>` (`comment`) | action: list/add/edit/delete; `-n/--number`, `-c/--comment <id>`, `-b/--body`, `--since` | Manage comments (add/edit prompt via inquirer editor; delete prompts confirm). |
| `labels <action>` (`label`) | action: list/add/remove/set; `-n/--number`, `-l/--labels`, `--name`, `--color`, `--description` | Manage labels. |
| `assignees <action>` (`assign`) | action: list/add/remove; `-n/--number`, `-a/--assignees` | Manage assignees. |
| `milestones <action>` (`milestone`) | action: list/create/update/delete; `-n/--number`, `--title`, `--description`, `--due <YYYY-MM-DD>`, `--state` | Manage milestones. |
| `search <query>` | `--in`, `--author`, `--mentions`, `--team`, `--sort`, `--order` (asc/desc), `--limit` | Search issues via `GET /search/issues` (direct fetch). Prepends `repo:owner/repo` if `--repo` set. |
| `init` | — | Write default config to `~/.github-issues/config.json`. |

**Output format:** Human text by default with chalk colors and spinners (ora); `-o json` → pretty JSON; `-o table` → ASCII table of issues. Errors are printed via `formatError` and the process exits with code 1. `--version` prints `1.0.0` (hardcoded in cli.ts).

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
gh-issues --proxy http://proxy.example.test:8080 <command>
gh-issues --proxy-bypass 'ghe.internal,.corp.example' <command>
gh-issues --no-proxy <command>
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

Build a small single-user web workbench that exercises every capability above against the live GitHub API.

**Top-of-page token field (memory only):**
- A single password-style text input for a GitHub PAT, held in memory only (no persistence, no localStorage). All requests use it as `Authorization: token <PAT>`.
- Optional fields: `baseUrl` (default `https://api.github.com`), and default `owner` / `repo` inputs reused by repo-scoped capabilities.

**Left nav, grouped by sub-module (§5):**
- Issues · Comments · Labels · Assignees · Milestones · Low-level/Search.
- Each nav item lists its capabilities (e.g. Issues → list, listForOrg, listForRepo, get, create, update, lock, unlock, listEvents, listTimelineEvents).

**Auto-generated form per capability** (driven by each capability's param table):
- Render one input per ordered param, then a collapsible "options" / body section.
- Widget mapping:
  - string → text input
  - number → number input
  - boolean → checkbox (e.g. `includePagination`)
  - enum → select with the exact values listed in §5:
    - issue list `state`: open / closed / all
    - update `state`: open / closed
    - `state_reason`: completed / not_planned / duplicate / reopened
    - `sort`: created / updated / comments
    - `direction`: asc / desc
    - `lock_reason`: off-topic / too heated / resolved / spam
    - milestone `state`: open / closed / all
    - search `sort`: comments / reactions / interactions / created / updated; `order`: asc / desc
  - array (e.g. `labels`, `assignees`) → repeatable text inputs (or comma-separated field → split)
  - object / request body (`create` data, `update` data, milestone data) → JSON editor textarea

**Submit behavior:**
- Each form's submit maps directly to the corresponding REST endpoint shown in §5 (e.g. Issues→create → `POST /repos/{owner}/{repo}/issues`). Build the URL from `baseUrl` + path, fill `{owner}`/`{repo}` from the form or the global defaults.
- Send headers: `Authorization: token <PAT>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- Render the response as: pretty JSON body, HTTP status, and the rate-limit headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`).
- On error, surface the §7 error mapping (401→Auth, 403→Permission, 404→NotFound, 409→Conflict, 422→Validation with `errors[]`, 429→RateLimit with reset time, transport→Network).

**Mutating-verb guard:**
- Flag any capability whose endpoint is POST/PATCH/PUT/DELETE with a confirm dialog before submitting. Mutating capabilities: create, update, lock, unlock, createComment, updateComment, deleteComment, addLabels, setLabels, removeLabel, addAssignees, removeAssignees, createMilestone, updateMilestone, deleteMilestone (plus the close/reopen convenience flows, which are PATCH under the hood).

**Constraints:**
- Calls hit `https://api.github.com` (or the overridden `baseUrl`) with a real PAT.
- Single-user manual testing; no persistence, no multi-user state, no saved history.
