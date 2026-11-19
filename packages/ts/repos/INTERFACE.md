# @internal/github-sdk-repos — Interface

A TypeScript SDK + CLI for the **GitHub Repositories REST API domain**. It provides a `RepoClient` whose sub-modules cover the full repository management surface: repository CRUD and metadata, collaborators and invitations, branches and branch-protection, tags and releases, webhooks, security/vulnerability-alert settings, and repository rulesets. All calls hit `https://api.github.com` and require a GitHub Personal Access Token (PAT). This document is the source of truth for generating a single-user **UI workbench** that exercises every capability against the live GitHub API.

- npm name: `@internal/github-sdk-repos` (version `0.0.1`; note: internal `packageInfo`/docstrings self-describe as `@github-api/repos` v `1.0.0`)
- bin: `gh-repo`
- module type: ESM (`"type": "module"`), dual ESM/CJS build under `dist/`.

---

## Install & Import

```bash
npm install @internal/github-sdk-repos
```

ESM (default + named):

```javascript
// default export is the RepoClient class
import RepoClient from '@internal/github-sdk-repos';

// named exports
import {
  createClient, RepoClient,
  repositories, collaborators, branches, tags, webhooks, security, rules,
  RepoError, AuthError, ValidationError, RateLimitError,
  paginate, paginateAll, validateInput, validateRepository,
  getRepository, listRepositories, createRepository,
  packageInfo
} from '@internal/github-sdk-repos';
```

CommonJS:

```javascript
const RepoClient = require('@internal/github-sdk-repos').default;
const { createClient } = require('@internal/github-sdk-repos');
```

### `exports` subpaths

| Subpath | Gives you |
|---------|-----------|
| `.` | Main barrel: `RepoClient` (default), `createClient`, the seven API modules, error classes, pagination/validation utils, convenience functions, `packageInfo`. |
| `./client` | The `RepoClient` class module directly (`RepoClient`, `createClient`, and its types `RepoClientOptions`, `PingResult`, `RepoPaginator`). |
| `./types` | Type-only barrel: `RepoClientOptions`, `PingResult`, `RepoPaginator`, HTTP types (`HTTPClientConfig`, `HTTPClientOptions`, `RateLimitingConfig`, `RateLimitStatus`, `RequestOptions`), auth types (`AuthManagerOptions`, `AuthTypeValue`, `RepoPermissions`), validation types (`RepositoryData`, `PaginationValidationOptions`, `SortValidationOptions`, `WebhookConfigData`, `ValidationRule`), pagination types (`PaginationOptions`, `PaginationInfo`, `PaginationLinks`), error types (`ErrorResponseLike`, `ErrorBodyLike`). |

---

## Authentication

A GitHub token is supplied to the client; the SDK sends it as an `Authorization: Bearer <token>` header (see `auth.ts` `getAuthHeader`). Other request headers it sets: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent`.

Token resolution order in `RepoClient.setupAuth(options)`:

1. `options.token` (string) — used directly.
2. `options.auth` — either a token string or an `AuthManagerOptions` object.
3. Environment fallback via `getTokenFromEnvironment()`, which reads, in order: **`GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_ACCESS_TOKEN`, `GITHUB_PAT`** (`process.env[...]`).

**No token → throws `AuthError`** at construction time: `"Authentication required. Provide token via options.token, options.auth, or GITHUB_TOKEN environment variable"`. (Token format that isn't `ghp_`/`github_pat_` only logs a console warning, it does not throw.)

Auth types (`AuthType`): `token`, `oauth` (both send `Bearer <token>`), and `github_app` (JWT generation is **not implemented** — throws `AuthError`). Use a PAT.

Base URL option: `options.baseUrl`, default `https://api.github.com`.

---

## Client Construction

```javascript
import { createClient, RepoClient } from '@internal/github-sdk-repos';

const client = createClient({ token: process.env.GITHUB_TOKEN });
// equivalent:
const client2 = new RepoClient({ token: process.env.GITHUB_TOKEN });
```

`createClient(options)` is a thin wrapper around `new RepoClient(options)`. Construction is synchronous; it does **not** validate the token until you call a method (or `client.initialize()`).

### `RepoClientOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | — | GitHub PAT. If omitted, falls back to `auth`, then env vars. |
| `baseUrl` | `string` | `https://api.github.com` | API base URL. |
| `timeout` | `number` | `10000` | Per-request timeout in ms (AbortController). |
| `rateLimiting` | `Partial<{ enabled: boolean; padding: number }>` | `{ enabled: true, padding: 100 }` | Client-side throttle: minimum ms gap between requests. |
| `auth` | `string \| AuthManagerOptions` | — | Alternative auth input (token string or `{ token, authType, appId, privateKey, installationId }`). |
| `userAgent` | `string` | `@github-api/repos/1.0.0` | `User-Agent` header. |
| `verbose` | `boolean` | `false` | Logs auth/scope/rate-limit info during `initialize()`. |
| `[key: string]` | `unknown` | — | Extra keys allowed (index signature). |

Client instance members & lifecycle helpers (not GitHub endpoints, useful for the workbench header/status bar):

- `client.repositories` / `.collaborators` / `.branches` / `.tags` / `.webhooks` / `.security` / `.rules` — bound API modules (the `httpClient` first arg is bound away; call as `client.repositories.get(owner, repo)`).
- `await client.initialize()` — validates the token (`GET /user`), checks the `repo` scope (`HEAD /user`), and fetches rate limit (`GET /rate_limit`). Throws `AuthError` on failure.
- `await client.getAuthenticatedUser()` → user object.
- `await client.getRateLimit()` → `RateLimitStatus { remaining, reset: Date|null, used }`.
- `await client.ping()` → `PingResult { success, message, rateLimit?, error? }` (calls `GET /`).
- `client.getConfig()` → `{ baseUrl, timeout, rateLimiting, userAgent, authenticated, initialized }`.
- `client.updateConfig({ token?, baseUrl?, timeout?, rateLimiting? })`.
- `client.paginate(method, ...args)` → `{ [Symbol.asyncIterator], all() }` page-walker.
- `client.destroy()` — nulls out internals.

---

## Capabilities

All access paths below assume `const client = createClient({ token });`. Every endpoint path is relative to `baseUrl`. `owner`/`username`/`org` are validated (alphanumeric + hyphen, ≤39 chars); `repo` is validated (alphanumeric + `._-`, ≤100 chars); `branch`/`tag` names are validated against Git ref rules. Invalid input throws `ValidationError` **before** any network call. Return shapes are raw GitHub JSON unless noted.

> Mutation legend: 🟢 read (GET/HEAD) · 🟡 write (POST/PUT/PATCH) · 🔴 destructive (DELETE / delete-repo / transfer).

### Repositories — `client.repositories.*`

#### `get(owner, repo)` 🟢
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| owner | string | yes | Owner login |
| repo | string | yes | Repo name |

`GET /repos/{owner}/{repo}` → repository object.
```javascript
const repo = await client.repositories.get('octocat', 'Hello-World');
```

#### `listForUser(username, options?)` 🟢
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| username | string | yes | User login |
| options.type | string | no | `all`(default)/`owner`/`member` |
| options.sort | string | no | `created`/`updated`(default)/`pushed`/`full_name` |
| options.direction | string | no | `asc`/`desc`(default) |
| options.page | number | no | default 1 |
| options.per_page | number | no | default 30, max 100 |

`GET /users/{username}/repos?...` → array of repos.
```javascript
const repos = await client.repositories.listForUser('octocat', { sort: 'updated' });
```

#### `listForAuthenticatedUser(options?)` 🟢
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| options.visibility | string | no | `all`(default)/`public`/`private` |
| options.affiliation | string | no | default `owner,collaborator,organization_member` |
| options.type | string | no | default `all` |
| options.sort | string | no | `created`/`updated`(default)/`pushed`/`full_name` |
| options.direction | string | no | `asc`/`desc`(default) |
| options.page / per_page | number | no | 1 / 30 (max 100) |

`GET /user/repos?...` → array of repos.

#### `listForOrg(org, options?)` 🟢
Same `options` shape as `listForUser`. `GET /orgs/{org}/repos?...` → array.

#### `create(repoData)` 🟡
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| repoData.name | string | yes | Repo name (validated) |
| repoData.description | string | no | ≤350 chars |
| repoData.homepage | string | no | ≤255 chars |
| repoData.private | boolean | no | default false |
| repoData.has_issues / has_projects / has_wiki | boolean | no | default true |
| repoData.has_discussions / is_template / auto_init | boolean | no | default false |
| repoData.gitignore_template / license_template | string | no | e.g. `Node`, `mit` |
| repoData.allow_squash_merge / allow_merge_commit / allow_rebase_merge | boolean | no | default true |
| repoData.allow_auto_merge / delete_branch_on_merge / allow_update_branch | boolean | no | default false |
| repoData.topics | string[] | no | ≤20 items, each ≤50 chars, `[a-z0-9-]`; set via a follow-up `PUT .../topics` |

`POST /user/repos` → repository object (then `PUT /repos/{owner}/{repo}/topics` if `topics` present).
```javascript
const repo = await client.repositories.create({ name: 'my-new-repo', private: false });
```

#### `createInOrg(org, repoData)` 🟡
`repoData` as above plus `visibility` and `team_id`. `POST /orgs/{org}/repos` → repository object (topics applied afterward).

#### `update(owner, repo, updates)` 🟡
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| owner / repo | string | yes | |
| updates | object | yes | Arbitrary repo fields (e.g. `description`, `has_issues`, `default_branch`, `name`); `topics` array handled separately via PUT |

`PATCH /repos/{owner}/{repo}` → updated repository.

#### `deleteRepo(owner, repo)` 🔴
`DELETE /repos/{owner}/{repo}` → `{ message: 'Repository deleted successfully' }`.

#### `getAllTopics(owner, repo)` 🟢
`GET /repos/{owner}/{repo}/topics` → `{ names: string[] }`.

#### `replaceAllTopics(owner, repo, topics)` 🟡
`topics: string[]` (≤20, each `[a-z0-9-]` ≤50). `PUT /repos/{owner}/{repo}/topics` → `{ names: string[] }`.

#### `getLanguages(owner, repo)` 🟢
`GET /repos/{owner}/{repo}/languages` → `{ [lang]: bytes }`.

#### `getContributors(owner, repo, options?)` 🟢
`options: { anon?: boolean, page?, per_page? }`. `GET /repos/{owner}/{repo}/contributors?...` → array.

#### `getStats(owner, repo)` 🟢
Aggregates four calls (`getLanguages`, `getContributors`, `GET .../stats/commit_activity`, `GET .../stats/participation`) via `Promise.allSettled` → `{ languages, contributors, commits, participation }` (any field `null` if its call failed).

#### `fork(owner, repo, options?)` 🟡
`options: { organization?, name?, default_branch_only? }`. `POST /repos/{owner}/{repo}/forks` → repository.

#### `listForks(owner, repo, options?)` 🟢
`options.sort`: `newest`(default)/`oldest`/`stargazers`/`watchers`, plus `page`/`per_page`. `GET /repos/{owner}/{repo}/forks?...` → array.

#### `transfer(owner, repo, newOwner, teamIds?)` 🔴
`newOwner: string`, `teamIds: number[]` (optional). `POST /repos/{owner}/{repo}/transfer` → repository.

#### `checkIfStarred(owner, repo)` 🟢
`GET /user/starred/{owner}/{repo}` → `boolean` (404 → false).

#### `star(owner, repo)` 🟡
`PUT /user/starred/{owner}/{repo}` → `{ message }`.

#### `unstar(owner, repo)` 🔴
`DELETE /user/starred/{owner}/{repo}` → `{ message }`.

#### `checkIfWatched(owner, repo)` 🟢
`GET /repos/{owner}/{repo}/subscription` → `boolean` (subscribed flag; 404 → false).

#### `watch(owner, repo, subscribed?, ignored?)` 🟡
`subscribed` default true, `ignored` default false. `PUT /repos/{owner}/{repo}/subscription` → subscription object.

#### `unwatch(owner, repo)` 🔴
`DELETE /repos/{owner}/{repo}/subscription` → `{ message }`.

#### `generateNameSuggestions(baseName)` (local, no network)
Returns a `string[]` of valid name variations. Pure helper.
```javascript
const names = client.repositories.generateNameSuggestions('myapp');
```

### Collaborators — `client.collaborators.*`

#### `list(owner, repo, options?)` 🟢
`options.affiliation`: `all`(default)/`direct`/`outside`, `page`/`per_page`. `GET /repos/{owner}/{repo}/collaborators?...` → array.

#### `checkPermissions(owner, repo, username)` 🟢
`GET /repos/{owner}/{repo}/collaborators/{username}/permission` → permission object (404 → `{ permission: 'none', user: { login } }`).

#### `add(owner, repo, username, options?)` 🟡
`options.permission` one of `pull`/`push`(default)/`admin`/`maintain`/`triage`. `PUT /repos/{owner}/{repo}/collaborators/{username}` → invitation object.
```javascript
await client.collaborators.add('octocat', 'Hello-World', 'newdev', { permission: 'push' });
```

#### `remove(owner, repo, username)` 🔴
`DELETE /repos/{owner}/{repo}/collaborators/{username}` → `{ message }`.

#### `listInvitations(owner, repo, options?)` 🟢
`GET /repos/{owner}/{repo}/invitations?...` → array.

#### `updateInvitation(owner, repo, invitationId, permission)` 🟡
`permission` one of `read`/`write`/`admin`. `PATCH /repos/{owner}/{repo}/invitations/{invitationId}` → invitation.

#### `deleteInvitation(owner, repo, invitationId)` 🔴
`DELETE /repos/{owner}/{repo}/invitations/{invitationId}` → `{ message }`.

#### `listUserInvitations(options?)` 🟢
`GET /user/repository_invitations?...` → array (invitations for the authenticated user).

#### `acceptInvitation(invitationId)` 🟡
`PATCH /user/repository_invitations/{invitationId}`.

#### `declineInvitation(invitationId)` 🔴
`DELETE /user/repository_invitations/{invitationId}` → `{ message }`.

#### `getPermissionLevel(owner, repo, username)` 🟢
Wraps `checkPermissions` → returns the `permission` string.

#### `hasPermission(owner, repo, username, requiredPermission)` 🟢
Compares against hierarchy `none<read<triage<write<maintain<admin` → `boolean`.

#### `bulkAdd(owner, repo, collaborators)` 🟡
`collaborators: { username, permission? }[]`. Calls `add` per entry. → `{ username, success, result?, error? }[]`.

#### `getStats(owner, repo)` 🟢
Lists collaborators (per_page 100) → `{ total, byPermission: {…}, byType: { users, bots } }`.

#### `createPermissionTemplate(level)` (local, no network)
`level`: `read`/`triage`/`write`/`maintain`/`admin` → `{ permission, description }`.

### Branches & Protection — `client.branches.*`

#### `list(owner, repo, options?)` 🟢
`options.protected?: boolean`, `page`/`per_page`. `GET /repos/{owner}/{repo}/branches?...` → array.

#### `get(owner, repo, branch)` 🟢
`GET /repos/{owner}/{repo}/branches/{branch}` → branch object.

#### `getProtection(owner, repo, branch)` 🟢
`GET .../branches/{branch}/protection`.

#### `updateProtection(owner, repo, branch, protection)` 🟡
`protection`: protection-rule object (build one with `createProtectionTemplate`). `PUT .../branches/{branch}/protection`.

#### `removeProtection(owner, repo, branch)` 🔴
`DELETE .../branches/{branch}/protection` → `{ message }`.

#### `getRequiredStatusChecks(owner, repo, branch)` 🟢
`GET .../protection/required_status_checks`.

#### `updateRequiredStatusChecks(owner, repo, branch, options)` 🟡
`PATCH .../protection/required_status_checks`. `options`: object.

#### `removeRequiredStatusChecks(owner, repo, branch)` 🔴
`DELETE .../protection/required_status_checks` → `{ message }`.

#### `getRequiredStatusCheckContexts(owner, repo, branch)` 🟢
`GET .../required_status_checks/contexts` → string[].

#### `addRequiredStatusCheckContexts(owner, repo, branch, contexts)` 🟡
`contexts: string[]`. `POST .../required_status_checks/contexts`.

#### `setRequiredStatusCheckContexts(owner, repo, branch, contexts)` 🟡
`contexts: string[]`. `PUT .../required_status_checks/contexts`.

#### `removeRequiredStatusCheckContexts(owner, repo, branch, contexts)` 🔴
`contexts: string[]`. `DELETE .../required_status_checks/contexts` (array sent as body).

#### `getPullRequestReviewProtection(owner, repo, branch)` 🟢
`GET .../protection/required_pull_request_reviews`.

#### `updatePullRequestReviewProtection(owner, repo, branch, options)` 🟡
`PATCH .../protection/required_pull_request_reviews`. `options`: object.

#### `removePullRequestReviewProtection(owner, repo, branch)` 🔴
`DELETE .../protection/required_pull_request_reviews` → `{ message }`.

#### `getAdminEnforcement(owner, repo, branch)` 🟢
`GET .../protection/enforce_admins`.

#### `addAdminEnforcement(owner, repo, branch)` 🟡
`POST .../protection/enforce_admins`.

#### `removeAdminEnforcement(owner, repo, branch)` 🔴
`DELETE .../protection/enforce_admins` → `{ message }`.

#### `getRestrictions(owner, repo, branch)` 🟢
`GET .../protection/restrictions`.

#### `removeRestrictions(owner, repo, branch)` 🔴
`DELETE .../protection/restrictions` → `{ message }`.

#### `getUserRestrictions(owner, repo, branch)` 🟢
`GET .../protection/restrictions/users`.

#### `addUserRestrictions(owner, repo, branch, users)` 🟡
`users: string[]`. `POST .../restrictions/users`.

#### `setUserRestrictions(owner, repo, branch, users)` 🟡
`users: string[]`. `PUT .../restrictions/users`.

#### `removeUserRestrictions(owner, repo, branch, users)` 🔴
`users: string[]`. `DELETE .../restrictions/users` (array body).

#### `getTeamRestrictions(owner, repo, branch)` 🟢
`GET .../protection/restrictions/teams`.

#### `addTeamRestrictions(owner, repo, branch, teams)` 🟡
`teams: string[]`. `POST .../restrictions/teams`.

#### `setTeamRestrictions(owner, repo, branch, teams)` 🟡
`teams: string[]`. `PUT .../restrictions/teams`.

#### `removeTeamRestrictions(owner, repo, branch, teams)` 🔴
`teams: string[]`. `DELETE .../restrictions/teams` (array body).

#### `rename(owner, repo, branch, newName)` 🟡
`POST .../branches/{branch}/rename` body `{ new_name }`.

#### `merge(owner, repo, options)` 🟡
`options: { base: string, head: string, commit_message? }`. `POST /repos/{owner}/{repo}/merges` → merge commit.
```javascript
await client.branches.merge('octocat', 'Hello-World', { base: 'main', head: 'feature' });
```

#### `compare(owner, repo, base, head)` 🟢
`GET /repos/{owner}/{repo}/compare/{base}...{head}` → comparison.

#### `createProtectionTemplate(options?)` (local, no network)
Builds a protection-rule object for `updateProtection`. `options` includes `requireStatusChecks`, `strict`, `contexts[]`, `enforceAdmins`, `requirePullRequestReviews`, `requiredReviewers`, `dismissStaleReviews`, `requireCodeOwnerReviews`, `requireLastPushApproval`, `requireReviewThreadResolution`, `restrictions`, `restrictedUsers[]`, `restrictedTeams[]`, `restrictedApps[]`, `allowForcePushes`, `allowDeletions`, `blockCreations`, `requireConversationResolution`.

### Tags & Releases — `client.tags.*`

#### `list(owner, repo, options?)` 🟢
`GET /repos/{owner}/{repo}/tags?...` → array.

#### `get(owner, repo, tag)` 🟢
`GET /repos/{owner}/{repo}/git/refs/tags/{tag}` → ref object.

#### `create(owner, repo, tagData)` 🟡
`tagData: { tag, message?, object (SHA, required), type ('commit'|'tree'|'blob', required), tagger? }`. `POST /repos/{owner}/{repo}/git/tags` → annotated tag object.

#### `createRef(owner, repo, tag, sha)` 🟡
`POST /repos/{owner}/{repo}/git/refs` body `{ ref: 'refs/tags/{tag}', sha }`.

#### `deleteTag(owner, repo, tag)` 🔴
`DELETE /repos/{owner}/{repo}/git/refs/tags/{tag}` → `{ message }`.

#### `getProtection(owner, repo)` 🟢
`GET /repos/{owner}/{repo}/tags/protection` → array.

#### `createProtection(owner, repo, pattern)` 🟡
`pattern: string`. `POST /repos/{owner}/{repo}/tags/protection`.

#### `deleteProtection(owner, repo, tagProtectionId)` 🔴
`DELETE /repos/{owner}/{repo}/tags/protection/{id}` → `{ message }`.

#### `listReleases(owner, repo, options?)` 🟢
`GET /repos/{owner}/{repo}/releases?...` → array.

#### `getReleaseByTag(owner, repo, tag)` 🟢
`GET /repos/{owner}/{repo}/releases/tags/{tag}` → release.

#### `createRelease(owner, repo, releaseData)` 🟡
`releaseData: { tag_name (required), target_commitish? (default 'main'), name?, body?, draft?, prerelease?, generate_release_notes? }`. `POST /repos/{owner}/{repo}/releases` → release.
```javascript
await client.tags.createRelease('octocat', 'Hello-World', { tag_name: 'v1.0.0', name: 'v1.0.0' });
```

#### `compare(owner, repo, base, head)` 🟢
`GET /repos/{owner}/{repo}/compare/{base}...{head}`.

#### `getCommit(owner, repo, tag)` 🟢
Resolves the tag ref then `GET .../git/commits/{sha}` (handles annotated tags). → commit.

#### `getLatest(owner, repo)` 🟢
`list(..., { per_page: 1 })` → first tag or `null`.

#### `exists(owner, repo, tag)` 🟢
→ `boolean` (via `get`; 404 → false).

#### `getAllTags(owner, repo)` 🟢
Walks pages (per_page 100, ≤100 pages) → `unknown[]`.

#### `createSemanticTag(owner, repo, version, sha, options?)` 🟡
Validates semver, `options: { annotated?, message?, tagger? }`. If annotated: `create` + `createRef`; else `createRef`. → tag/ref.

#### `getNextSemanticVersion(currentVersion, increment?)` (local)
`increment`: `major`/`minor`/`patch`(default) → next version string.

#### `sortTagsBySemanticVersion(tags, descending?)` (local)
Sorts a `{ name }[]` array by semver.

### Webhooks — `client.webhooks.*`

#### `list(owner, repo, options?)` 🟢
`GET /repos/{owner}/{repo}/hooks?...` → array.

#### `get(owner, repo, hookId)` 🟢
`GET /repos/{owner}/{repo}/hooks/{hookId}` → webhook.

#### `create(owner, repo, webhookData)` 🟡
`webhookData: { name? (default 'web'), config (required), events? (default ['push']), active? (default true) }`. `config: { url (required, valid URL), content_type? ('json'|'form'), insecure_ssl?, secret? }`. `POST /repos/{owner}/{repo}/hooks` → webhook.
```javascript
await client.webhooks.create('octocat', 'Hello-World', {
  config: { url: 'https://example.com/hook', content_type: 'json' },
  events: ['push', 'pull_request']
});
```

#### `update(owner, repo, hookId, updates)` 🟡
`updates: { config?, events?, active?, ... }` (config validated if present). `PATCH /repos/{owner}/{repo}/hooks/{hookId}` → webhook.

#### `deleteHook(owner, repo, hookId)` 🔴
`DELETE /repos/{owner}/{repo}/hooks/{hookId}` → `{ message }`.

#### `test(owner, repo, hookId)` 🟡
`POST /repos/{owner}/{repo}/hooks/{hookId}/tests`.

#### `ping(owner, repo, hookId)` 🟡
`POST /repos/{owner}/{repo}/hooks/{hookId}/pings`.

### Security — `client.security.*`

#### `getSecurityAnalysis(owner, repo)` 🟢
`GET /repos/{owner}/{repo}/security-analysis`.

#### `updateSecurityAnalysis(owner, repo, settings)` 🟡
`settings`: object. `PATCH /repos/{owner}/{repo}/security-analysis`.

#### `getVulnerabilityAlerts(owner, repo)` 🟢
`GET /repos/{owner}/{repo}/vulnerability-alerts` → `{ enabled: boolean }` (404 → `{ enabled: false }`).

#### `enableVulnerabilityAlerts(owner, repo)` 🟡
`PUT /repos/{owner}/{repo}/vulnerability-alerts`.

#### `disableVulnerabilityAlerts(owner, repo)` 🔴
`DELETE /repos/{owner}/{repo}/vulnerability-alerts` → `{ message }`.

### Rulesets — `client.rules.*`

#### `listRulesets(owner, repo, options?)` 🟢
`options.includes_parents?: boolean`, `page`/`per_page`. `GET /repos/{owner}/{repo}/rulesets?...` → array.

#### `getRuleset(owner, repo, rulesetId)` 🟢
`GET /repos/{owner}/{repo}/rulesets/{rulesetId}` → ruleset.

#### `createRuleset(owner, repo, rulesetData)` 🟡
`rulesetData`: object. `POST /repos/{owner}/{repo}/rulesets` → ruleset.

#### `updateRuleset(owner, repo, rulesetId, updates)` 🟡
`updates`: object. `PUT /repos/{owner}/{repo}/rulesets/{rulesetId}` → ruleset.

#### `deleteRuleset(owner, repo, rulesetId)` 🔴
`DELETE /repos/{owner}/{repo}/rulesets/{rulesetId}` → `{ message }`.

---

## Convenience Functions

Top-level exports that construct a client internally (each accepts `RepoClientOptions`):

#### `getRepository(owner, repo, options?)`
```javascript
import { getRepository } from '@internal/github-sdk-repos';
const repo = await getRepository('octocat', 'Hello-World', { token: process.env.GITHUB_TOKEN });
```
Wraps `client.repositories.get`.

#### `listRepositories(username?, options?)`
`options` is `RepoClientOptions & RepoListOptions`. If `username` given → `listForUser`, else → `listForAuthenticatedUser`.
```javascript
const repos = await listRepositories('octocat', { token, type: 'public', sort: 'updated' });
```

#### `createRepository(repoData, options?)`
Wraps `client.repositories.create`.
```javascript
const repo = await createRepository({ name: 'my-new-repo', private: false }, { token });
```

Also exported as standalone utilities: `paginate(httpClient, endpoint, options?)`, `paginateAll(httpClient, endpoint, options?)`, `validateInput(value, rules)`, `validateRepository(data)`. `packageInfo` = `{ name, version, description, homepage }`.

---

## Errors

All errors extend `RepoError` (which extends `Error`). Catch the base for generic handling; check `instanceof` for specifics. Common fields: `name`, `message`, `statusCode` (number|null), `response` (ErrorResponseLike|null).

| Class | Extra fields | statusCode | Thrown when |
|-------|--------------|-----------|-------------|
| `RepoError` | `statusCode`, `response` | provided | Base / generic API error; 5xx → `"Server error: …"`. |
| `AuthError` | — | 401 (default) | No token at construction; invalid/expired token (`GET /user` 401); missing required scope; unimplemented GitHub App auth. |
| `ValidationError` | `field`, `value` | null | Invalid input (bad owner/repo/branch/tag name, bad pagination/sort, bad topics/webhook config, etc.) **before** network; also GitHub 422. |
| `RateLimitError` | `resetTime` (epoch ms \| null), `resetAt: Date \| null`, `remaining`; `getTimeUntilReset(): number` (ms) | 429 | GitHub 429, or 403 whose message contains "rate limit". Drives retry timing. |
| `NetworkError` | `originalError` | null | fetch failure or request timeout (`"Request timeout after {ms}ms"`). Retryable. |
| `NotFoundError` | `resource`, `identifier` | 404 | GitHub 404 (`"{resource} '{identifier}' not found"`). |
| `ForbiddenError` | — | 403 | GitHub 403 not related to rate limiting. |
| `ConflictError` | `resource` | 409 | GitHub 409 (e.g. resource already exists). |
| `GitHubAPIError` | `errors[]`, `documentation_url` | provided | Other non-2xx GitHub responses; has `isRateLimit()`, `isForbidden()`, `isNotFound()`. |

Only `RepoError`, `AuthError`, `ValidationError`, `RateLimitError` are exported from the package barrel `.`. The rest (`NetworkError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `GitHubAPIError`, `ErrorFactory`, `errorUtils`) are produced internally by `ErrorFactory.fromResponse` based on status code; a workbench should `catch (e)` and read `e.name`/`e.statusCode`/`e.message` (+ `e.field` for validation, `e.resetTime` for rate limits, `e.errors` for API validation lists). `errorUtils.formatForConsole(e)` produces a human-readable string.

---

## CLI

Bin: **`gh-repo`** (`./dist/esm/cli.js`). Built on `commander` + `chalk` (color) + `ora` (spinners) + `inquirer` (prompts) + `dotenv`. Output is human-readable tables/chalk by default; `--json` requests JSON.

### Global options (apply to all commands)
| Flag | Description | Default |
|------|-------------|---------|
| `-t, --token <token>` | GitHub PAT | — |
| `--base-url <url>` | API base URL | `https://api.github.com` |
| `--timeout <ms>` | Request timeout | `10000` |
| `--no-rate-limit` | Disable client-side rate limiting | (enabled) |
| `-v, --verbose` | Verbose logging | |
| `-q, --quiet` | Suppress non-error output | |
| `--json` | Output as JSON | |
| `--no-color` | Disable colored output | |

Token resolution in the CLI: `--token` → global `--token` → saved config file (`~/.github-repos/config.json`) → `GITHUB_TOKEN` env var. Missing → `AuthError` with a tip to run `gh-repo config setup`.

### Commands

- `gh-repo repo get <owner> <repo>` (alias group `repository`) — `--full` for full details.
- `gh-repo repo list [user]` (alias `ls`) — `--type <type>` (default `all`), `--sort <sort>` (default `updated`), `--direction <dir>` (default `desc`), `--limit <n>` (default 30). No `[user]` → authenticated user's repos.
- `gh-repo repo create <name>` — `-d, --description <desc>`, `--private`, `--init` (README), `--template <template>`, `--org <organization>`. 🟡
- `gh-repo repo delete <owner> <repo>` (alias `rm`) — `--force` to skip the interactive confirm prompt. 🔴
- `gh-repo branch list <owner> <repo>` (alias `ls`) — `--protected` to show only protected branches.
- `gh-repo collaborator list <owner> <repo>` (aliases group `collab`, sub `ls`).
- `gh-repo config setup` — interactive setup (token, baseUrl, timeout, rate limiting, output format, colors, verbose) saved to `~/.github-repos/config.json`.
- `gh-repo config show` — prints current config as JSON.
- `gh-repo help [command]`, `--version`.

Note: the CLI surfaces only a subset of the SDK (repo get/list/create/delete, branch list, collaborator list, config). The full capability surface is the SDK in §Capabilities — the workbench should target the SDK, not the CLI.

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
gh-repo --proxy http://proxy.example.test:8080 <command>
gh-repo --proxy-bypass 'ghe.internal,.corp.example' <command>
gh-repo --no-proxy <command>
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

Build a single-page, single-user web app for manually exercising every SDK capability against the live GitHub API. No persistence, no multi-user, no backend required beyond what's needed to call `https://api.github.com` (you can call the REST endpoints directly with `fetch`, replicating the SDK's header/validation behavior, or import this SDK if running in Node).

### Layout
- **Top bar:** a single PAT input (type=password), held **in memory only** — never written to localStorage/cookies. Show a small "Validate token" button that calls `GET /user` and renders the login + `x-oauth-scopes` header. Show a live rate-limit indicator from the last response's `x-ratelimit-remaining` / `x-ratelimit-reset` headers.
- **Left nav:** group capabilities by sub-module exactly as in §Capabilities — **Repositories, Collaborators, Branches & Protection, Tags & Releases, Webhooks, Security, Rulesets**. Each capability is a nav item.
- **Main panel:** an auto-generated form for the selected capability, derived from its parameter table.

### Input-widget mapping
- `string` → text input (use password type for the token only).
- `number` → number input (apply documented min/max, e.g. `per_page` 1–100, `page` 1–1000).
- `boolean` → checkbox.
- string-union / enum → `<select>`. Known enums:
  - repo list `type`: `all`/`owner`/`member`; `sort`: `created`/`updated`/`pushed`/`full_name`; `direction`: `asc`/`desc`; authed-user `visibility`: `all`/`public`/`private`.
  - fork-list `sort`: `newest`/`oldest`/`stargazers`/`watchers`.
  - collaborator `add` permission: `pull`/`push`/`admin`/`maintain`/`triage`; `updateInvitation` permission: `read`/`write`/`admin`.
  - tag `create` type: `commit`/`tree`/`blob`.
  - webhook `config.content_type`: `json`/`form`; `insecure_ssl`: `0`/`1`.
  - semantic-version increment: `major`/`minor`/`patch`.
- `string[]` (topics, contexts, users, teams, events, teamIds) → repeatable add/remove field (number inputs for `teamIds`).
- object / request body (`update` updates, `updateProtection` protection, ruleset data, webhook `config`, `merge` options, release/tag data) → a JSON editor (textarea with JSON parse + validation), optionally pre-filled with a template. For branch protection, offer a "build from template" helper mirroring `createProtectionTemplate` fields.

### Per-capability behavior
- Form fields come from the capability's parameter table in §Capabilities (required vs optional marked accordingly).
- Submit constructs the call: either `client.<module>.<fn>(...args)` (SDK) or the equivalent `fetch` to the documented `METHOD /path` with `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- On success render: pretty-printed JSON response, HTTP status, and the rate-limit response headers.
- On failure render the error per §Errors: show `name`, `statusCode`, `message`, and class-specific fields (`field`/`value` for `ValidationError`, `resetTime`/`remaining` for `RateLimitError`, `errors[]` for `GitHubAPIError`). Mirror the SDK's client-side validation (owner/repo/branch/tag name rules, pagination/sort bounds, topic rules, webhook URL) so bad input is flagged before the request, just like `ValidationError`.

### Destructive-action handling
Flag mutating capabilities and require a confirm step for destructive ones (legend in §Capabilities):
- 🟡 write (POST/PUT/PATCH): visually distinguish (e.g. amber button).
- 🔴 destructive (all DELETE-backed: `deleteRepo`, `transfer`, `unstar`, `unwatch`, every `remove*`/`delete*` across modules, plus protection/restriction removals): require an explicit typed confirmation (e.g. retype `owner/repo`) before sending — mirror the CLI's `repo delete` confirm prompt.

### Notes
- All calls hit `https://api.github.com` and need a real PAT with appropriate scopes (`repo` for most write/admin operations; `public_repo` suffices for some public reads; `delete_repo` for repository deletion).
- The workbench is for manual capability testing, single-user, in-memory only, no persistence required.
