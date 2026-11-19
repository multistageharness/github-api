# @internal/github-sdk-users — Interface

GitHub Users API client, SDK, and CLI for **TypeScript/Node.js**. Provides complete
authenticated-user profile management, email-address management, public user discovery,
and user hovercard/context lookups against the **GitHub REST API** (`https://api.github.com`).

**GitHub API domain:** the GitHub *Users* REST resource family — `/user`, `/user/emails`,
`/users`, `/users/{username}`, `/user/{account_id}`, `/users/{username}/hovercard`, plus
`/rate_limit` for auth/limit checks.

- Package name: `@internal/github-sdk-users`
- Version: `0.0.1` (note: the in-source `packageInfo`/CLI report a legacy display name
  `@github-api/users` at version `1.0.0`; the authoritative npm name is `@internal/github-sdk-users`)
- bin: `gh-users`

---

## Install & Import

```bash
npm install @internal/github-sdk-users
```

ESM — default export is the `UsersClient` class; named exports include the factory, API
modules, error classes, and utilities:

```js
import UsersClient from '@internal/github-sdk-users';            // default = UsersClient class
import {
  createClient, UsersClient,
  profile, emails, discovery, context,        // API modules (namespaces)
  UsersError, AuthError, ValidationError, RateLimitError,
  paginate, paginateAll, validateInput, validateEmail,
  getAuthenticatedUser, getUser, listUsers, listEmails,
  packageInfo
} from '@internal/github-sdk-users';
```

CJS:

```js
const UsersClient = require('@internal/github-sdk-users').default;
const { createClient } = require('@internal/github-sdk-users');
```

`exports` subpaths (from `package.json`):

| Subpath | Resolves to | Contents |
|---------|-------------|----------|
| `.` | `dist/esm/index.js` / `dist/cjs/index.js` | main barrel (everything above) |
| `./client` | `dist/esm/client/UsersClient.js` | `UsersClient` class + its option types |
| `./types` | `dist/esm/types/index.js` | re-exported TypeScript type definitions only |

```js
import { UsersClient } from '@internal/github-sdk-users/client';
import type { UsersClientOptions, UserStats } from '@internal/github-sdk-users/types';
```

---

## Authentication

- **Token option name:** `token` (passed to `createClient`/`new UsersClient({ token })`).
- **Environment variables** (checked in order by `getAuth()` in `src/client/auth.ts`):
  1. `GITHUB_TOKEN`
  2. `GH_TOKEN`
  3. `GITHUB_API_TOKEN`
- **Additional token sources** (CLI/`getAuth()` only, not the `UsersClient` constructor):
  4. GitHub CLI config `~/.config/gh/hosts.yml` (`oauth_token:` field; `HOME`/`USERPROFILE`).
  5. `.env` file in the current working directory (`GITHUB_TOKEN=...`).
- **No-token behavior:** the `UsersClient` constructor throws `AuthError`
  (`"GitHub token is required. Set GITHUB_TOKEN environment variable or pass token in options."`)
  if no `token` is present in the resolved options. **Important:** the `UsersClient` constructor
  itself only reads `options.token` — it does **not** call `getAuth()`. The env-var/gh-config/.env
  resolution chain is performed by the CLI (and the `getAuth()` export) which then passes the
  resolved token into the constructor.
- **Auth header:** requests send `Authorization: Bearer <token>`,
  `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- **Base URL option:** `baseUrl` — default `https://api.github.com` (override for GitHub
  Enterprise, e.g. `https://github.enterprise.com/api/v3`).

---

## Client Construction

Two equivalent entry points:

```js
import { createClient } from '@internal/github-sdk-users';
const client = createClient({ token: process.env.GITHUB_TOKEN });

// or
import { UsersClient } from '@internal/github-sdk-users';
const client = new UsersClient({ token: process.env.GITHUB_TOKEN });
```

`createClient(options)` is a thin factory: `return new UsersClient(options)`.

### `UsersClientOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | (none — **required**, else `AuthError`) | GitHub personal access token / app token. |
| `baseUrl` | `string` | `'https://api.github.com'` | API base URL (override for GHE). |
| `timeout` | `number` | `10000` | Per-request timeout in ms. |
| `userAgent` | `string` | `'@github-api/users/1.0.0'` | `User-Agent` request header. |
| `headers` | `Record<string,string>` | `{}` | Extra/override default request headers. |
| `rateLimiting` | `RateLimitingConfig` | `{ enabled: true, maxRequests: 5000 }` | Rate-limit config object (see below). |

`RateLimitingConfig` fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable client-side rate limiting via `@internal/npm-api-rate-limiter`. |
| `maxRequests` | `number` | `5000` | Max requests per window. |
| `window` | `number` | `3600000` (1 hour, ms) | Rate-limit window in ms. |

The constructor builds sub-module properties: `client.profile`, `client.emails`,
`client.discovery`, `client.context`, plus `client.http` (the `HttpClient`).

**Client-level methods (not in a sub-module):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `client.testAuth()` | `GET /rate_limit` | Test auth; throws `AuthError` on 401, returns rate-limit object otherwise. |
| `client.getRateLimit()` | `GET /rate_limit` | Returns current rate-limit object (`resources.core`, `resources.search`, …). |
| `client.updateConfig(options)` | — | Merge new options into the client + HTTP layer. |
| `client.close()` | — | Release rate-limiter resources. |

---

## Capabilities

> All responses are dynamically shaped GitHub JSON. The HTTP layer attaches two extra
> fields to successful object responses: `_rateLimit` (`{ limit, remaining, reset:Date }`)
> and, when a `Link` header is present, `_pagination` (`{ next, prev, first, last }`).

### Sub-module: `profile` — `client.profile.*` (`ProfileAPI`)

Authenticated-user operations.

#### `client.profile.getAuthenticated(options?)`
Get the authenticated user.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `RequestOptions` | no | Per-request headers/params. |

- **Endpoint:** `GET /user`
- **Returns:** the authenticated user object (`login`, `id`, `type`, `name`, `email`, `plan`, `disk_usage`, …).
- Throws `AuthError` on 401.

```js
const me = await client.profile.getAuthenticated();
console.log(me.login);
```

#### `client.profile.updateAuthenticated(userData, options?)`  ⚠️ mutating
Update the authenticated user's profile (validated before sending).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userData` | `UserUpdateData` | yes | Fields to update (see below). |
| `options` | `RequestOptions` | no | Per-request options. |

`UserUpdateData` fields (all optional): `name` (string ≤255), `email` (string|null),
`blog` (string ≤255), `company` (string ≤255), `location` (string ≤255), `bio` (string ≤160),
`twitter_username` (string ≤15), `hireable` (boolean).

- **Endpoint:** `PATCH /user`
- **Returns:** updated user object.
- Throws `ValidationError` on invalid input, `AuthError` on 401/403.

```js
await client.profile.updateAuthenticated({ name: 'New Name', bio: 'Updated bio', location: 'NYC' });
```

#### `client.profile.getPublicProfile(options?)`
Convenience: fetch authenticated user then filter to public-only fields.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `GET /user` (client-side filtered).
- **Returns:** `Record<string, unknown>` containing only public fields (`login`, `id`, `name`, `bio`, `public_repos`, …).

#### `client.profile.checkPermissions(scopes?)`
Check whether the token has the given OAuth scopes (read from response headers).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `scopes` | `string[]` | no (default `[]`) | Required scopes to check for. |

- **Endpoint:** `GET /rate_limit`
- **Returns:** `PermissionCheckResult` `{ hasPermissions, requiredScopes, availableScopes, missingScopes }`.

#### `client.profile.getPlan(options?)`
Get the user's plan object (or `null`).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `GET /user` (returns `user.plan`).
- **Returns:** plan object `{ name, space, private_repos, collaborators }` or `null`.

#### `client.profile.getDiskUsage(options?)`
Get disk-usage stats from the authenticated user.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `GET /user`
- **Returns:** `DiskUsageInfo` `{ diskUsage, privateRepos, totalPrivateRepos, collaborators }`.

---

### Sub-module: `emails` — `client.emails.*` (`EmailsAPI`)

Authenticated-user email-address management.

#### `client.emails.list(options?)`
List email addresses.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options.per_page` | `number` | no (default 30) | Items per page. |
| `options.page` | `number` | no (default 1) | Page number. |

- **Endpoint:** `GET /user/emails`
- **Returns:** array of email objects (`email`, `primary`, `verified`, `visibility`).
- Throws `AuthError` on 401/403 (`user:email` scope).

```js
const emails = await client.emails.list({ per_page: 50 });
```

#### `client.emails.add(emails, options?)`  ⚠️ mutating
Add one or more email addresses (validated).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `emails` | `string \| string[]` | yes | Email(s) to add (max 100). |
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `POST /user/emails` (body `{ emails: [...] }`)
- **Returns:** array of added email objects.
- Throws `ValidationError` (422), `AuthError` (401/403 `user` scope).

```js
await client.emails.add(['new@example.com']);
```

#### `client.emails.delete(emails, options?)`  ⚠️ mutating
Delete one or more email addresses (validated).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `emails` | `string \| string[]` | yes | Email(s) to delete. |
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `DELETE /user/emails` (body `{ emails: [...] }`)
- **Returns:** `void`.
- Throws `ValidationError` (422), `AuthError` (401/403 `user` scope).

#### `client.emails.getPrimary(options?)`
- **Endpoint:** `GET /user/emails` (filtered).
- **Returns:** the primary email object, or `null`.

#### `client.emails.getVerified(options?)`
- **Endpoint:** `GET /user/emails` (filtered).
- **Returns:** array of verified email objects.

#### `client.emails.getUnverified(options?)`
- **Endpoint:** `GET /user/emails` (filtered).
- **Returns:** array of unverified email objects.

#### `client.emails.exists(email, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string` | yes | Email to check. |

- **Endpoint:** `GET /user/emails` (filtered).
- **Returns:** `boolean`.

#### `client.emails.getStats(options?)`
- **Endpoint:** `GET /user/emails` (aggregated).
- **Returns:** `EmailStats` `{ total, verified, unverified, primary, public, private }`.

#### `client.emails.bulkAdd(emails, options?)`  ⚠️ mutating
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `emails` | `string[]` | yes | Emails to add. |
| `options.continueOnError` | `boolean` | no | If true, add one-by-one and collect failures. |

- **Endpoint:** `POST /user/emails` (one call, or per-email when `continueOnError`).
- **Returns:** `BulkAddResult` `{ successful: [...], failed: [{ email, error }] }`.

#### `client.emails.bulkDelete(emails, options?)`  ⚠️ mutating
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `emails` | `string[]` | yes | Emails to delete. |
| `options.continueOnError` | `boolean` | no | If true, delete one-by-one and collect failures. |

- **Endpoint:** `DELETE /user/emails` (one call, or per-email when `continueOnError`).
- **Returns:** `BulkDeleteResult` `{ successful: [...], failed: [{ email, error }] }`.

---

### Sub-module: `discovery` — `client.discovery.*` (`DiscoveryAPI`)

Public user discovery (no special scope needed beyond a valid token).

#### `client.discovery.list(options?)`
List all GitHub users.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options.since` | `number` | no | A user ID; results start after it. |
| `options.per_page` | `number` | no (1–100) | Items per page. |
| `options.page` | `number` | no | Page number. |

- **Endpoint:** `GET /users`
- **Returns:** array of user summary objects.

```js
const users = await client.discovery.list({ since: 0, per_page: 50 });
```

#### `client.discovery.getByUsername(username, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | `string` | yes | GitHub login (validated format). |
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `GET /users/{username}`
- **Returns:** full public user object.
- Throws `ValidationError` (bad format), `NotFoundError` (404).

```js
const u = await client.discovery.getByUsername('octocat');
```

#### `client.discovery.getById(accountId, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | `number` | yes | Positive integer user ID. |
| `options` | `RequestOptions` | no | Per-request options. |

- **Endpoint:** `GET /user/{account_id}`
- **Returns:** public user object.
- Throws `ValidationError`, `NotFoundError` (404).

#### `client.discovery.search(criteria?, options?)`
Client-side-filtered listing.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `criteria.type` | `string` | no | Filter to `type` (e.g. `User`/`Organization`). |
| `criteria.minId` | `number` | no | Min ID (maps to `since = minId - 1`). |
| `criteria.maxId` | `number` | no | Max ID (client-side filter). |

- **Endpoint:** `GET /users` (then filtered in memory).
- **Returns:** filtered array of users.

#### `client.discovery.exists(username, options?)`
- **Endpoint:** `GET /users/{username}`.
- **Returns:** `boolean` (false on `NotFoundError`).

#### `client.discovery.getPublicReposCount(username, options?)`
- **Endpoint:** `GET /users/{username}` → `public_repos`. **Returns:** `number`.

#### `client.discovery.getFollowerCount(username, options?)`
- **Endpoint:** `GET /users/{username}` → `followers`. **Returns:** `number`.

#### `client.discovery.getFollowingCount(username, options?)`
- **Endpoint:** `GET /users/{username}` → `following`. **Returns:** `number`.

#### `client.discovery.getMultipleByUsername(usernames, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `usernames` | `string[]` | yes | Logins to fetch. |
| `options.continueOnError` | `boolean` | no | Collect failures instead of throwing. |

- **Endpoint:** `GET /users/{username}` (one per username).
- **Returns:** `MultipleUsersResult` `{ successful: [...], failed: [{ username, error }] }`.

#### `client.discovery.getStats(username, options?)`
- **Endpoint:** `GET /users/{username}` (derived).
- **Returns:** `UserStats` `{ username, name, id, type, siteAdmin, publicRepos, publicGists, followers, following, accountAge, lastActivity, hasCompany, hasLocation, hasBlog, hasBio, hireable }`.

#### `client.discovery.getByType(type, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | yes | `'User'` or `'Organization'` (else `ValidationError`). |

- **Endpoint:** `GET /users` (filtered). **Returns:** array of users.

#### `client.discovery.getByIdRange(minId, maxId, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `minId` | `number` | yes | Positive integer, ≤ `maxId`. |
| `maxId` | `number` | yes | Positive integer. |

- **Endpoint:** `GET /users` (filtered). **Returns:** array of users.

---

### Sub-module: `context` — `client.context.*` (`ContextAPI`)

User hovercard / contextual information.

#### `client.context.getForUser(username, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | `string` | yes | GitHub login (validated). |
| `options.subject_type` | `string` (enum) | no | One of `repository`, `issue`, `pull_request`, `organization`. |
| `options.subject_id` | `string` | no | ID of the subject (used only with `subject_type`). |

- **Endpoint:** `GET /users/{username}/hovercard` (`?subject_type=&subject_id=`)
- **Returns:** hovercard object with `contexts: [{ message, octicon }]`.
- Throws `ValidationError` (bad username/subject_type), `NotFoundError` (404), `AuthError` (401).

```js
const card = await client.context.getForUser('octocat', { subject_type: 'repository', subject_id: '1300192' });
```

#### `client.context.getForUserInRepository(username, repositoryId, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | `string` | yes | Login. |
| `repositoryId` | `string \| number` | yes | Repo ID (sets `subject_type='repository'`). |

- **Endpoint:** `GET /users/{username}/hovercard?subject_type=repository&subject_id=...`

#### `client.context.getForUserInOrganization(username, organizationId, options?)`
- **Endpoint:** `GET /users/{username}/hovercard?subject_type=organization&subject_id=...`

#### `client.context.getForUserInIssue(username, issueId, options?)`
- **Endpoint:** `GET /users/{username}/hovercard?subject_type=issue&subject_id=...`

#### `client.context.getForUserInPullRequest(username, pullRequestId, options?)`
- **Endpoint:** `GET /users/{username}/hovercard?subject_type=pull_request&subject_id=...`

#### `client.context.getForMultipleUsers(usernames, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `usernames` | `string[]` | yes | Logins. |
| `options.continueOnError` | `boolean` | no | Collect failures. |

- **Endpoint:** `GET /users/{username}/hovercard` (one per username).
- **Returns:** `MultipleUsersContextResult` `{ successful: [{ username, context }], failed: [{ username, error }] }`.

#### `client.context.hasContextInSubject(username, subjectType, subjectId, options?)`
- **Endpoint:** `GET /users/{username}/hovercard?subject_type=&subject_id=`.
- **Returns:** `boolean`.

#### `client.context.getSummary(username, options?)`
- **Endpoint:** `GET /users/{username}/hovercard`.
- **Returns:** `ContextSummary` `{ username, hasContext, messageCount, messages, subjectType, subjectId }`.

#### `client.context.compareContextAcrossSubjects(username, subjects, options?)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | `string` | yes | Login. |
| `subjects` | `ContextSubject[]` | yes | `[{ type, id }, ...]`. |

- **Endpoint:** `GET /users/{username}/hovercard` (one per subject).
- **Returns:** `ContextComparison` `{ username, subjects: [...], totalSubjects, subjectsWithContext }`.

#### `client.context.extractMessages(hovercardResponse)` (sync helper)
- **Returns:** `string[]` of `contexts[].message` values. No network call.

---

## Convenience Functions

Top-level helpers (each constructs a fresh client internally; accept `UsersClientOptions`):

| Function | Signature | Wraps | Returns |
|----------|-----------|-------|---------|
| `createClient` | `(options?) => UsersClient` | `new UsersClient` | client instance |
| `getAuthenticatedUser` | `(options?) => Promise<any>` | `client.profile.getAuthenticated()` | user |
| `getUser` | `(username, options?) => Promise<any>` | `client.discovery.getByUsername()` | user |
| `listUsers` | `(options? & ListUsersOptions) => Promise<any[]>` | `client.discovery.list()` | users |
| `listEmails` | `(options?) => Promise<any[]>` | `client.emails.list()` | emails |

Each API module is also exported as a namespace (`profile`, `emails`, `discovery`, `context`)
exposing standalone functions that take an `HttpClient` as the first argument, e.g.:
`profile.getAuthenticated(http, options?)`, `profile.updateAuthenticated(http, userData, options?)`,
`emails.list(http, options?)`, `emails.add(http, emails, options?)`,
`emails.deleteEmails(http, emails, options?)`, `discovery.list(http, options?)`,
`discovery.getByUsername(http, username, options?)`, `discovery.getById(http, accountId, options?)`,
`context.getForUser(http, username, options?)`, etc.

Pagination/validation utilities are also exported: `paginate(apiCall, options?)` (async
iterator), `paginateAll(apiCall, options?)` (collects all pages), `validateInput(value, name, rules?)`,
`validateEmail(email)`.

```js
import { getUser, getAuthenticatedUser, listEmails } from '@internal/github-sdk-users';
const octo = await getUser('octocat', { token: process.env.GITHUB_TOKEN });
const me   = await getAuthenticatedUser({ token: process.env.GITHUB_TOKEN });
```

`packageInfo` = `{ name: '@github-api/users', version: '1.0.0', description: 'GitHub Users API client and CLI', homepage: 'https://github.com/github-api-module/users' }`.

---

## Errors

All errors extend `UsersError` (which extends `Error`). Defined in `src/utils/errors.ts`.

| Class | Extra fields | When thrown |
|-------|--------------|-------------|
| `UsersError` | `status: number\|null`, `response: ErrorBodyLike\|null`; `toJSON()` | Base class; generic/non-OK responses (default branch), network errors, timeouts. |
| `AuthError` | (inherits) | 401 responses, 403 non-rate-limit, missing/invalid token at construction, hovercard 401. |
| `ValidationError` | `errors: ValidationErrorDetail[]`; `getValidationErrors()`, `getFieldErrors(field)` | 422 responses, invalid input (username, email, user-update, pagination, type, ID range). |
| `RateLimitError` | `resetTime: Date\|null`, `limit: number\|null`, `remaining: number`; `getTimeUntilReset()`, `getTimeUntilResetString()` | 403 responses whose message includes "rate limit". |
| `NetworkError` | `originalError: Error\|null` | Declared for network failures (the HTTP layer currently wraps connection errors in `UsersError`). |
| `NotFoundError` | `status` defaults to 404 | 404 responses (`getByUsername`, `getById`, hovercard). |
| `ForbiddenError` | `status` defaults to 403 | 403 non-rate-limit via `createErrorFromResponse()` helper. |

Helper functions: `createErrorFromResponse(response, data)`, `isRetryableError(error)`
(true for `NetworkError`, 5xx, 408, 429), `getRetryDelay(error, attempt?)` (rate-limit
reset delay, else exponential backoff with jitter).

> Note: the live `HttpClient.createError()` maps 401→`AuthError`, 403(rate limit)→`RateLimitError`,
> 403(other)→`AuthError`, 422→`ValidationError`, everything else→`UsersError`. 404 is **not**
> mapped to `NotFoundError` by the HTTP layer; `NotFoundError` is raised by individual API
> methods that inspect `error.status === 404`.

---

## CLI

- **bin name:** `gh-users` (entry `dist/esm/cli.js`).
- Built on `commander`, `chalk`, `ora`; loads `.env` via `dotenv`.

**Global options** (apply to all commands):

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --token <token>` | GitHub PAT | — |
| `--base-url <url>` | API base URL | `https://api.github.com` |
| `--timeout <ms>` | Request timeout | `10000` |
| `--no-rate-limit` | Disable rate limiting | (rate limiting on) |
| `-v, --verbose` | Verbose logging | off |
| `-q, --quiet` | Suppress non-error output | off |
| `--json` | Output JSON | off |
| `--no-color` | Disable colored output | (color on) |

**Token passing:** `--token` flag if given, otherwise `getAuth()` resolution chain
(`GITHUB_TOKEN` → `GH_TOKEN` → `GITHUB_API_TOKEN` → `~/.config/gh/hosts.yml` → `./.env`).
No token → `AuthError` and exit code 1.

**Commands:**

| Command (aliases) | Args / options | SDK call | Endpoint |
|-------------------|----------------|----------|----------|
| `profile show` (`me show`) | — | `client.profile.getAuthenticated()` | `GET /user` |
| `profile update` | `--name --bio --company --location --blog --twitter --hireable --not-hireable` | `client.profile.updateAuthenticated()` ⚠️ | `PATCH /user` |
| `email list` (`emails list`) | `--verified --unverified --primary` | `emails.list/getVerified/getUnverified/getPrimary` | `GET /user/emails` |
| `email add <emails...>` | positional emails | `client.emails.add()` ⚠️ | `POST /user/emails` |
| `email delete <emails...>` (`remove`) | positional emails | `client.emails.delete()` ⚠️ | `DELETE /user/emails` |
| `user get <username>` (`users get`) | positional username | `client.discovery.getByUsername()` | `GET /users/{username}` |
| `user list` (`users list`) | `--since <id> --per-page <count> --type <type>` | `client.discovery.list()` | `GET /users` |
| `context get <username>` (`hovercard get`) | `--subject-type <type> --subject-id <id>` | `client.context.getForUser()` | `GET /users/{username}/hovercard` |
| `auth-test` | — | `client.testAuth()` | `GET /rate_limit` |

**Output format:** human-readable formatted text by default (via `formatUser`, `formatEmails`,
`formatUserTable`, `formatUserContext`, `formatSuccess`/`formatInfo`/`formatError`); pass
`--json` for `JSON.stringify(..., null, 2)`. Errors print red and exit 1; `--verbose` adds
response details/stack.

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
gh-users --proxy http://proxy.example.test:8080 <command>
gh-users --proxy-bypass 'ghe.internal,.corp.example' <command>
gh-users --no-proxy <command>
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

Build a single-page web app to exercise every capability above against the **live GitHub API**.

1. **Token field (top, memory only).** A single PAT input at the top of the page; hold it in
   memory only (no localStorage, no cookies, no persistence). Mark it `type="password"`. Every
   request uses it as `token`/`Authorization: Bearer <token>`. Also expose an optional **Base URL**
   field (default `https://api.github.com`) for GHE.

2. **Left nav grouped by sub-module.** Four groups: **Profile** (`profile.*`), **Emails**
   (`emails.*`), **Discovery** (`discovery.*`), **Context** (`context.*`), plus a **Client**
   group for `testAuth` / `getRateLimit`. List each capability (`###` heading above) as a
   clickable item that opens its form panel.

3. **Auto-generate one form per capability** from its param table. Map TS types to widgets:
   - `string` → text input
   - `number` → number input
   - `boolean` → checkbox (e.g. `continueOnError`, `hireable`)
   - **enum** → `<select>`. Known enums:
     - `subject_type`: `repository`, `issue`, `pull_request`, `organization`
     - `discovery.getByType` / `user list --type` `type`: `User`, `Organization`
     - email-list mode: `verified`, `unverified`, `primary`, `all`
   - `string[]` (e.g. email lists, `usernames`) → repeatable text rows / "add another" control
   - object payloads (`userData`, `subjects[]={type,id}`, `criteria`) → JSON editor or a small
     sub-form mirroring the field list (e.g. `UserUpdateData` → name/bio/company/location/blog/
     twitter_username/hireable inputs).
   - `options` (`RequestOptions`) → optional collapsible "advanced" panel (`per_page`, `page`,
     custom headers).

4. **Submit → call the SDK method (or the REST endpoint directly).** On submit, invoke the
   listed `client.<module>.<fn>(...)` / REST call shown for each capability. Render in the result
   panel: the returned **JSON** (pretty-printed), the **HTTP status**, the **rate-limit headers**
   (`x-ratelimit-limit` / `-remaining` / `-reset`, surfaced by the SDK as `_rateLimit`), and on
   failure the **error** mapped per §Errors (show `name`, `message`, `status`, and `response`;
   for `RateLimitError` show `getTimeUntilResetString()`; for `ValidationError` show `errors[]`).

5. **Live network warning.** All calls hit `https://api.github.com` and require a real PAT —
   surface this near the token field. Read-only discovery/context calls only need a valid token;
   profile/email writes need `user` / `user:email` scopes.

6. **Flag mutating verbs with a confirm step.** Require an explicit confirmation dialog before
   running any ⚠️-marked capability: `profile.updateAuthenticated`, `emails.add`, `emails.delete`,
   `emails.bulkAdd`, `emails.bulkDelete` (and their CLI equivalents `profile update`,
   `email add`, `email delete`). These mutate the authenticated account.

7. **Single-user manual testing, no persistence.** This is a manual exerciser for one operator —
   no accounts, no saved history, no server-side storage. Keep results in-page only.
