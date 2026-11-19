# @internal/github-sdk-activity — Interface

A TypeScript SDK and CLI for the **GitHub Activity API** — the family of REST endpoints covering repository/user/org **events**, the authenticated user's **notifications** (threads + subscriptions), Atom **feeds**, repository **stars/stargazers**, and repository **watching** (subscriptions). It wraps `https://api.github.com` with an axios-based HTTP client, a token-resolving auth layer, link-header pagination, a typed error taxonomy, and a `commander`-based CLI (`github-activity` / `gha`). This document describes the complete public surface so a downstream LLM can generate a UI workbench that exercises every capability against the live GitHub API.

---

## Install & Import

npm package name: **`@internal/github-sdk-activity`** (version `0.0.1`, `"type": "module"`).

### ESM (default + named)

```js
// Default export = object bundle of all classes + the factory + Types
import sdk from '@internal/github-sdk-activity';
const { ActivityClient, createClient, EventsAPI, NotificationsAPI, FeedsAPI, StarsAPI, WatchingAPI, Types } = sdk;

// Named exports
import {
  ActivityClient,
  createClient,
  HttpClient,
  AuthConfig,
  createAuthConfig,
  EventsAPI,
  NotificationsAPI,
  FeedsAPI,
  StarsAPI,
  WatchingAPI,
  Paginator,
  parseLinkHeader,
  buildPaginationParams,
  APIError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ConfigurationError,
  isRetryableError,
  retryWithBackoff,
  sleep,
  Types
} from '@internal/github-sdk-activity';
```

### CJS

```js
const { ActivityClient, createClient } = require('@internal/github-sdk-activity');
// Default bundle is on .default:
const sdk = require('@internal/github-sdk-activity').default;
```

### Subpath exports (from the `exports` map)

| Subpath | What it gives you |
|---|---|
| `@internal/github-sdk-activity` | Main barrel: `ActivityClient`, `createClient`, all API classes, errors, pagination helpers, `Types`, default bundle. |
| `@internal/github-sdk-activity/client` | The `ActivityClient` class module directly. |
| `@internal/github-sdk-activity/models` | The type model module (`models/types.ts`) — interfaces + the `Types` const map. |
| `@internal/github-sdk-activity/api/events` | `EventsAPI` class only. |
| `@internal/github-sdk-activity/api/notifications` | `NotificationsAPI` class only. |
| `@internal/github-sdk-activity/api/feeds` | `FeedsAPI` class only. |
| `@internal/github-sdk-activity/api/stars` | `StarsAPI` class only. |
| `@internal/github-sdk-activity/api/watching` | `WatchingAPI` class only. |

---

## Authentication

A GitHub personal access token (PAT) is required for any authenticated or mutating call. Token resolution (priority order, implemented in `AuthConfig` and `createAuthConfig`):

1. **Direct option** — `options.token` passed to the client/factory (`tokenSource = 'direct'`).
2. **Named env var** — `options.tokenEnv` (reads that env var).
3. **Token file** — `options.tokenFile` (path to a file containing the token).
4. **Default env vars** — `process.env.GITHUB_TOKEN`, then `process.env.GH_TOKEN`.
5. **Config file** — if none of the above, `AuthConfig.loadConfig()` searches: the explicit `configPath`, `.github-activity.json` (cwd), `~/.github-activity.json`, `~/.config/github-activity/config.json`. A config file may carry `token`/`auth.token`, `baseUrl`/`baseURL`, `perPage`/`per_page`, `timeout`, `cache`, `debug`.

Exact `process.env` reads in the source:
- `GITHUB_TOKEN`, `GH_TOKEN` (auth — `auth.ts`, `bin/github-activity.ts`).
- `GITHUB_API_URL` (base URL — `ActivityClient`).
- `GITHUB_API_TIMEOUT` (timeout, in ms — `ActivityClient.fromEnvironment`).
- `DEBUG` (`=== 'true'` enables HTTP request logging — `ActivityClient`, `http.ts`, formatters).

**No token:** the client is still constructed; `isAuthenticated()` returns `false`; unauthenticated public reads (e.g. public events) may work but at a low rate limit, and any authenticated/mutating call (notifications, star/unstar, watch, `/user/...`) will fail with a `401`/`403` surfaced as an `APIError`/`RateLimitError`/`AuthenticationError`. Token format is loosely validated (`AuthConfig.validateToken`: `ghp_` len 40, `ghs_`, `github_pat_`, or 40-char hex); an invalid-looking token only logs `Warning: Token format appears invalid`. New-style tokens (`ghp_`/`github_pat_`/`ghs_`) get an `Authorization: Bearer <t>` header; classic hex tokens get `Authorization: token <t>`. (The `HttpClient.setAuthToken` always uses `Bearer`.)

**Base URL option:** `options.baseURL` (or `GITHUB_API_URL`), default `https://api.github.com`.

---

## Client Construction

### Factory: `createClient(options?) => Promise<ActivityClient>`

Async factory (the recommended entry). Behavior:
- No `token` and no `configPath` → `ActivityClient.fromEnvironment(options)`.
- `configPath` set → `ActivityClient.fromConfig(configPath, options)`.
- Otherwise → `new ActivityClient(options)`.

```js
import { createClient } from '@internal/github-sdk-activity';
const client = await createClient({ token: process.env.GITHUB_TOKEN });
```

### Constructor: `new ActivityClient(options?: ActivityClientOptions)`

Synchronous; kicks off async auth initialization in the background (`initAuth`). Use the `createClient`/`fromEnvironment` factories when you need auth fully resolved before the first call.

#### `ActivityClientOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `token` | `string` | resolved from env/config | GitHub PAT used for the `Authorization` header. |
| `baseURL` | `string` | `process.env.GITHUB_API_URL` ?? `https://api.github.com` | API base URL (use for GitHub Enterprise). |
| `timeout` | `number` (ms) | `30000` | Axios request timeout. |
| `perPage` | `number` | `30` | Default page size (stored on `options`; per-call `per_page` still wins). |
| `debug` | `boolean` | `process.env.DEBUG === 'true'` | Logs each HTTP request method+URL. |
| `configPath` | `string` | — | Path to a JSON config file (routes through `fromConfig`). |
| `[key: string]` | `unknown` | — | Extra keys are spread onto the resolved options. |

#### Factory statics
- `ActivityClient.fromEnvironment(options?) => Promise<ActivityClient>` — builds from `GITHUB_TOKEN`/`GH_TOKEN`, `GITHUB_API_URL`, `GITHUB_API_TIMEOUT`, `DEBUG`, then merges `options`.
- `ActivityClient.fromConfig(configPath, options?) => Promise<ActivityClient>` — loads a config file then merges `options`.

#### Instance members
- Sub-module properties: `client.events`, `client.notifications`, `client.feeds`, `client.stars`, `client.watching` (the API areas below), plus `client.http` (the `HttpClient`) and `client.authConfig`.
- Helper methods: `setToken(token)`, `isAuthenticated()`, `withOptions(options)` (clone), and the convenience calls `getRateLimit()`, `getAuthenticatedUser()`, `getMeta()` (documented in §6).

---

## Capabilities

All list/get methods that hit a paginated endpoint return `PageResult<T>`:
```ts
interface PageResult<T> { data: T[]; pagination?: PageLinks | null; rateLimit?: RateLimit; }
```
Single-object getters return the typed object directly. Mutations return `{ data: unknown; rateLimit: RateLimit }` unless noted. `RateLimit = { limit, remaining, reset, used, resource }`. `PaginationOptions` accepts `{ page?, per_page?, sort?, direction?, since?, before? }` (`per_page` clamped 1–100 by `buildPaginationParams`).

Several methods are **client-side helpers** that operate on already-fetched arrays and make **no HTTP call** — those are marked *(local, no endpoint)*.

---

### Events — `client.events` (`EventsAPI`)

#### `client.events.listPublic(options?)`
`(options?: PaginationOptions) => Promise<PageResult<Event>>`

| Param | Type | Required | Description |
|---|---|---|---|
| `options` | `PaginationOptions` | no | `page`, `per_page`, etc. |

Endpoint: `GET /events`. Returns: page of `Event`.
```js
const { data } = await client.events.listPublic({ per_page: 30 });
```

#### `client.events.listForRepo(owner, repo, options?)`
`(owner: string, repo: string, options?: PaginationOptions) => Promise<PageResult<Event>>`

| Param | Type | Required | Description |
|---|---|---|---|
| `owner` | `string` | yes | Repo owner. |
| `repo` | `string` | yes | Repo name. |
| `options` | `PaginationOptions` | no | Pagination. |

Endpoint: `GET /repos/{owner}/{repo}/events`. Returns: page of `Event`.

#### `client.events.listForRepoNetwork(owner, repo, options?)`
Same params as above. Endpoint: `GET /networks/{owner}/{repo}/events`. Returns: page of `Event`.

#### `client.events.listForOrg(org, options?)`
`(org: string, options?: PaginationOptions) => Promise<PageResult<Event>>`. Endpoint: `GET /orgs/{org}/events`. (`org` required.)

#### `client.events.listForUser(username, options?)`
`(username: string, options?: PaginationOptions) => Promise<PageResult<Event>>`. Endpoint: `GET /users/{username}/events`.

#### `client.events.listPublicForUser(username, options?)`
Endpoint: `GET /users/{username}/events/public`.

#### `client.events.listForUserOrg(username, org, options?)`
`(username: string, org: string, options?: PaginationOptions)`. Endpoint: `GET /users/{username}/events/orgs/{org}`.

#### `client.events.listReceivedByUser(username, options?)`
Endpoint: `GET /users/{username}/received_events`.

#### `client.events.listPublicReceivedByUser(username, options?)`
Endpoint: `GET /users/{username}/received_events/public`.

#### `client.events.getPublicPaginator(options?)` / `getRepoPaginator(owner, repo, options?)` / `getUserPaginator(username, options?)`
Return a `Paginator<Event>` (async-iterable; `.fetchAll(max?)`, `.fetchNextPage()`). No immediate HTTP call. Wraps the corresponding list endpoint.

#### `client.events.streamPublic(options?)`
`(options?: { interval?: number; onEvent?: (e: Event) => void; signal?: AbortSignal; onError?: (error: unknown) => void }) => AsyncGenerator<Event>`. Polls `GET /events` every `interval` ms (default 60000, raised to GitHub's `X-Poll-Interval` when that is longer) yielding only unseen events, until `signal` aborts. Transient errors (rate limit, 5xx, network) go to `onError` (default: one line on stderr) and polling continues; a definitive 4xx (401, 404, 422) is thrown and ends the stream. Long-running.

#### Local helpers (no endpoint)
- `filterByType(events, types: string | string[]) => Event[]`
- `filterByRepo(events, repoFullName: string) => Event[]`
- `filterByActor(events, username: string) => Event[]`
- `groupByType(events) => Record<string, Event[]>`
- `getStatistics(events) => EventStatistics` (`{ total, types, actors, repos, publicEvents, privateEvents, topTypes, topActors, topRepos }`).

---

### Notifications — `client.notifications` (`NotificationsAPI`)

Note: `list` clamps `per_page` to max **50**. `NotificationListOptions = PaginationOptions & { all?: boolean; participating?: boolean }` (plus `since`/`before` from pagination options).

#### `client.notifications.list(options?)`
`(options?: NotificationListOptions) => Promise<PageResult<NotificationThread>>`

| Param | Type | Required | Description |
|---|---|---|---|
| `options.all` | `boolean` | no | Include read notifications. |
| `options.participating` | `boolean` | no | Only notifications you're participating in. |
| `options.since` / `options.before` | `string` (ISO) | no | Time filters. |
| `options.page` / `options.per_page` | `number` | no | Pagination (`per_page` ≤ 50). |

Endpoint: `GET /notifications`. Returns: page of `NotificationThread`.
```js
const { data } = await client.notifications.list({ all: false, per_page: 50 });
```

#### `client.notifications.listForRepo(owner, repo, options?)`
`(owner, repo, options?: NotificationListOptions)`. Endpoint: `GET /repos/{owner}/{repo}/notifications`.

#### `client.notifications.markAsRead(options?)` — **mutating**
`(options?: { last_read_at?: string; read?: boolean }) => Promise<{ data; rateLimit }>`. Defaults `last_read_at` to now, `read` to true. Endpoint: `PUT /notifications`.

#### `client.notifications.markRepoAsRead(owner, repo, options?)` — **mutating**
Endpoint: `PUT /repos/{owner}/{repo}/notifications`.

#### `client.notifications.getThread(threadId)`
`(threadId: number) => Promise<Thread>`. Endpoint: `GET /notifications/threads/{threadId}`.

#### `client.notifications.markThreadAsRead(threadId)` — **mutating**
`(threadId: number) => Promise<{ data; rateLimit }>`. Endpoint: `PATCH /notifications/threads/{threadId}`.

#### `client.notifications.markThreadAsDone(threadId)` — **mutating**
Endpoint: `DELETE /notifications/threads/{threadId}`.

#### `client.notifications.getThreadSubscription(threadId)`
`(threadId: number) => Promise<ThreadSubscription>`. Endpoint: `GET /notifications/threads/{threadId}/subscription`.

#### `client.notifications.setThreadSubscription(threadId, options?)` — **mutating**
`(threadId: number, options?: { ignored?: boolean }) => Promise<ThreadSubscription>`. Body `{ ignored }`. Endpoint: `PUT /notifications/threads/{threadId}/subscription`.

#### `client.notifications.deleteThreadSubscription(threadId)` — **mutating**
Endpoint: `DELETE /notifications/threads/{threadId}/subscription`.

#### `getPaginator(options?)` / `getRepoPaginator(owner, repo, options?)`
Return `Paginator<NotificationThread>`.

#### `getAllUnread(options?)` / `getAllParticipating(options?)`
`=> Promise<NotificationThread[]>` — convenience wrappers over `list` (`all:false` / `participating:true`); return `.data`.

#### `markMultipleAsRead(threadIds: number[])` — **mutating (batch)**
Calls `markThreadAsRead` per id; per-item failures captured as `{ id, error }`.

#### `subscribeToMultiple(threadIds: number[], options?)` — **mutating (batch)**
Calls `setThreadSubscription` per id.

#### Local helpers (no endpoint)
- `groupByRepository(notifications)`, `groupByReason(notifications)`,
- `filterBySubjectType(notifications, types)`, `filterUnread(notifications)`,
- `getStatistics(notifications) => NotificationStatistics` (`{ total, unread, reasons, subjectTypes, repositories, topRepositories }`).

---

### Feeds — `client.feeds` (`FeedsAPI`)

The base call is `getFeeds()`; the rest derive URLs/metadata from it (each re-fetches `/feeds`).

#### `client.feeds.getFeeds()`
`() => Promise<Feed>`. Endpoint: `GET /feeds`. Returns: `Feed` (`timeline_url`, `user_url`, `current_user_*_url`(s), `security_advisories_url`, `repository_discussions_*_url`, `_links`).
```js
const feeds = await client.feeds.getFeeds();
```

#### URL getters (each calls `GET /feeds`)
- `getTimelineFeedUrl() => Promise<string>`
- `getUserFeedUrl() => Promise<string>` (template containing `{user}`)
- `getCurrentUserPublicFeedUrl() => Promise<string | undefined>`
- `getCurrentUserFeedUrl() => Promise<string | undefined>` (private)
- `getCurrentUserActorFeedUrl() => Promise<string | undefined>`
- `getCurrentUserOrganizationFeedUrls() => Promise<string[]>`
- `getSecurityAdvisoriesFeedUrl() => Promise<string>`
- `getRepositoryDiscussionsFeedUrl() => Promise<string | undefined>` (template)
- `getRepositoryDiscussionsCategoryFeedUrl() => Promise<string | undefined>` (template)
- `getAllFeedLinks() => Promise<object>` (returns `feeds._links`)

#### URL generators / checks (call `GET /feeds`, then string-template locally)
- `generateUserFeedUrl(username: string) => Promise<string>`
- `generateRepositoryDiscussionsFeedUrl(owner, repo) => Promise<string>`
- `generateRepositoryDiscussionsCategoryFeedUrl(owner, repo, category) => Promise<string>`
- `hasPrivateFeeds() => Promise<boolean>`
- `getFeedMetadata() => Promise<FeedMetadata>` (`hasTimeline`, `hasUserFeed`, …, `totalFeedTypes`, `feedTypes`)
- `getAllAvailableFeeds() => Promise<AvailableFeed[]>` (`{ name, type, url, public }[]`)

---

### Stars — `client.stars` (`StarsAPI`)

`StarListOptions = PaginationOptions & { withTimestamps?: boolean }`. When `withTimestamps` is true, the request sends `Accept: application/vnd.github.star+json` so each item includes `starred_at`.

#### `client.stars.listStargazers(owner, repo, options?)`
`(owner, repo, options?: StarListOptions) => Promise<PageResult<Stargazer | SimpleUser>>`

| Param | Type | Required | Description |
|---|---|---|---|
| `owner` | `string` | yes | Repo owner. |
| `repo` | `string` | yes | Repo name. |
| `options.withTimestamps` | `boolean` | no | Include `starred_at`. |
| `options.page` / `options.per_page` | `number` | no | Pagination. |

Endpoint: `GET /repos/{owner}/{repo}/stargazers`. Returns: page of `SimpleUser` (or `Stargazer` when timestamps requested).

#### `client.stars.listStarredByUser(username, options?)`
`(username, options?: StarListOptions) => Promise<PageResult<StarredRepository>>`. Endpoint: `GET /users/{username}/starred`. Supports `sort`/`direction` via options.

#### `client.stars.listStarredByAuthUser(options?)`
Endpoint: `GET /user/starred`. (Requires auth.)

#### `client.stars.checkIfStarred(owner, repo)`
`(owner, repo) => Promise<boolean>`. Endpoint: `GET /user/starred/{owner}/{repo}` (404 → `false`). Requires auth.

#### `client.stars.starRepo(owner, repo)` — **mutating**
`=> Promise<{ data; rateLimit }>`. Endpoint: `PUT /user/starred/{owner}/{repo}`.

#### `client.stars.unstarRepo(owner, repo)` — **mutating**
Endpoint: `DELETE /user/starred/{owner}/{repo}`.

#### Paginators
- `getStargazersPaginator(owner, repo, options?) => Paginator<Stargazer | SimpleUser>`
- `getStarredPaginator(username, options?) => Paginator<StarredRepository>`
- `getAuthStarredPaginator(options?) => Paginator<StarredRepository>`

#### `client.stars.starMultiple(repos)` / `unstarMultiple(repos)` — **mutating (batch)**
`(repos: { owner; repo }[]) => Promise<BulkStarResult[]>` (`{ owner, repo, success, error? }`). Loops `starRepo`/`unstarRepo`.

#### `client.stars.getStarCount(owner, repo)`
`=> Promise<number>`. Endpoint: `GET /repos/{owner}/{repo}` (reads `stargazers_count`).

#### `client.stars.getStarHistory(owner, repo, options?)`
`=> Promise<StarHistoryEntry[]>` (`{ user, starred_at }[]`, sorted ascending). Paginates `/repos/{owner}/{repo}/stargazers` with timestamps.

#### `client.stars.getStarStatistics(owner, repo)`
`=> Promise<StarStatistics>` (`{ total, byMonth, byYear, recent:{lastDay,lastWeek,lastMonth} }`). Combines `getStarCount` + `getStarHistory(per_page:100)`.

#### `client.stars.findMutualStargazers(repo1, repo2)`
`(repo1: {owner,repo}, repo2: {owner,repo}) => Promise<SimpleUser[]>`. Fetches **all** stargazers of both repos (`GET /repos/{owner}/{repo}/stargazers`, full pagination) and intersects by `login`.

---

### Watching — `client.watching` (`WatchingAPI`)

#### `client.watching.listWatchers(owner, repo, options?)`
`(owner, repo, options?: PaginationOptions) => Promise<PageResult<SimpleUser>>`. Endpoint: `GET /repos/{owner}/{repo}/subscribers`.

#### `client.watching.listWatchedByUser(username, options?)`
`=> Promise<PageResult<MinimalRepository>>`. Endpoint: `GET /users/{username}/subscriptions`.

#### `client.watching.listWatchedByAuthUser(options?)`
Endpoint: `GET /user/subscriptions`. Requires auth.

#### `client.watching.getRepoSubscription(owner, repo)`
`=> Promise<RepositorySubscription>`. Endpoint: `GET /repos/{owner}/{repo}/subscription` (404 → a synthesized `{ subscribed:false, ignored:false, … }`). Requires auth.

#### `client.watching.setRepoSubscription(owner, repo, options?)` — **mutating**
`(owner, repo, options?: { subscribed?: boolean; ignored?: boolean }) => Promise<RepositorySubscription>`. Body `{ subscribed, ignored }`. Endpoint: `PUT /repos/{owner}/{repo}/subscription`.

#### `client.watching.deleteRepoSubscription(owner, repo)` — **mutating**
`=> Promise<{ data; rateLimit }>`. Endpoint: `DELETE /repos/{owner}/{repo}/subscription`.

#### `client.watching.watchRepo(owner, repo)` — **mutating**
`=> Promise<RepositorySubscription>`. `setRepoSubscription(subscribed:true, ignored:false)` → `PUT /repos/{owner}/{repo}/subscription`.

#### `client.watching.unwatchRepo(owner, repo)` — **mutating**
`=> Promise<{ data; rateLimit }>`. Alias of `deleteRepoSubscription` → `DELETE /repos/{owner}/{repo}/subscription`.

#### `client.watching.ignoreRepo(owner, repo)` — **mutating**
`setRepoSubscription(subscribed:false, ignored:true)` → `PUT /repos/{owner}/{repo}/subscription`.

#### `client.watching.isWatching(owner, repo)` / `isIgnoring(owner, repo)`
`=> Promise<boolean>`. Each calls `getRepoSubscription` (`GET /repos/{owner}/{repo}/subscription`).

#### Paginators
- `getWatchersPaginator(owner, repo, options?) => Paginator<SimpleUser>`
- `getWatchedPaginator(username, options?) => Paginator<MinimalRepository>`
- `getAuthWatchedPaginator(options?) => Paginator<MinimalRepository>`

#### `client.watching.watchMultiple(repos)` / `unwatchMultiple(repos)` — **mutating (batch)**
`(repos: {owner,repo}[]) => Promise<BulkWatchResult[]>`.

#### `client.watching.getWatcherCount(owner, repo)`
`=> Promise<number>`. Endpoint: `GET /repos/{owner}/{repo}` (reads `subscribers_count`).

#### `client.watching.getAllWatchers(owner, repo, options?)`
`=> Promise<SimpleUser[]>`. Full pagination of `GET /repos/{owner}/{repo}/subscribers`.

#### `client.watching.getAllWatched(options?)`
`=> Promise<MinimalRepository[]>`. Full pagination of `GET /user/subscriptions`.

#### `client.watching.getWatchStatistics(repos)`
`(repos: {owner,repo}[]) => Promise<WatchStatistics>` (`{ total, watched, ignored, notWatching, details }`). One `getRepoSubscription` per repo.

#### `client.watching.findMutualWatchers(repo1, repo2)`
`=> Promise<SimpleUser[]>`. Intersects all subscribers of both repos by `login`.

---

### Client-level capabilities — `client.*`

#### `client.getRateLimit()`
`=> Promise<unknown>`. Endpoint: `GET /rate_limit`. Returns the GitHub rate-limit resources object.

#### `client.getAuthenticatedUser()`
`=> Promise<unknown>`. Endpoint: `GET /user`. Requires auth.

#### `client.getMeta()`
`=> Promise<unknown>`. Endpoint: `GET /meta`.

---

## Convenience Functions

Top-level exports usable without the SDK class wiring.

- **`createClient(options?: ActivityClientOptions) => Promise<ActivityClient>`** — async client factory (see §4).
  ```js
  import { createClient } from '@internal/github-sdk-activity';
  const client = await createClient({ token: 'ghp_…' });
  ```
- **`createAuthConfig(options?: AuthConfigOptions) => Promise<AuthConfig>`** — build an `AuthConfig`, loading config files when no direct token/file/env is given; warns on bad token format.
- **`buildPaginationParams(options?: PaginationOptions) => PaginationParams`** — normalize `{ page, per_page (clamped 1–100), sort, direction, since, before }`.
- **`parseLinkHeader(linkHeader?: string | null) => PageLinks | null`** — parse a GitHub `Link` header into `{ rel: url, rel_page: number }`.
- **`new Paginator<T>(fetchFn, options?)`** — async-iterable pager; `.fetchNextPage()`, `.fetchAll(maxItems?)`, `.reset()`.
  ```js
  const pager = client.stars.getStargazersPaginator('octocat', 'hello-world', { per_page: 100 });
  const all = await pager.fetchAll(500);
  ```
- **`retryWithBackoff(fn, maxRetries=3, baseDelay=1000, onRetry?) => Promise<T>`** — retries `fn` on retryable errors with exponential backoff (honors `RateLimitError.retryAfter`). `onRetry({ error, delayMs, attempt, maxRetries })` replaces the default stderr line. Note the transport's limiter already waits out rate limits; wrapping client calls in this multiplies retries.
- **`isRetryableError(error) => boolean`** — true for `RateLimitError`, `APIError` with status ≥ 500, or network codes `ECONNRESET`/`ETIMEDOUT`/`ECONNREFUSED`.
- **`sleep(ms) => Promise<void>`** — promise-based delay.
- **`Types`** — const string-map of model type names (`Types.Event`, `Types.SimpleUser`, …) for reflection/labels.

---

## Errors

All thrown from the HTTP layer (`http.ts` `handleError`) or helpers. `RateLimitError`, `AuthenticationError`, `NotFoundError`, `ValidationError` all extend `APIError`; `ConfigurationError` extends `Error`.

| Class | Extends | Fields | Thrown when |
|---|---|---|---|
| `APIError` | `Error` | `message`, `statusCode: number`, `errors: ValidationErrorDetail[]`, `documentationUrl: string \| null`; `toString()` formats all. | Any non-2xx GitHub response that isn't a rate-limit case. `statusCode` = HTTP status; `errors`/`documentationUrl` from the body. |
| `RateLimitError` | `APIError` | adds `retryAfter: number` (ms), `resetTime: number` (epoch ms); `resetAt: Date \| null`; methods `getSecondsUntilReset()`, `getTimeUntilReset(): number` (ms), `getTimeUntilResetString()`. `statusCode=403`. | `403` with header `x-ratelimit-remaining: 0`. |
| `AuthenticationError` | `APIError` | `statusCode=401`. | Constructed for auth failures (default message `Authentication required`). |
| `NotFoundError` | `APIError` | `statusCode=404`. | Constructed for missing resources (default `Resource not found`). |
| `ValidationError` | `APIError` | `statusCode=422`, `errors`. | Constructed for request validation failures. |
| `ConfigurationError` | `Error` | `message`. | `AuthConfig.loadFromFile()` fails to read the token file. |

> Note: in this SDK version, the HTTP layer throws `RateLimitError` and the generic `APIError` directly; `AuthenticationError`/`NotFoundError`/`ValidationError` are exported for consumers (a 401/404/422 currently arrives as an `APIError` with that `statusCode`). The workbench should branch on `error instanceof RateLimitError` first, then on `error.statusCode`.

`ValidationErrorDetail = { field?, code?, message?, [k]: unknown }`.

---

## CLI

Two bin aliases, same entrypoint (`dist/esm/bin/github-activity.js`): **`github-activity`** and **`gha`**. Loads `.env` via dotenv and prints an ASCII banner on every run. Output format is controlled by the global `-o/--output` flag (`table` default, `json`, `csv`); spinners (`ora`) show progress; errors print via `displayError`.

**Token resolution (CLI):** `--token` flag → `GITHUB_TOKEN` → `GH_TOKEN`. Also `--config <path>` for a config file.

### Global options
| Flag | Description | Default |
|---|---|---|
| `-t, --token <token>` | GitHub PAT. | env-resolved |
| `-b, --base-url <url>` | API base URL. | `https://api.github.com` |
| `-c, --config <path>` | Config file path. | — |
| `-o, --output <format>` | `json` \| `table` \| `csv`. | `table` |
| `-q, --quiet` | Suppress non-error output. | — |
| `-v, --verbose` | Verbose output. | — |
| `--no-color` | Disable colored output. | — |
| `--debug` | Enable debug (sets `DEBUG=true`, logs HTTP). | — |

### Commands

**`events`**
- `events list [--page <n>] [--per-page <n>] [--type <type>]` — public events (client-side `--type` filter).
- `events repo <owner> <repo> [--page] [--per-page]`
- `events user <username> [--public] [--page] [--per-page]`
- `events org <org> [--page] [--per-page]`
- `events stream [--interval <ms>] [--type <type>]` — long-running poll (Ctrl+C to stop).

**`notifications`** (alias `notif`)
- `notifications list [--all] [--participating] [--since <date>] [--before <date>] [--page] [--per-page]`
- `notifications mark-read [--last-read-at <date>]` — **mutating** (interactive `inquirer` confirm).
- `notifications thread <id>`
- `notifications thread-read <id>` — **mutating**
- `notifications thread-done <id>` — **mutating**
- `notifications subscribe <id> [--ignore]` — **mutating**

**`stars`**
- `stars list <owner> <repo> [--with-timestamps] [--page] [--per-page]`
- `stars user [username] [--sort <field>] [--direction <dir>] [--page] [--per-page]` (no `username` → authenticated user's starred).
- `stars check <owner> <repo>`
- `stars add <owner> <repo>` — **mutating** (star)
- `stars remove <owner> <repo>` — **mutating** (unstar)
- `stars stats <owner> <repo>`

**`watch`**
- `watch list <owner> <repo> [--page] [--per-page]`
- `watch user [username] [--page] [--per-page]` (no `username` → authenticated user).
- `watch check <owner> <repo>`
- `watch add <owner> <repo>` — **mutating** (watch)
- `watch remove <owner> <repo>` — **mutating** (unwatch)
- `watch ignore <owner> <repo>` — **mutating**

**`feeds`**
- `feeds list` — available feeds.
- `feeds get` — raw feed URLs.
- `feeds metadata` — feed metadata.

**Utility**
- `rate-limit` — `GET /rate_limit`.
- `whoami` — `GET /user`.
- `meta` — `GET /meta`.

Example: `gha --token ghp_… -o json stars list octocat hello-world --with-timestamps`

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
github-activity --proxy http://proxy.example.test:8080 <command>
github-activity --proxy-bypass 'ghe.internal,.corp.example' <command>
github-activity --no-proxy <command>
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

Build a small **single-user, in-memory, no-persistence** web app for manually exercising every capability above against the live GitHub API. This is a testing harness, not a product.

### Layout
- **Top bar:** a PAT text field (type=password, memory only — never persist to localStorage/cookies/server) plus an optional base-URL field (default `https://api.github.com`). Add a "Test token" button that calls `GET /user` (`whoami`) and shows the login + a green/red status.
- **Left nav:** group capabilities by sub-module — **Client** (`getRateLimit`, `getAuthenticatedUser`, `getMeta`), **Events**, **Notifications**, **Feeds**, **Stars**, **Watching**. Within each group, list every capability from §5 (skip the *(local, no endpoint)* helpers, or place them in a separate "Client-side utilities" tab that operates on a pasted/last-fetched JSON array).
- **Main panel:** an auto-generated form per selected capability, built from that capability's parameter table; a Submit button; a response area.

### Input-widget mapping (drive from each capability's parameter table)
- `string` → text input. (`owner`, `repo`, `username`, `org`, `category` are required text; `threadId` is numeric.)
- `number` → number input (`page`, `per_page` [clamp 1–100; notifications list ≤ 50], `interval`, `timeout`, `threadId`).
- `boolean` → checkbox (`all`, `participating`, `withTimestamps`, `subscribed`, `ignored`, `read`, `public`).
- enum / string-union → select. Enums found in source:
  - Output format (CLI): `json` | `table` | `csv`.
  - `stars user` sort: `created` | `updated` (CLI default `created`); direction: `asc` | `desc`.
  - Token auth scheme is auto-derived from token prefix — no widget needed.
- date/ISO strings → datetime input that emits ISO-8601 (`since`, `before`, `last_read_at`, `starred_at`).
- array of `{owner, repo}` (batch ops: `starMultiple`, `unstarMultiple`, `watchMultiple`, `unwatchMultiple`, `getWatchStatistics`, `findMutual*`) → repeatable owner/repo field pair.
- options object / request body → either render its known fields (preferred, from the tables above) or a JSON editor for free-form bodies.

### Submitting a call
- Either import the SDK and call `client.<module>.<fn>(...)` with the form values (pass the PAT to `createClient`), **or** issue an equivalent `fetch` to the documented `METHOD /path` on the base URL with header `Authorization: Bearer <PAT>` and `Accept: application/vnd.github.v3+json` (use `application/vnd.github.star+json` when `withTimestamps` is set).
- Render the response: pretty-printed JSON body, the HTTP status, and the **rate-limit headers** (`x-ratelimit-limit`, `-remaining`, `-reset`, `-used`, `-resource`) — the SDK already surfaces these as `result.rateLimit` on list/mutation results.
- On failure, render the §7 error classes: detect `RateLimitError` first (show `getTimeUntilResetString()` / `resetAt`), then branch on `error.statusCode` (401 auth, 404 not-found, 422 validation with the `errors[]` detail list, 5xx server), showing `message`, `statusCode`, `errors`, and `documentationUrl`.

### Safety
- Every call hits `https://api.github.com` and needs a real PAT; unauthenticated calls will mostly 401/403.
- **Flag mutating capabilities** — all `PUT`/`PATCH`/`POST`/`DELETE` operations (every method marked **mutating** above: star/unstar, watch/unwatch/ignore, set/delete subscription, mark-read/done, batch ops). Render them with a distinct color and require an explicit confirm step before firing (mirror the CLI's `inquirer` confirm on `notifications mark-read`).
- Paginators / `getAll*` / `findMutual*` / `streamPublic` can issue many requests — warn and offer a max-pages/max-items cap; treat `streamPublic` as a long-running toggle, not a one-shot submit.
- State explicitly in the UI: single-user, manual capability testing, nothing is persisted.
