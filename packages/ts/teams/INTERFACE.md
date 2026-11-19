# @internal/github-sdk-teams — Interface

**Purpose:** A TypeScript SDK + CLI for the GitHub Teams REST API. It wraps the
GitHub `/orgs/{org}/teams/*` (and `/users/{username}/teams`) endpoints behind a
single `TeamsClient` class, providing typed methods for managing org teams,
their members, their repositories, their projects, their discussions, and
discussion comments.

**Domain:** GitHub organization teams — team CRUD, membership management,
repository assignment, project (classic) assignment, team discussions, and
discussion comments. All write/read operations require a GitHub personal access
token with appropriate org/team scopes.

---

## Install & Import

**npm name:** `@internal/github-sdk-teams`

**ESM (default + named):**

```js
import TeamsClient, { createClient, models, listTeams } from '@internal/github-sdk-teams';
```

**CJS (require):**

```js
const TeamsClient = require('@internal/github-sdk-teams').default;
const { createClient, models, listTeams } = require('@internal/github-sdk-teams');
```

**`exports` subpaths:** Only the package root (`.`) is exported. There are no
additional subpath exports in `package.json`.

| Subpath | types | import (ESM) | require (CJS) |
|---------|-------|--------------|---------------|
| `.` | `./dist/esm/index.d.ts` | `./dist/esm/index.js` | `./dist/cjs/index.js` |

The default export is `TeamsClient`. Named exports are: `createClient`,
`models` (namespace), and every client method re-exported individually (see
§Capabilities).

---

## Authentication

- **Token option:** Pass `token` (string) to the client constructor / `createClient`.
- **Env var:** `GITHUB_TOKEN` (the only `process.env` reference in source, used by the **CLI** in `src/cli.ts`).
  - The **SDK constructor does NOT read `GITHUB_TOKEN`** — it requires `token` to be passed explicitly in `options`. (The error message mentions the env var, but the constructor itself does not fall back to it.)
  - The **CLI** resolves the token as `--token <token>` flag OR `process.env.GITHUB_TOKEN`.
- **No-token behavior:**
  - SDK: `new TeamsClient({})` (no token) **throws** `Error("GitHub token is required. Provide token in options or set GITHUB_TOKEN environment variable.")`.
  - SDK: a non-string token throws `Error("Token must be a string")`.
  - CLI: if neither flag nor env var is set, prints a red error and exits with code `1`.
- **Auth header:** When a token is present the client sets `Authorization: Bearer <token>`.
- **Base URL:** Defaults to `https://api.github.com`. Overridable via the `baseURL` option.
- **Default headers:** `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`. (Project methods override `Accept` to `application/vnd.github.inertia-preview+json`.) The HTTP layer also adds `Content-Type: application/json`.

---

## Client Construction

**Factory:**

```js
import { createClient } from '@internal/github-sdk-teams';
const client = createClient({ token: process.env.GITHUB_TOKEN });
```

**Constructor:**

```js
import TeamsClient from '@internal/github-sdk-teams';
const client = new TeamsClient({ token: process.env.GITHUB_TOKEN });
```

`createClient(options)` is a thin wrapper that returns `new TeamsClient(options)`.

**Constructor options (`TeamsClientOptions`):**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` (required) | — | GitHub PAT. Required; constructor throws if missing or non-string. Sets `Authorization: Bearer <token>`. |
| `baseURL` | `string` | `https://api.github.com` | API base URL. Also mirrored to `client.baseUrl` for backwards compat. |
| `headers` | `Record<string,string>` | `{}` | Extra headers merged over the defaults (`Accept`, `X-GitHub-Api-Version`). |
| `[key: string]` | `unknown` | — | Additional arbitrary keys are accepted (index signature) but unused. |

**Instance fields:** `token: string`, `baseURL: string`, `baseUrl: string` (alias), `headers: Record<string,string>`.

---

## Capabilities

There are **31 SDK methods** total. Each is available two ways:

1. **Instance method:** `client.<method>(...)`
2. **Named export** (bound to `TeamsClient.prototype`): `import { <method> } from '@internal/github-sdk-teams'` — these are unbound prototype references intended to be called with a client context; the idiomatic usage is the instance method.

All list methods call `validateOptions(options, allowedKeys)`, which only **warns** (via `console.warn`) on unrecognized option keys — it does not throw or strip them. Query params are built by `buildQueryString`, which drops `undefined`/`null`/`''` values and URL-encodes the rest.

GitHub uses `team_slug` (the URL-safe slug), not the numeric team ID, for team-scoped endpoints. Throughout, the parameter named `teamSlug` maps to `{team_slug}`.

### Sub-module: Teams

#### `listTeams(org, options?)`
- **Signature:** `listTeams(org: string, options?: ListOptions): Promise<unknown>`
- **Params:**

  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `org` | string | yes | Organization login. |
  | `options.per_page` | number | no | Results per page. |
  | `options.page` | number | no | Page number. |
- **Endpoint:** `GET /orgs/{org}/teams`
- **Returns:** array of Team objects (see `TeamSchema`).
- **Example:**
  ```js
  const teams = await client.listTeams('my-org', { per_page: 30, page: 1 });
  ```

#### `createTeam(org, data)`
- **Signature:** `createTeam(org: string, data: unknown): Promise<unknown>`
- **Params:**

  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `org` | string | yes | Organization login. |
  | `data` | object (JSON body) | yes | Team payload. Common fields: `name` (string, required), `description` (string), `privacy` (enum `closed`/`secret`), `notification_setting`, `permission`, `parent_team_id` (number), `maintainers` (string[]), `repo_names` (string[]). |
- **Endpoint:** `POST /orgs/{org}/teams`
- **Returns:** the created Team (full) object.
- **Example:**
  ```js
  await client.createTeam('my-org', { name: 'Platform', privacy: 'closed' });
  ```

#### `getTeam(org, teamSlug)`
- **Signature:** `getTeam(org: string, teamSlug: string): Promise<unknown>`
- **Params:** `org` (string, required), `teamSlug` (string, required). Throws `Error("Both org and team parameters are required")` if either is missing.
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}`
- **Returns:** full Team object (see `TeamFullSchema`).
- **Example:** `await client.getTeam('my-org', 'platform');`

#### `updateTeam(org, teamSlug, data)`
- **Signature:** `updateTeam(org: string, teamSlug: string, data: unknown): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `data` (JSON body, required). Throws if org/team missing, or `Error("Data parameter is required")` if `data` is falsy. Body fields mirror `createTeam` (`name`, `description`, `privacy`, `notification_setting`, `permission`, `parent_team_id`).
- **Endpoint:** `PATCH /orgs/{org}/teams/{team_slug}`
- **Returns:** updated full Team object.
- **Example:** `await client.updateTeam('my-org', 'platform', { description: 'Core platform team' });`

#### `deleteTeam(org, teamSlug)`
- **Signature:** `deleteTeam(org: string, teamSlug: string): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required). Throws if either missing.
- **Endpoint:** `DELETE /orgs/{org}/teams/{team_slug}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.deleteTeam('my-org', 'platform');`

#### `listChildTeams(org, teamSlug, options?)`
- **Signature:** `listChildTeams(org: string, teamSlug: string, options?: ListOptions): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `options.per_page` (number), `options.page` (number).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/teams`
- **Returns:** array of child Team objects.
- **Example:** `await client.listChildTeams('my-org', 'platform', { per_page: 50 });`

#### `listTeamsForUser(username, options?)`
- **Signature:** `listTeamsForUser(username: string, options?: ListOptions): Promise<unknown>`
- **Params:** `username` (string, required), `options.per_page` (number), `options.page` (number).
- **Endpoint:** `GET /users/{username}/teams`
- **Returns:** array of Team objects the user belongs to. (Note: this is the only method NOT scoped to an org; it lists teams for the **authenticated** user matching the username path per GitHub's API.)
- **Example:** `await client.listTeamsForUser('octocat');`

#### `listPendingInvitations(org, teamSlug, options?)`
- **Signature:** `listPendingInvitations(org: string, teamSlug: string, options?: ListOptions): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `options.per_page` (number), `options.page` (number).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/invitations`
- **Returns:** array of OrganizationInvitation objects (see `OrganizationInvitationSchema`).
- **Example:** `await client.listPendingInvitations('my-org', 'platform');`

### Sub-module: Members

#### `listTeamMembers(org, teamSlug, options?)`
- **Signature:** `listTeamMembers(org: string, teamSlug: string, options?: ListOptions): Promise<unknown>`
- **Params:**

  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `org` | string | yes | Org login. Throws if missing. |
  | `teamSlug` | string | yes | Team slug. Throws if missing. |
  | `options.role` | enum | no | Filter by role: `member` \| `maintainer` \| `all`. |
  | `options.per_page` | number | no | Results per page. |
  | `options.page` | number | no | Page number. |
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/members`
- **Returns:** array of SimpleUser objects.
- **Example:** `await client.listTeamMembers('my-org', 'platform', { role: 'maintainer' });`

#### `addTeamMember(org, teamSlug, username, options?)`
- **Signature:** `addTeamMember(org: string, teamSlug: string, username: string, options?: ListOptions): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `username` (required — throws `Error("Username parameter is required")` if missing). `options` is sent as the JSON **body**; the relevant field is `role` (enum `member` \| `maintainer`, default `member`).
- **Endpoint:** `PUT /orgs/{org}/teams/{team_slug}/memberships/{username}`
- **Returns:** TeamMembership object (see `TeamMembershipSchema`).
- **Example:** `await client.addTeamMember('my-org', 'platform', 'octocat', { role: 'maintainer' });`

#### `removeTeamMember(org, teamSlug, username)`
- **Signature:** `removeTeamMember(org: string, teamSlug: string, username: string): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `username` (required). Throws if any missing.
- **Endpoint:** `DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.removeTeamMember('my-org', 'platform', 'octocat');`

#### `getTeamMembership(org, teamSlug, username)`
- **Signature:** `getTeamMembership(org: string, teamSlug: string, username: string): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `username` (required). Throws if any missing.
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/memberships/{username}`
- **Returns:** TeamMembership object (`role`, `state`, `url`).
- **Example:** `await client.getTeamMembership('my-org', 'platform', 'octocat');`

### Sub-module: Repos

#### `listTeamRepos(org, teamSlug, options?)`
- **Signature:** `listTeamRepos(org: string, teamSlug: string, options?: ListOptions): Promise<unknown>`
- **Params:** `org` (string, required), `teamSlug` (string, required), `options.per_page` (number), `options.page` (number). (No throw guard on org/team in source for this method.)
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/repos`
- **Returns:** array of repository objects (see `TeamRepositorySchema`).
- **Example:** `await client.listTeamRepos('my-org', 'platform');`

#### `addTeamRepo(org, teamSlug, owner, repo, options?)`
- **Signature:** `addTeamRepo(org: string, teamSlug: string, owner: string, repo: string, options?: ListOptions): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `owner`, `repo` (all required positionally). `options` is sent as JSON **body**; relevant field is `permission` (enum `pull` \| `push` \| `admin`; CLI default `push`).
- **Endpoint:** `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.addTeamRepo('my-org', 'platform', 'my-org', 'service-api', { permission: 'admin' });`

#### `removeTeamRepo(org, teamSlug, owner, repo)`
- **Signature:** `removeTeamRepo(org: string, teamSlug: string, owner: string, repo: string): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `owner`, `repo` (all required positionally).
- **Endpoint:** `DELETE /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.removeTeamRepo('my-org', 'platform', 'my-org', 'service-api');`

#### `checkTeamRepo(org, teamSlug, owner, repo)`
- **Signature:** `checkTeamRepo(org: string, teamSlug: string, owner: string, repo: string): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `owner`, `repo` (all required positionally).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`
- **Returns:** repository object with permission info (200), or a 404 error if the team has no permission on the repo.
- **Example:** `await client.checkTeamRepo('my-org', 'platform', 'my-org', 'service-api');`

### Sub-module: Projects (classic projects)

> All Projects methods override `Accept` to `application/vnd.github.inertia-preview+json`.

#### `listTeamProjects(org, teamSlug, options?)`
- **Signature:** `listTeamProjects(org: string, teamSlug: string, options?: ListOptions): Promise<unknown>`
- **Params:** `org` (required), `teamSlug` (required), `options.per_page` (number), `options.page` (number).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/projects`
- **Returns:** array of project objects (see `TeamProjectSchema`).
- **Example:** `await client.listTeamProjects('my-org', 'platform');`

#### `addTeamProject(org, teamSlug, projectId, options?)`
- **Signature:** `addTeamProject(org: string, teamSlug: string, projectId: string | number, options?: ListOptions): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `projectId` (required). `options` is sent as JSON **body**; relevant field is `permission` (enum `read` \| `write` \| `admin`).
- **Endpoint:** `PUT /orgs/{org}/teams/{team_slug}/projects/{project_id}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.addTeamProject('my-org', 'platform', 12345, { permission: 'write' });`

#### `removeTeamProject(org, teamSlug, projectId)`
- **Signature:** `removeTeamProject(org: string, teamSlug: string, projectId: string | number): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `projectId` (required).
- **Endpoint:** `DELETE /orgs/{org}/teams/{team_slug}/projects/{project_id}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.removeTeamProject('my-org', 'platform', 12345);`

#### `checkTeamProject(org, teamSlug, projectId)`
- **Signature:** `checkTeamProject(org: string, teamSlug: string, projectId: string | number): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `projectId` (required).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/projects/{project_id}`
- **Returns:** project object with permission info (200), or 404 if not granted.
- **Example:** `await client.checkTeamProject('my-org', 'platform', 12345);`

### Sub-module: Discussions

#### `listTeamDiscussions(org, teamSlug, options?)`
- **Signature:** `listTeamDiscussions(org: string, teamSlug: string, options?: ListOptions): Promise<unknown>`
- **Params:**

  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `org` | string | yes | Org login. |
  | `teamSlug` | string | yes | Team slug. |
  | `options.direction` | enum | no | Sort direction: `asc` \| `desc`. |
  | `options.per_page` | number | no | Results per page. |
  | `options.page` | number | no | Page number. |
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/discussions`
- **Returns:** array of discussion objects (see `TeamDiscussionSchema`).
- **Example:** `await client.listTeamDiscussions('my-org', 'platform', { direction: 'desc' });`

#### `createTeamDiscussion(org, teamSlug, data)`
- **Signature:** `createTeamDiscussion(org: string, teamSlug: string, data: unknown): Promise<unknown>`
- **Params:** `org`, `teamSlug` (required), `data` (JSON body, required). Body fields: `title` (string, required), `body` (string, required), `private` (boolean, optional).
- **Endpoint:** `POST /orgs/{org}/teams/{team_slug}/discussions`
- **Returns:** the created discussion object.
- **Example:** `await client.createTeamDiscussion('my-org', 'platform', { title: 'Roadmap', body: 'Q3 plans...' });`

#### `getTeamDiscussion(org, teamSlug, discussionNumber)`
- **Signature:** `getTeamDiscussion(org: string, teamSlug: string, discussionNumber: string | number): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber` (required).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}`
- **Returns:** discussion object.
- **Example:** `await client.getTeamDiscussion('my-org', 'platform', 1);`

#### `updateTeamDiscussion(org, teamSlug, discussionNumber, data)`
- **Signature:** `updateTeamDiscussion(org: string, teamSlug: string, discussionNumber: string | number, data: unknown): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber`, `data` (required). Body fields: `title` (string), `body` (string), `pinned` (boolean) — all optional.
- **Endpoint:** `PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}`
- **Returns:** updated discussion object.
- **Example:** `await client.updateTeamDiscussion('my-org', 'platform', 1, { pinned: true });`

#### `deleteTeamDiscussion(org, teamSlug, discussionNumber)`
- **Signature:** `deleteTeamDiscussion(org: string, teamSlug: string, discussionNumber: string | number): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber` (required).
- **Endpoint:** `DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.deleteTeamDiscussion('my-org', 'platform', 1);`

### Sub-module: Discussion Comments

#### `listDiscussionComments(org, teamSlug, discussionNumber, options?)`
- **Signature:** `listDiscussionComments(org: string, teamSlug: string, discussionNumber: string | number, options?: ListOptions): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber` (required); `options.direction` (enum `asc` \| `desc`), `options.per_page` (number), `options.page` (number).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments`
- **Returns:** array of comment objects (see `TeamDiscussionCommentSchema`).
- **Example:** `await client.listDiscussionComments('my-org', 'platform', 1, { direction: 'asc' });`

#### `createDiscussionComment(org, teamSlug, discussionNumber, data)`
- **Signature:** `createDiscussionComment(org: string, teamSlug: string, discussionNumber: string | number, data: unknown): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber`, `data` (required). Body field: `body` (string, required).
- **Endpoint:** `POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments`
- **Returns:** the created comment object.
- **Example:** `await client.createDiscussionComment('my-org', 'platform', 1, { body: 'Agreed.' });`

#### `getDiscussionComment(org, teamSlug, discussionNumber, commentNumber)`
- **Signature:** `getDiscussionComment(org: string, teamSlug: string, discussionNumber: string | number, commentNumber: string | number): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber`, `commentNumber` (required).
- **Endpoint:** `GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}`
- **Returns:** comment object.
- **Example:** `await client.getDiscussionComment('my-org', 'platform', 1, 1);`

#### `updateDiscussionComment(org, teamSlug, discussionNumber, commentNumber, data)`
- **Signature:** `updateDiscussionComment(org: string, teamSlug: string, discussionNumber: string | number, commentNumber: string | number, data: unknown): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber`, `commentNumber`, `data` (required). Body field: `body` (string, required).
- **Endpoint:** `PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}`
- **Returns:** updated comment object.
- **Example:** `await client.updateDiscussionComment('my-org', 'platform', 1, 1, { body: 'Edited.' });`

#### `deleteDiscussionComment(org, teamSlug, discussionNumber, commentNumber)`
- **Signature:** `deleteDiscussionComment(org: string, teamSlug: string, discussionNumber: string | number, commentNumber: string | number): Promise<unknown>`
- **Params:** `org`, `teamSlug`, `discussionNumber`, `commentNumber` (required).
- **Endpoint:** `DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}`
- **Returns:** `null` (204 No Content).
- **Example:** `await client.deleteDiscussionComment('my-org', 'platform', 1, 1);`

### Enum reference (from source)

| Enum | Values | Where used |
|------|--------|------------|
| Team privacy | `closed`, `secret` | `createTeam`/`updateTeam` body `privacy`; `TeamSchema.privacy`; CLI `teams create --privacy` (default `closed`). |
| Member role (filter) | `member`, `maintainer`, `all` | `listTeamMembers` option `role`; CLI `members list --role` (default `all`). |
| Member role (assign) | `member`, `maintainer` | `addTeamMember` body `role` (default `member`); `TeamMembershipSchema.role`. |
| Membership state | `active`, `pending` | `TeamMembershipSchema.state` (response). |
| Repo permission | `pull`, `push`, `admin` | `addTeamRepo` body `permission`; CLI `repos add --permission` (default `push`). |
| Project permission | `read`, `write`, `admin` | `addTeamProject` body `permission` (per GitHub API; not enumerated in source). |
| Sort direction | `asc`, `desc` | `listTeamDiscussions` / `listDiscussionComments` option `direction`. |

---

## Convenience Functions

- **`createClient(options?)`** — factory returning `new TeamsClient(options)`. See §Client Construction.

- **`models` namespace** — exported schema/validation utilities and model classes (`import { models } from '@internal/github-sdk-teams'`):
  - **Schemas** (objects of field rules): `TeamSchema`, `TeamFullSchema`, `TeamDiscussionSchema`, `TeamDiscussionCommentSchema`, `TeamMembershipSchema`, `TeamRepositorySchema`, `TeamProjectSchema`, `OrganizationInvitationSchema`, `SimpleUserSchema`.
  - **Validators:** `validateSchema(data, schema)` → `{ valid, errors }`; `validateTeam(data)`; `validateTeamFull(data)`.
  - **Model classes:** `Team`, `TeamMember` — thin wrappers that `Object.assign(this, data)`.
  - **Example:**
    ```js
    import { models } from '@internal/github-sdk-teams';
    const result = models.validateTeam(await client.getTeam('my-org', 'platform'));
    if (!result.valid) console.error(result.errors);
    ```

> Note: `src/utils/format.ts` and `src/utils/validation.ts` contain additional
> helpers (`formatDate`, `formatError`, `formatBytes`, `formatPermissions`,
> `validateString`, `validateEnum`, etc.) and `src/utils/http.ts` exposes
> `request`, `parseLink`, `extractPagination`, `handleRateLimit`. **These are NOT
> re-exported from the package root (`src/index.ts`)** and are therefore not part
> of the public SDK surface — they are internal/CLI-only.

---

## Errors

The SDK does not define custom error classes; it throws plain `Error` instances, some augmented with extra properties.

| Source | Error / shape | When thrown |
|--------|---------------|-------------|
| Constructor | `Error("GitHub token is required. Provide token in options or set GITHUB_TOKEN environment variable.")` | No `token` in options. |
| Constructor | `Error("Token must be a string")` | `token` provided but not a string. |
| Methods | `Error("Both org and team parameters are required")` | `getTeam`, `updateTeam`, `deleteTeam`, `listTeamMembers`, `addTeamMember`, `removeTeamMember`, `getTeamMembership` when `org` or `teamSlug` falsy. |
| `updateTeam` | `Error("Data parameter is required")` | `data` falsy. |
| Member methods | `Error("Username parameter is required")` | `addTeamMember`/`removeTeamMember`/`getTeamMembership` when `username` falsy. |
| HTTP layer (`request`) | `HttpError` (a plain `Error` with extra fields) | Non-2xx response. Fields: `message` (GitHub's `body.message` or `HTTP <status>: <statusText>`), `status` (number), `response` (parsed body — JSON object or text), `headers` (`Record<string,string>` of all response headers). |
| HTTP layer (`request`) | `Error("Network error: <message>")` with `.original` set to the underlying error | fetch/network failure (no HTTP status available). |
| `handleRateLimit` (internal util, not on the SDK call path) | `Error("Rate limit exceeded. Resets at <ISO>")` | `x-ratelimit-remaining` header is `"0"`. |

The HTTP layer returns `null` on `204 No Content`. JSON responses are parsed via `response.json()`; non-JSON via `response.text()`.

---

## CLI

- **Bin name:** `github-teams` (maps to `dist/esm/cli.js`).
- **Global options:**
  - `-t, --token <token>` — GitHub PAT (falls back to `GITHUB_TOKEN` env var).
  - `-o, --org <org>` — GitHub organization (required by most subcommands).
  - `-V, --version` — prints `1.0.0`.
  - `-h, --help`.
- **Token passing:** `--token` flag OR `GITHUB_TOKEN` env var (loaded via `dotenv`, so a `.env` file with `GITHUB_TOKEN=...` works). Resolved in a `preAction` hook; if absent the CLI prints a red error and exits `1`. The client is constructed lazily so `--help`/`--version` work without a token.
- **Output format:** Human-readable. Tables (via the `table` package) for list commands; key/value lines for details; colored status via `chalk`; spinners via `ora`. Errors are red, formatted by `formatError`, and exit `1`. Dates rendered by `formatDate`. There is **no JSON output mode**.

**Commands (only a subset of SDK methods are exposed via CLI):**

| Command | Args / flags | SDK call | Mutating |
|---------|--------------|----------|----------|
| `teams list` | `--page <n>` (def 1), `--per-page <n>` (def 30) | `listTeams` | no |
| `teams create` | `--name`, `--description`, `--privacy <closed\|secret>` (def closed), `--parent <id>`; interactive prompts if `--name` omitted | `createTeam` | yes |
| `teams get <teamSlug>` | — | `getTeam` | no |
| `teams update <teamSlug>` | `--name`, `--description`, `--privacy` | `updateTeam` | yes |
| `teams delete <teamSlug>` | `--confirm` (skip prompt) | `deleteTeam` | yes (confirms via inquirer unless `--confirm`) |
| `teams members list <teamSlug>` | `--role <member\|maintainer\|all>` (def all) | `listTeamMembers` | no |
| `teams members add <teamSlug> <username>` | `--role <member\|maintainer>` (def member) | `addTeamMember` | yes |
| `teams members remove <teamSlug> <username>` | — | `removeTeamMember` | yes |
| `teams repos list <teamSlug>` | — | `listTeamRepos` | no |
| `teams repos add <teamSlug> <owner> <repo>` | `--permission <pull\|push\|admin>` (def push) | `addTeamRepo` | yes |
| `teams repos remove <teamSlug> <owner> <repo>` | — | `removeTeamRepo` | yes |

The CLI does NOT cover projects, discussions, comments, membership-get, repo-check, child teams, teams-for-user, or pending invitations — those are SDK-only.

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
github-teams --proxy http://proxy.example.test:8080 <command>
github-teams --proxy-bypass 'ghe.internal,.corp.example' <command>
github-teams --no-proxy <command>
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

Build a single-page web workbench that exercises every SDK capability against the live GitHub API.

**Token field (memory only):**
- A top-of-page text input labeled "GitHub Token (PAT)". Store in a JS variable / React state ONLY — never localStorage, cookies, or any persistence. Sent as `Authorization: Bearer <token>`.
- Optionally an `org` text field at top, since nearly every capability takes `org` as the first param — prefill per-form `org` from it.
- Optional `baseURL` field defaulting to `https://api.github.com`.

**Left nav, grouped by sub-module:**
- **Teams:** listTeams, createTeam, getTeam, updateTeam, deleteTeam, listChildTeams, listTeamsForUser, listPendingInvitations
- **Members:** listTeamMembers, addTeamMember, removeTeamMember, getTeamMembership
- **Repos:** listTeamRepos, addTeamRepo, removeTeamRepo, checkTeamRepo
- **Projects:** listTeamProjects, addTeamProject, removeTeamProject, checkTeamProject
- **Discussions:** listTeamDiscussions, createTeamDiscussion, getTeamDiscussion, updateTeamDiscussion, deleteTeamDiscussion
- **Discussion Comments:** listDiscussionComments, createDiscussionComment, getDiscussionComment, updateDiscussionComment, deleteDiscussionComment

**Auto-generated form per capability** (driven by each capability's param table above):

| Param type | Widget |
|------------|--------|
| string (`org`, `teamSlug`, `username`, `owner`, `repo`) | text input |
| number (`per_page`, `page`, `discussionNumber`, `commentNumber`, `projectId`) | number input |
| boolean (`private`, `pinned`) | checkbox |
| enum (`privacy`, `role`, `permission`, `direction`, `state`) | select — see enum list below |
| array (`maintainers`, `repo_names`) | repeatable text rows |
| object / JSON body (`data`) | JSON editor / multiline textarea |

**Enum select options:**
- `privacy`: `closed`, `secret`
- `role` (members list filter): `member`, `maintainer`, `all`
- `role` (add member): `member`, `maintainer`
- repo `permission`: `pull`, `push`, `admin`
- project `permission`: `read`, `write`, `admin`
- `direction`: `asc`, `desc`
- (response-only) membership `state`: `active`, `pending`

**For create/update/discussion methods** whose final param is an opaque `data` body, render a JSON editor pre-seeded with the documented body fields (e.g. `createTeam` → `{ "name": "", "description": "", "privacy": "closed" }`).

**Submit behavior:**
- Build the request from the form. You can call `api.github.com` directly via `fetch` (mirroring this SDK's transport: default headers `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`, `Authorization: Bearer <token>`; for Projects endpoints override `Accept: application/vnd.github.inertia-preview+json`).
- Render: the JSON response body, the HTTP status code, the rate-limit headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` — show reset as a human time), and any errors per §Errors (display `status`, `message`, and `response` body; a 204 shows "No Content / success").

**Mutating verbs — confirm before send:** Flag and require an explicit confirm dialog for all POST/PATCH/PUT/DELETE capabilities: createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember, addTeamRepo, removeTeamRepo, addTeamProject, removeTeamProject, createTeamDiscussion, updateTeamDiscussion, deleteTeamDiscussion, createDiscussionComment, updateDiscussionComment, deleteDiscussionComment. (Read-only GETs need no confirm: all `list*`, all `get*`, all `check*`, getTeamMembership.)

**Scope:** single-user manual testing tool. No persistence, no multi-user, no stored history — calls hit `https://api.github.com` with the human-supplied real PAT held in memory only.
