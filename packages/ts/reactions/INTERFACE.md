# @internal/github-sdk-reactions — Interface

**Purpose:** A TypeScript SDK + CLI for the **GitHub Reactions API**. It lets you list, create, and delete emoji reactions on the many GitHub entities that support them (issues, issue comments, commit comments, pull-request review comments, releases, team discussions, and team discussion comments).

**Domain:** GitHub REST API reactions. A "reaction" is an emoji (`+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes`) attached by a user to a subject. Reactions can be applied to multiple **subject types**; each subject type has its own REST endpoint triplet (list / create / delete). Releases support only a **subset** of the content enum (no `-1`, no `confused`).

---

## Install & Import

**npm name:** `@internal/github-sdk-reactions` (version `0.0.1`)

```bash
npm install @internal/github-sdk-reactions
```

**ESM — default import (factory) + named imports:**

```js
import createClient from '@internal/github-sdk-reactions';          // default export === createClient
import {
  createClient,
  ReactionsClient,
  Container,
  REACTION_CONTENT,
  RELEASE_REACTION_CONTENT,
  Types,
  loadConfig,
  createLogger,
  GitHubReactionsError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  ErrorHandler,
} from '@internal/github-sdk-reactions';
```

**CJS — require:**

```js
const createClient = require('@internal/github-sdk-reactions').default;
const { ReactionsClient, REACTION_CONTENT } = require('@internal/github-sdk-reactions');
```

**`exports` subpaths (from package.json):**

| Subpath | Resolves to | Contents |
|---|---|---|
| `.` | `dist/esm/index.js` / `dist/cjs/index.js` | Main barrel (everything above) |
| `./client` | `dist/esm/client/ReactionsClient.js` | `ReactionsClient` class + `HttpServiceLike`, `LoggerLike` interfaces |
| `./types` | `dist/esm/core/types.js` | All type defs + `REACTION_CONTENT`, `RELEASE_REACTION_CONTENT`, `Types` |

```js
import { ReactionsClient } from '@internal/github-sdk-reactions/client';
import { REACTION_CONTENT } from '@internal/github-sdk-reactions/types';
```

---

## Authentication

- **Token option:** pass `token` on the `Config` object to `createClient({ token })`, or via the CLI `--token` flag.
- **Env var (token):** `GITHUB_TOKEN` (read in `src/utils/config.ts`).
- **Other env vars** (all read in `loadConfig`):
  - `GITHUB_API_URL` — base URL (default `https://api.github.com`)
  - `GITHUB_TIMEOUT` — request timeout ms (default `30000`)
  - `GITHUB_RETRIES` — retry count (default `3`)
  - `GITHUB_PER_PAGE` — default page size (default `30`)
  - `LOG_LEVEL` — logger level (default `info`)
- **No-token behavior:** `createClient` calls `validateConfig`, which throws `ConfigurationError("GitHub token is required. Set GITHUB_TOKEN environment variable or provide in config file.")` if no token is resolved from option, env, or config file. **Auth is mandatory** to construct a client.
- **Auth header sent:** `Authorization: token <token>` (plus `Accept: application/vnd.github.v3+json`, `User-Agent: @github-api/reactions`).
- **Base URL:** `https://api.github.com` by default; overridable via `baseUrl` config or `GITHUB_API_URL`.
- **Config file (optional):** `loadConfig` also merges a JSON file from `--config` path or, if absent, the first found of `.github-reactions.json` (cwd), `~/.github-reactions.json`, `~/.config/github-reactions.json`.

---

## Client Construction

**Factory (recommended, async):**

```js
import createClient from '@internal/github-sdk-reactions';
const client = await createClient({ token: process.env.GITHUB_TOKEN });
```

`createClient(config?: Config): Promise<ReactionsClient>` — loads env/file config, merges the passed `config` over it, validates (throws if no token), builds a winston logger + `HttpService`, and returns a `ReactionsClient`.

**Direct construction (advanced / testing):**

```js
import { ReactionsClient } from '@internal/github-sdk-reactions/client';
const client = new ReactionsClient(httpService, logger);
```

`new ReactionsClient(httpService: HttpServiceLike, logger: LoggerLike)` — takes an injected HTTP service and logger. It does **not** read config or a token itself; the token lives in the `HttpService`. Use the factory for live API calls; use the constructor with a mock `HttpServiceLike` for tests.

**`Config` options table** (passed to `createClient` / `loadConfig`):

| Name | Type | Default | Description |
|---|---|---|---|
| `token` | `string` | `process.env.GITHUB_TOKEN` | GitHub PAT. Required (validated). |
| `baseUrl` | `string` | `https://api.github.com` (or `GITHUB_API_URL`) | API base URL. Must start with `http`. |
| `timeout` | `number` | `30000` (or `GITHUB_TIMEOUT`) | Per-request timeout ms. Validated to 1000–300000. |
| `retries` | `number` | `3` (or `GITHUB_RETRIES`) | Retry attempts on retryable failures. Validated 0–10. |
| `pagination` | `PaginationOptions` | `{ perPage: 30, page: 1, autoPage: false }` | Default pagination. `perPage` validated 1–100. |
| `pagination.perPage` | `number` | `30` (or `GITHUB_PER_PAGE`) | Results per page. |
| `pagination.page` | `number` | `1` | Starting page. |
| `pagination.autoPage` | `boolean` | `false` | Auto-fetch all pages. |
| `logging` | `LoggingOptions` | `{ level: 'info', console: true }` | Winston logger config. |
| `logging.level` | `'error'\|'warn'\|'info'\|'debug'\|'verbose'` | `info` (or `LOG_LEVEL`) | Log level. |
| `logging.console` | `boolean` | `true` | Log to console. |
| `logging.file` | `string` | (none) | Optional log file path. |

---

## Capabilities

All methods are on the `ReactionsClient` instance (`client.<method>`). Common shapes:

- **List** methods return `Promise<PaginatedResponse>` = `{ data: unknown[], pagination: PaginationInfo }`.
- **Create** methods return `Promise<unknown>` (the created `Reaction` object — `{ id, node_id, user, content, created_at }`).
- **Delete** methods return `Promise<void>` (204 No Content).

**Reaction `content` enum (the core domain value)** — `ReactionContent` (full set, for all subjects except release):

| Value | Emoji | Const (`REACTION_CONTENT.*`) |
|---|---|---|
| `+1` | 👍 | `PLUS_ONE` |
| `-1` | 👎 | `MINUS_ONE` |
| `laugh` | 😄 | `LAUGH` |
| `confused` | 😕 | `CONFUSED` |
| `heart` | ❤️ | `HEART` |
| `hooray` | 🎉 | `HOORAY` |
| `rocket` | 🚀 | `ROCKET` |
| `eyes` | 👀 | `EYES` |

**Release `content` subset** — `ReleaseReactionContent` (`RELEASE_REACTION_CONTENT.*`): `+1`, `laugh`, `heart`, `hooray`, `rocket`, `eyes` — **excludes `-1` and `confused`**. Creating/listing a release reaction with `-1` or `confused` throws `ValidationError`.

**Shared list `options`** (`ListReactionsOptions` / `ListReleaseReactionsOptions`):

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | `ReactionContent` (release: `ReleaseReactionContent`) | optional | Filter list by reaction type (sent as `?content=`). Validated against the enum. |
| `perPage` | `number` | optional | `?per_page=` (omitted when `30`). |
| `page` | `number` | optional | `?page=` (omitted when `1`). |
| `autoPage` | `boolean` | optional | Fetch all pages following `Link` `rel="next"`. |

**Create `options`** (`CreateReactionOptions` / `CreateReleaseReactionOptions`): `{ content }` — **required**, validated against the appropriate enum. Sent as JSON body `{ "content": "<value>" }`.

All methods validate required path params (`org`, `repo`, etc.) and throw `ValidationError("Required parameter missing: <name>")` if any is empty/null/undefined.

---

### Subject: Issue

#### `client.listForIssue(owner, repo, issueNumber, options?)`
| Param | Type | Required |
|---|---|---|
| `owner` | `string` | yes |
| `repo` | `string` | yes |
| `issueNumber` | `number` | yes |
| `options` | `ListReactionsOptions` | no |

Endpoint: `GET /repos/{owner}/{repo}/issues/{issue_number}/reactions`
Returns: `PaginatedResponse` (array of `Reaction`).

```js
const { data, pagination } = await client.listForIssue('octocat', 'Hello-World', 1, { content: 'heart' });
```

#### `client.createForIssue(owner, repo, issueNumber, options)`
Params: `owner: string`, `repo: string`, `issueNumber: number`, `options: CreateReactionOptions` (req).
Endpoint: `POST /repos/{owner}/{repo}/issues/{issue_number}/reactions`  — **mutating**
Returns: created `Reaction`.

```js
const reaction = await client.createForIssue('octocat', 'Hello-World', 1, { content: 'heart' });
```

#### `client.deleteForIssue(owner, repo, issueNumber, reactionId)`
Params: `owner: string`, `repo: string`, `issueNumber: number`, `reactionId: number` (all req).
Endpoint: `DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

### Subject: Issue Comment

#### `client.listForIssueComment(owner, repo, commentId, options?)`
Params: `owner: string`, `repo: string`, `commentId: number`, `options?: ListReactionsOptions`.
Endpoint: `GET /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions`
Returns: `PaginatedResponse`.

#### `client.createForIssueComment(owner, repo, commentId, options)`
Params: `owner`, `repo`, `commentId: number`, `options: CreateReactionOptions` (req).
Endpoint: `POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions`  — **mutating**
Returns: created `Reaction`.

#### `client.deleteForIssueComment(owner, repo, commentId, reactionId)`
Params: `owner`, `repo`, `commentId: number`, `reactionId: number` (all req).
Endpoint: `DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

### Subject: Commit Comment

#### `client.listForCommitComment(owner, repo, commentId, options?)`
Params: `owner`, `repo`, `commentId: number`, `options?: ListReactionsOptions`.
Endpoint: `GET /repos/{owner}/{repo}/comments/{comment_id}/reactions`
Returns: `PaginatedResponse`.

#### `client.createForCommitComment(owner, repo, commentId, options)`
Params: `owner`, `repo`, `commentId: number`, `options: CreateReactionOptions` (req).
Endpoint: `POST /repos/{owner}/{repo}/comments/{comment_id}/reactions`  — **mutating**
Returns: created `Reaction`.

#### `client.deleteForCommitComment(owner, repo, commentId, reactionId)`
Params: `owner`, `repo`, `commentId: number`, `reactionId: number` (all req).
Endpoint: `DELETE /repos/{owner}/{repo}/comments/{comment_id}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

### Subject: Pull Request Review Comment

#### `client.listForPullRequestReviewComment(owner, repo, commentId, options?)`
Params: `owner`, `repo`, `commentId: number`, `options?: ListReactionsOptions`.
Endpoint: `GET /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions`
Returns: `PaginatedResponse`.

#### `client.createForPullRequestReviewComment(owner, repo, commentId, options)`
Params: `owner`, `repo`, `commentId: number`, `options: CreateReactionOptions` (req).
Endpoint: `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions`  — **mutating**
Returns: created `Reaction`.

#### `client.deleteForPullRequestComment(owner, repo, commentId, reactionId)`
> Note the method name drops "ReviewComment" here (`deleteForPullRequestComment`).
Params: `owner`, `repo`, `commentId: number`, `reactionId: number` (all req).
Endpoint: `DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

### Subject: Release

> Release reactions accept only the **subset** enum `ReleaseReactionContent` (`+1`, `laugh`, `heart`, `hooray`, `rocket`, `eyes`).

#### `client.listForRelease(owner, repo, releaseId, options?)`
Params: `owner`, `repo`, `releaseId: number`, `options?: ListReactionsOptions | ListReleaseReactionsOptions`.
Endpoint: `GET /repos/{owner}/{repo}/releases/{release_id}/reactions`  (content filter validated against release subset)
Returns: `PaginatedResponse`.

#### `client.createForRelease(owner, repo, releaseId, options)`
Params: `owner`, `repo`, `releaseId: number`, `options: CreateReleaseReactionOptions` (req).
Endpoint: `POST /repos/{owner}/{repo}/releases/{release_id}/reactions`  — **mutating**
Returns: created `Reaction`.

```js
await client.createForRelease('octocat', 'Hello-World', 1, { content: 'rocket' });
```

#### `client.deleteForRelease(owner, repo, releaseId, reactionId)`
Params: `owner`, `repo`, `releaseId: number`, `reactionId: number` (all req).
Endpoint: `DELETE /repos/{owner}/{repo}/releases/{release_id}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

### Subject: Team Discussion

#### `client.listForTeamDiscussion(org, teamSlug, discussionNumber, options?)`
Params: `org: string`, `teamSlug: string`, `discussionNumber: number`, `options?: ListReactionsOptions`.
Endpoint: `GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions`
Returns: `PaginatedResponse`.

#### `client.createForTeamDiscussion(org, teamSlug, discussionNumber, options)`
Params: `org`, `teamSlug`, `discussionNumber: number`, `options: CreateReactionOptions` (req).
Endpoint: `POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions`  — **mutating**
Returns: created `Reaction`.

#### `client.deleteForTeamDiscussion(org, teamSlug, discussionNumber, reactionId)`
Params: `org`, `teamSlug`, `discussionNumber: number`, `reactionId: number` (all req).
Endpoint: `DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

### Subject: Team Discussion Comment

#### `client.listForTeamDiscussionComment(org, teamSlug, discussionNumber, commentNumber, options?)`
| Param | Type | Required |
|---|---|---|
| `org` | `string` | yes |
| `teamSlug` | `string` | yes |
| `discussionNumber` | `number` | yes |
| `commentNumber` | `number` | yes |
| `options` | `ListReactionsOptions` | no |

Endpoint: `GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions`
Returns: `PaginatedResponse`.

#### `client.createForTeamDiscussionComment(org, teamSlug, discussionNumber, commentNumber, options)`
Params: `org`, `teamSlug`, `discussionNumber: number`, `commentNumber: number`, `options: CreateReactionOptions` (req).
Endpoint: `POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions`  — **mutating**
Returns: created `Reaction`.

#### `client.deleteForTeamDiscussionComment(org, teamSlug, discussionNumber, commentNumber, reactionId)`
Params: `org`, `teamSlug`, `discussionNumber: number`, `commentNumber: number`, `reactionId: number` (all req).
Endpoint: `DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions/{reaction_id}`  — **mutating**
Returns: `void`.

---

**Capability count: 21 SDK methods** (7 subject types × {list, create, delete}).

**Return shapes:**

- `Reaction`: `{ id: number, node_id: string, user: SimpleUser | null, content: ReactionContent, created_at: string }`
- `PaginatedResponse`: `{ data: unknown[], pagination: PaginationInfo }`
- `PaginationInfo`: `{ page: number, perPage: number, totalPages?: number, totalItems?: number, nextUrl?, prevUrl?, firstUrl?, lastUrl? }`
- `SimpleUser`: `{ login, id, node_id, avatar_url, html_url, type, site_admin, ... }` (see `src/core/types.ts`).

---

## Convenience Functions

These are exported from the barrel for direct use:

- **`createClient(config?: Config): Promise<ReactionsClient>`** — the primary factory (also the default export). See Client Construction.

  ```js
  import createClient from '@internal/github-sdk-reactions';
  const client = await createClient({ token: 'ghp_xxx' });
  ```

- **`loadConfig(configPath?: string): Promise<Config>`** — resolves config from env + optional JSON file (does not validate token).

  ```js
  import { loadConfig } from '@internal/github-sdk-reactions';
  const cfg = await loadConfig();
  ```

- **`createLogger(options?): winston.Logger`** — builds a standalone winston logger (`{ level, console, file }`).

  ```js
  import { createLogger } from '@internal/github-sdk-reactions';
  const logger = createLogger({ level: 'debug' });
  ```

- **`Container`** — a minimal service container (`register(name, factory)` / `resolve(name)`). For manual DI; not required for normal use.

- **`REACTION_CONTENT` / `RELEASE_REACTION_CONTENT`** — const objects mapping symbolic names to enum string values (see Capabilities tables). Use to populate UI selects.

- **`ErrorHandler`** — static helpers `ErrorHandler.handle(err)` (normalizes any error to a `GitHubReactionsError`) and `ErrorHandler.isRetryable(err)`. See Errors.

- **`Types`** — placeholder object exposing type shapes at runtime (rarely needed).

---

## Errors

All errors extend **`GitHubReactionsError`** (which extends `Error`). Fields on every instance:

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The subclass name. |
| `message` | `string` | Human-readable message. |
| `code` | `string` | Machine code (e.g. `VALIDATION_ERROR`). |
| `statusCode` | `number` | HTTP-style status. |
| `details` | `unknown` | Optional structured context. |
| `.toJSON()` | method | Serializes `{ name, message, code, statusCode, details, stack }`. |

| Class | `code` | `statusCode` | Thrown when |
|---|---|---|---|
| `GitHubReactionsError` | `UNKNOWN_ERROR` (base) | `500` | Base / fallback for unrecognized errors. |
| `ValidationError` | `VALIDATION_ERROR` | `400` | Missing required param, invalid reaction `content`, or GitHub `422`. |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | `401` | GitHub `401` (bad/missing token). |
| `ForbiddenError` | `FORBIDDEN` | `403` | GitHub `403` (insufficient permissions). |
| `NotFoundError` | `NOT_FOUND` | `404` | GitHub `404` (entity/reaction not found). |
| `RateLimitError` | `RATE_LIMIT_ERROR` | `429` | GitHub `429`; carries `resetTime` (epoch ms, also as `details.resetTime`), `resetAt: Date \| null`, `getTimeUntilReset(): number` (ms). |
| `NetworkError` | `NETWORK_ERROR` | `503` | `ENOTFOUND` / `ECONNREFUSED`. |
| `TimeoutError` | `TIMEOUT_ERROR` | `408` | Request aborted / contains "timeout". |
| `ConfigurationError` | `CONFIGURATION_ERROR` | `500` | No token, invalid baseUrl/timeout/retries/perPage, or config-file load failure. |

`ErrorHandler.handle(error)` maps raw fetch/HTTP failures to the right subclass by inspecting `error.response.status`. `ErrorHandler.isRetryable(error)` returns true for `NETWORK_ERROR`, `TIMEOUT_ERROR`, `RATE_LIMIT_ERROR`, or any `statusCode >= 500` (used by `HttpService` for retry + exponential backoff).

---

## CLI

**Bin name:** `github-reactions` (maps to `dist/esm/cli.js`).

**Global options:** `-v, --verbose` (debug logging + stack traces), `--no-color`, `--version`, `--help`.

**Token passing:** `--token <token>` on each command, OR the `GITHUB_TOKEN` env var (recommended). If neither resolves, the underlying `createClient` throws a `ConfigurationError`.

**Output format:** `-o, --output <json|table>` (default `table`). `table` renders via `console.table` with emoji-decorated content and a page footer; `json` prints `JSON.stringify(..., 2)`.

### `github-reactions list`
Lists reactions for a resource. Options:

| Flag | Required | Notes |
|---|---|---|
| `-r, --resource <type>` | yes | One of: `issue`, `issue-comment`, `commit-comment`, `pr-comment`, `release`, `team-discussion`, `team-discussion-comment`. |
| `-t, --token <token>` | no | PAT (else `GITHUB_TOKEN`). |
| `-o, --output <format>` | no | `json` or `table` (default `table`). |
| `--per-page <number>` | no | default `30`. |
| `--page <number>` | no | default `1`. |
| `--all-pages` | no | auto-paginate. |
| `--owner <owner>` | repo resources | |
| `--repo <repo>` | repo resources | |
| `--org <org>` | team resources | |
| `--team-slug <slug>` | team resources | |
| `--issue-number <number>` | issue | |
| `--comment-id <id>` | issue-comment / commit-comment / pr-comment | |
| `--release-id <id>` | release | |
| `--discussion-number <number>` | team-discussion(-comment) | |
| `--comment-number <number>` | team-discussion-comment | |
| `--content <type>` | no | filter by reaction content. |

### `github-reactions create`  *(mutating — POST)*
Same resource/targeting flags as `list`, plus **required** `--content <type>` (the reaction). `-r, --resource` required. Prints `✅ Reaction created successfully!` then the created reaction.

### `github-reactions delete`  *(mutating — DELETE)*
Same targeting flags, plus **required** `-r, --resource` and **required** `--reaction-id <id>`. Prints `✅ Reaction deleted successfully!`.

### `github-reactions examples`
Prints usage examples; no API call.

**Example:**
```bash
github-reactions create --resource issue --owner octocat --repo Hello-World --issue-number 1 --content heart
github-reactions list --resource release --owner octocat --repo Hello-World --release-id 42 --output json
github-reactions delete --resource issue --owner octocat --repo Hello-World --issue-number 1 --reaction-id 67890
```

> Note: `src/commands/*.ts` contain command-class scaffolding but are **not** wired into the active CLI; `src/cli.ts` defines all commands inline.

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
github-reactions --proxy http://proxy.example.test:8080 <command>
github-reactions --proxy-bypass 'ghe.internal,.corp.example' <command>
github-reactions --no-proxy <command>
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

Build a small single-user web app to exercise every capability against the live GitHub API.

**Token field (top, memory only):**
- A single PAT input at the top of the app. Hold it in memory only (no localStorage, no persistence). Send it as `Authorization: token <PAT>` on every request. Optionally a base-URL field defaulting to `https://api.github.com`.

**Left navigation — group by subject type** (7 groups, each with List / Create / Delete):
1. Issue
2. Issue Comment
3. Commit Comment
4. Pull Request Review Comment
5. Release
6. Team Discussion
7. Team Discussion Comment

(21 capabilities total — see §Capabilities for exact endpoints and params.)

**Auto-generate a form per capability** from each method's param table:
- Render one input per ordered param, plus an options section for list/create option fields.

**Widget mapping:**
- `string` (`owner`, `repo`, `org`, `teamSlug`) → text input.
- `number` (`issueNumber`, `commentId`, `releaseId`, `discussionNumber`, `commentNumber`, `reactionId`, `perPage`, `page`) → number input.
- `boolean` (`autoPage`) → checkbox.
- **enum `content`** → select. For most subjects use the full reaction set: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes` (show emoji labels 👍 👎 😄 😕 ❤️ 🎉 🚀 👀). For **Release** capabilities, restrict the select to the subset: `+1`, `laugh`, `heart`, `hooray`, `rocket`, `eyes` (no `-1`, no `confused`).
- `output` (table/json) → select.
- array → repeatable field group; object → JSON editor. (None of the reaction inputs are arrays/objects beyond the flat options object.)

**Submit behavior:**
- Call the SDK method (or the equivalent REST endpoint from §Capabilities) at `https://api.github.com` with the in-memory PAT.
- Render the JSON response, the HTTP status, and the **rate-limit headers** (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`).
- On error, surface the §Errors fields (`name`, `code`, `statusCode`, `message`, `details`).

**Mutating verbs:** flag every **Create (POST)** and **Delete (DELETE)** capability with a confirm dialog before sending. List (GET) needs no confirm.

**Scope:** single-user manual testing, no persistence, no auth flow beyond the raw PAT.
