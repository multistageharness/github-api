# @internal/github-sdk-git — Interface

A TypeScript CLI and SDK for the **GitHub Git Database API** — the low-level git
object store of a repository. This package lets you read and write the raw git
objects that back every commit: **blobs** (file contents), **trees** (directory
listings), **commits**, **references** (refs/branches/tags pointers), and
**annotated tags**.

- **Domain:** GitHub Git Database API (`/repos/{owner}/{repo}/git/*`).
- **npm name:** `@internal/github-sdk-git`
- **version:** `0.0.1`
- **Bin:** `github-git`

All endpoints are rooted at `https://api.github.com` by default and use the
`application/vnd.github+json` accept header with API version `2022-11-28`.

---

## Install & Import

**npm name:** `@internal/github-sdk-git`

```bash
npm install @internal/github-sdk-git
```

**ESM — default import (the `GitHubClient` class):**

```js
import GitHubClient from '@internal/github-sdk-git';
```

**ESM — named imports:**

```js
import {
  GitHubClient,
  BlobCommands,
  CommitCommands,
  RefCommands,
  TagCommands,
  TreeCommands,
  formatOutput,
} from '@internal/github-sdk-git';

// Type-only exports:
import type {
  GitHubClientOptions,
  GitPerson,
  GitTreeEntry,
} from '@internal/github-sdk-git';
```

**CJS — require:**

```js
const GitHubClient = require('@internal/github-sdk-git').default;
const { formatOutput } = require('@internal/github-sdk-git');
```

**`exports` subpaths:** the package exposes exactly one entry point:

| Subpath | types | import (ESM) | require (CJS) |
|---------|-------|--------------|---------------|
| `.` | `./dist/esm/index.d.ts` | `./dist/esm/index.js` | `./dist/cjs/index.js` |

There are no deep-import subpaths; everything ships from the barrel `.`.

---

## Authentication

Authentication is a GitHub **Personal Access Token (PAT)** passed as the `token`
constructor option. When present, the client sends:

```
Authorization: Bearer <token>
```

**Env vars** (read in source):

| Env var | Read by | Purpose |
|---------|---------|---------|
| `GITHUB_TOKEN` | CLI (`src/cli.ts`) | Default token for the client and the `--token` flag default. |
| `GITHUB_API_URL` | CLI (`src/cli.ts`) | Default base URL (falls back to `https://api.github.com`). |

> The **SDK class** itself does NOT read `process.env` — it only uses what you
> pass to the constructor. Env-var resolution happens in the CLI layer, which
> loads `.env` via `dotenv` (`config()`).

**No-token behavior:** if `token` is undefined, the `Authorization` header is
simply omitted; requests are sent anonymously. GitHub then applies unauthenticated
rate limits and rejects any private-repo or write request (the API returns
401/404/403, surfaced as an `Error` — see §7).

**Base URL:** defaults to `https://api.github.com`. Override via the `baseUrl`
constructor option (SDK) or `--api-url` / `GITHUB_API_URL` (CLI).

---

## Client Construction

The SDK exposes a single class, constructed directly with `new`. There is **no
separate factory function** in source.

```js
import { GitHubClient } from '@internal/github-sdk-git';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });
// or with a custom base URL:
const enterprise = new GitHubClient({
  token: 'ghp_xxx',
  baseUrl: 'https://github.example.com/api/v3',
});
```

**Constructor:** `new GitHubClient(options?: GitHubClientOptions)`

**`GitHubClientOptions` table:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string \| undefined` | `undefined` | GitHub PAT. Sent as `Authorization: Bearer <token>`. Omitted if undefined (anonymous). |
| `baseUrl` | `string \| undefined` | `'https://api.github.com'` | API root. Endpoint paths are appended to this. |

Both fields are optional; calling `new GitHubClient()` with no arguments is valid
(anonymous client against api.github.com).

**Low-level escape hatch:** `client.request(method, endpoint, body?)` performs a
raw authenticated request. Signature:
`request(method: string, endpoint: string, body?: unknown): Promise<unknown>`.
A `body` is JSON-serialized and `Content-Type: application/json` is added only for
`POST`/`PUT`/`PATCH`. All capability methods below are thin wrappers over this.

---

## Capabilities

Every method lives directly on a `GitHubClient` instance. All methods return
`Promise<unknown>` (the raw decoded JSON payload from GitHub). The first two
positional params are always `owner: string, repo: string`.

### Blobs

#### `client.createBlob(owner, repo, content, encoding?)`

Signature: `createBlob(owner: string, repo: string, content: string, encoding?: string): Promise<unknown>`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `owner` | `string` | yes | — | Repository owner. |
| `repo` | `string` | yes | — | Repository name. |
| `content` | `string` | yes | — | Blob content. |
| `encoding` | `string` | no | `'utf-8'` | Content encoding. Enum: `utf-8`, `base64`. |

**Endpoint:** `POST /repos/{owner}/{repo}/git/blobs`
**Request body:** `{ content, encoding }`
**Return shape:** `{ sha, url }` (the created blob's SHA and API URL).

```js
const blob = await client.createBlob('octocat', 'hello', 'file contents\n');
console.log(blob.sha);
```

#### `client.getBlob(owner, repo, sha)`

Signature: `getBlob(owner: string, repo: string, sha: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `sha` | `string` | yes | Blob SHA. |

**Endpoint:** `GET /repos/{owner}/{repo}/git/blobs/{sha}`
**Return shape:** `{ sha, node_id, size, url, content, encoding }` (`content` is
base64-encoded when `encoding` is `base64`).

```js
const blob = await client.getBlob('octocat', 'hello', 'abc123...');
```

### Trees

#### `client.createTree(owner, repo, tree, baseTree?)`

Signature: `createTree(owner: string, repo: string, tree: GitTreeEntry[], baseTree?: string): Promise<unknown>`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `owner` | `string` | yes | — | Repository owner. |
| `repo` | `string` | yes | — | Repository name. |
| `tree` | `GitTreeEntry[]` | yes | — | Array of tree entries (see below). |
| `baseTree` | `string` | no | (omitted) | SHA of an existing tree to base this on. Sent as `base_tree` when provided. |

**`GitTreeEntry`** (each array element):

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string?` | File path within the tree. |
| `mode` | `string?` | File mode. Enum: `100644` (file/blob), `100755` (executable), `040000` (subdirectory/tree), `160000` (submodule/commit), `120000` (symlink). |
| `type` | `string?` | Object type. Enum: `blob`, `tree`, `commit`. |
| `sha` | `string \| null?` | SHA of the referenced object (use `null` to delete a path). |
| `content` | `string?` | Inline content (alternative to `sha`). |

**Endpoint:** `POST /repos/{owner}/{repo}/git/trees`
**Request body:** `{ tree, base_tree? }`
**Return shape:** `{ sha, url, tree: [...], truncated }`.

```js
const tree = await client.createTree('octocat', 'hello', [
  { path: 'README.md', mode: '100644', type: 'blob', sha: 'abc123...' },
]);
```

#### `client.getTree(owner, repo, sha, recursive?)`

Signature: `getTree(owner: string, repo: string, sha: string, recursive?: boolean): Promise<unknown>`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `owner` | `string` | yes | — | Repository owner. |
| `repo` | `string` | yes | — | Repository name. |
| `sha` | `string` | yes | — | Tree SHA (or a branch/ref name resolvable to a tree). |
| `recursive` | `boolean` | no | `false` | When `true`, appends `?recursive=1` to fetch the full nested tree. |

**Endpoint:** `GET /repos/{owner}/{repo}/git/trees/{sha}` (with `?recursive=1` when recursive)
**Return shape:** `{ sha, url, tree: [{ path, mode, type, sha, size?, url }], truncated }`.

```js
const tree = await client.getTree('octocat', 'hello', 'main', true);
```

### Commits

#### `client.createCommit(owner, repo, message, tree, parents?, author?, committer?)`

Signature: `createCommit(owner: string, repo: string, message: string, tree: string, parents?: string[], author?: GitPerson | null, committer?: GitPerson | null): Promise<unknown>`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `owner` | `string` | yes | — | Repository owner. |
| `repo` | `string` | yes | — | Repository name. |
| `message` | `string` | yes | — | Commit message. |
| `tree` | `string` | yes | — | SHA of the tree this commit points to. |
| `parents` | `string[]` | no | `[]` | Parent commit SHAs. |
| `author` | `GitPerson \| null` | no | `null` | Author record; omitted from body when null. |
| `committer` | `GitPerson \| null` | no | `null` | Committer record; omitted from body when null. |

**`GitPerson`** (author / committer / tagger): `{ name?: string; email?: string; date?: string }` (`date` is ISO 8601).

**Endpoint:** `POST /repos/{owner}/{repo}/git/commits`
**Request body:** `{ message, tree, parents, author?, committer? }`
**Return shape:** `{ sha, url, author, committer, message, tree: { sha, url }, parents: [{ sha, url }], verification }`.

```js
const commit = await client.createCommit(
  'octocat', 'hello', 'Initial commit', 'treeSha123', ['parentSha456'],
  { name: 'Octo', email: 'octo@example.com', date: new Date().toISOString() }
);
```

#### `client.getCommit(owner, repo, sha)`

Signature: `getCommit(owner: string, repo: string, sha: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `sha` | `string` | yes | Commit SHA. |

**Endpoint:** `GET /repos/{owner}/{repo}/git/commits/{sha}`
**Return shape:** `{ sha, url, author, committer, message, tree, parents, verification }`.

```js
const commit = await client.getCommit('octocat', 'hello', 'abc123...');
```

### References

A "ref" is a pointer like `heads/main` or `tags/v1.0.0`. Note the path quirks
below: **get** uses `/git/ref/`, **list** uses `/git/matching-refs/`, and
**create/update/delete** use `/git/refs`.

#### `client.createRef(owner, repo, ref, sha)`

Signature: `createRef(owner: string, repo: string, ref: string, sha: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `ref` | `string` | yes | Fully-qualified ref name, e.g. `refs/heads/feature`. |
| `sha` | `string` | yes | SHA1 the new ref should point to. |

**Endpoint:** `POST /repos/{owner}/{repo}/git/refs`
**Request body:** `{ ref, sha }`
**Return shape:** `{ ref, node_id, url, object: { type, sha, url } }`.

```js
await client.createRef('octocat', 'hello', 'refs/heads/feature', 'abc123...');
```

#### `client.getRef(owner, repo, ref)`

Signature: `getRef(owner: string, repo: string, ref: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `ref` | `string` | yes | Ref without leading `refs/`, e.g. `heads/main`. |

**Endpoint:** `GET /repos/{owner}/{repo}/git/ref/{ref}`
**Return shape:** `{ ref, node_id, url, object: { type, sha, url } }`.

```js
const ref = await client.getRef('octocat', 'hello', 'heads/main');
```

#### `client.listMatchingRefs(owner, repo, ref)`

Signature: `listMatchingRefs(owner: string, repo: string, ref: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `ref` | `string` | yes | Ref prefix to match, e.g. `heads/feature`. |

**Endpoint:** `GET /repos/{owner}/{repo}/git/matching-refs/{ref}`
**Return shape:** array of `{ ref, node_id, url, object: { type, sha, url } }`.

```js
const refs = await client.listMatchingRefs('octocat', 'hello', 'heads/');
```

#### `client.updateRef(owner, repo, ref, sha, force?)`

Signature: `updateRef(owner: string, repo: string, ref: string, sha: string, force?: boolean): Promise<unknown>`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `owner` | `string` | yes | — | Repository owner. |
| `repo` | `string` | yes | — | Repository name. |
| `ref` | `string` | yes | — | Ref without leading `refs/`, e.g. `heads/main`. |
| `sha` | `string` | yes | — | New SHA1 to point the ref at. |
| `force` | `boolean` | no | `false` | Allow non-fast-forward (force) update. |

**Endpoint:** `PATCH /repos/{owner}/{repo}/git/refs/{ref}`
**Request body:** `{ sha, force }`
**Return shape:** `{ ref, node_id, url, object: { type, sha, url } }`.

```js
await client.updateRef('octocat', 'hello', 'heads/main', 'newSha...', true);
```

#### `client.deleteRef(owner, repo, ref)`

Signature: `deleteRef(owner: string, repo: string, ref: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `ref` | `string` | yes | Ref without leading `refs/`, e.g. `heads/feature`. |

**Endpoint:** `DELETE /repos/{owner}/{repo}/git/refs/{ref}`
**Return shape:** empty (HTTP 204; payload resolves to `null`).

```js
await client.deleteRef('octocat', 'hello', 'heads/feature');
```

### Tags

These are **annotated tag objects** (not lightweight tags — for those, create a
ref under `refs/tags/...`).

#### `client.createTag(owner, repo, tag, message, object, type?, tagger?)`

Signature: `createTag(owner: string, repo: string, tag: string, message: string, object: string, type?: string, tagger?: GitPerson | null): Promise<unknown>`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `owner` | `string` | yes | — | Repository owner. |
| `repo` | `string` | yes | — | Repository name. |
| `tag` | `string` | yes | — | Tag name, e.g. `v1.0.0`. |
| `message` | `string` | yes | — | Tag message. |
| `object` | `string` | yes | — | SHA of the git object being tagged. |
| `type` | `string` | no | `'commit'` | Type of the tagged object. Enum: `commit`, `tree`, `blob`. |
| `tagger` | `GitPerson \| null` | no | `null` | Tagger record; omitted from body when null. |

**Endpoint:** `POST /repos/{owner}/{repo}/git/tags`
**Request body:** `{ tag, message, object, type, tagger? }`
**Return shape:** `{ tag, sha, node_id, url, message, tagger, object: { type, sha, url }, verification }`.

> Creating the annotated tag object does NOT make it visible as a tag. To publish
> it, follow up with `createRef('refs/tags/<tag>', <tag-object-sha>)`.

```js
const tag = await client.createTag(
  'octocat', 'hello', 'v1.0.0', 'Release 1.0.0', 'commitSha...', 'commit',
  { name: 'Octo', email: 'octo@example.com', date: new Date().toISOString() }
);
```

#### `client.getTag(owner, repo, sha)`

Signature: `getTag(owner: string, repo: string, sha: string): Promise<unknown>`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | `string` | yes | Repository owner. |
| `repo` | `string` | yes | Repository name. |
| `sha` | `string` | yes | Tag object SHA. |

**Endpoint:** `GET /repos/{owner}/{repo}/git/tags/{sha}`
**Return shape:** `{ tag, sha, node_id, url, message, tagger, object: { type, sha, url }, verification }`.

```js
const tag = await client.getTag('octocat', 'hello', 'tagObjectSha...');
```

**Capability count: 13** public SDK methods — createBlob, getBlob, createTree,
getTree, createCommit, getCommit, createRef, getRef, listMatchingRefs, updateRef,
deleteRef, createTag, getTag (plus the low-level `request` escape hatch, not
counted as a capability).

---

## Convenience Functions

### `formatOutput(data, asJson?)`

Signature: `formatOutput(data: unknown, asJson?: boolean): void`

A pretty-printer used by the CLI. It `console.log`s the payload.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `data` | `unknown` | — | An API result payload. |
| `asJson` | `boolean` | `false` | When `true`, prints `JSON.stringify(data, null, 2)`. Otherwise prints a human summary. |

When `asJson` is false, it defensively reads and prints whichever of these fields
are present: `sha`, `url`, `ref`, `tag`, `message`, `author`, `committer`,
`tagger`, `object` (`{type, sha}`), `tree` (SHA or entry count), `parents` (joined
SHAs), `verification` (`{verified, reason}`), and `content`/`encoding` (base64
content is truncated to 100 chars).

```js
import { formatOutput } from '@internal/github-sdk-git';
const commit = await client.getCommit('octocat', 'hello', 'abc123...');
formatOutput(commit);          // human summary
formatOutput(commit, true);    // pretty JSON
```

The **command classes** (`BlobCommands`, `CommitCommands`, `RefCommands`,
`TagCommands`, `TreeCommands`) are also exported for advanced usage. Each takes a
`GitHubClient` in its constructor and exposes `register(command)` to wire a
commander sub-command. They are primarily the CLI's internals.

There is **no `packageInfo` / version helper export** in source.

---

## Errors

This package does **not** define custom error classes. All failures surface as the
built-in `Error`.

| Class | Fields | When thrown |
|-------|--------|-------------|
| `Error` | `message: string` | Thrown by `GitHubClient.request` whenever `response.ok` is false (non-2xx). `message` is GitHub's `payload.message` when the JSON body has a string `message`, otherwise the fallback `"GitHub API request failed with status <status>"`. |
| `Error` | `message: string` | CLI `blob create`: `"Either --content or --file must be provided"` when neither flag is given. |
| `Error` | `message: string` | CLI `tree create`: `"Invalid tree JSON: <reason>"` when `--tree` is not valid JSON. |

Network/transport failures from `node-fetch` propagate as their native errors
(e.g. `FetchError`). In the CLI, all action handlers catch errors, print
`Error <doing X>: <message>` to stderr, and call `process.exit(1)`.

> There is no typed error taxonomy, no status-code field on the thrown error, and
> no rate-limit-specific error. A workbench must read HTTP status / rate-limit
> headers from its own fetch if it calls the REST API directly, since the SDK
> discards them on success and collapses them into a string `message` on failure.

---

## CLI

**Bin name:** `github-git` (maps to `dist/esm/cli.js`).

**Global options** (apply to the root program):

| Flag | Default | Description |
|------|---------|-------------|
| `-t, --token <token>` | `process.env.GITHUB_TOKEN` | GitHub API token. |
| `--api-url <url>` | `https://api.github.com` | GitHub API base URL. |
| `-V, --version` | — | Prints `1.0.0`. |

> Token resolution: the client is actually constructed at startup from
> `process.env.GITHUB_TOKEN` and `process.env.GITHUB_API_URL` (after `dotenv`
> `config()`), so the most reliable way to pass credentials is the `GITHUB_TOKEN`
> env var (or a `.env` file). The `-t/--token` and `--api-url` flags are declared
> on the program but the constructed client reads env directly.

**Command groups & sub-commands:**

`github-git blob`
- `create -o <owner> -r <repo> [-c <content>] [-f <file>] [-e <encoding=utf-8>] [--json]` — create a blob (content from `--content` or `--file`).
- `get -o <owner> -r <repo> -s <sha> [--save <file>] [--json]` — get a blob; `--save` writes the (base64-decoded if needed) content to a file.

`github-git commit`
- `create -o <owner> -r <repo> -m <message> -t <tree> [-p <parents...>] [--author-name] [--author-email] [--author-date] [--committer-name] [--committer-email] [--committer-date] [--json]` — create a commit. Author/committer date defaults to now (ISO 8601) when name or email is given without a date.
- `get -o <owner> -r <repo> -s <sha> [--json]` — get a commit.

`github-git ref`
- `create -o <owner> -r <repo> --ref <ref> -s <sha> [--json]` — create a ref (`--ref` fully qualified, e.g. `refs/heads/feature`).
- `get -o <owner> -r <repo> --ref <ref> [--json]` — get a ref (e.g. `heads/main`).
- `list -o <owner> -r <repo> --ref <ref> [--json]` — list matching refs.
- `update -o <owner> -r <repo> --ref <ref> -s <sha> [-f|--force] [--json]` — update a ref.
- `delete -o <owner> -r <repo> --ref <ref> [--json]` — delete a ref (prints "Reference deleted successfully" unless `--json`).

`github-git tag`
- `create -o <owner> -r <repo> -t <tag> -m <message> --object <sha> [--type <commit|tree|blob>=commit] [--tagger-name] [--tagger-email] [--tagger-date] [--json]` — create an annotated tag object.
- `get -o <owner> -r <repo> -s <sha> [--json]` — get a tag object.

`github-git tree`
- `create -o <owner> -r <repo> -t <tree-json> [-b|--base-tree <sha>] [--json]` — create a tree (`--tree` is a JSON string array of entries).
- `get -o <owner> -r <repo> -s <sha> [--recursive] [--json]` — get a tree; prints a formatted entry listing unless `--json`.

**Output format:** by default each command prints a human-readable summary via
`formatOutput`; pass `--json` on any command for pretty-printed JSON. Errors go to
stderr and exit with code `1`.

```bash
export GITHUB_TOKEN=ghp_xxx
github-git blob get -o octocat -r hello -s abc123 --json
github-git commit create -o octocat -r hello -m "msg" -t treeSha -p parentSha
github-git tree create -o octocat -r hello -t '[{"path":"a.txt","mode":"100644","type":"blob","content":"hi"}]'
```

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
github-git --proxy http://proxy.example.test:8080 <command>
github-git --proxy-bypass 'ghe.internal,.corp.example' <command>
github-git --no-proxy <command>
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

Build a single-page web app that lets one human exercise every capability of this
package against the live GitHub API. Manual single-user testing — **no
persistence, no accounts, no database.**

**Token field (top, memory only).** Render a password-type input at the top of the
page for a GitHub PAT. Keep it in client memory only (React state / a module
variable) — never localStorage, never a cookie, never sent anywhere except
`https://api.github.com`. Also offer an optional "Base URL" field defaulting to
`https://api.github.com` (maps to the SDK `baseUrl`). The token maps to the SDK
`token` option / `Authorization: Bearer <token>` header.

**Left nav grouped by git object type.** Five groups, in this order, matching §5:

- **Blobs** → Create Blob, Get Blob
- **Trees** → Create Tree, Get Tree
- **Commits** → Create Commit, Get Commit
- **References** → Create Ref, Get Ref, List Matching Refs, Update Ref, Delete Ref
- **Tags** → Create Tag, Get Tag

**Auto-generated form per capability.** For each selected capability, render a
form from its param table in §5. Every form starts with `owner` (text) and `repo`
(text). Widget mapping:

- `string` → text input. (`owner`, `repo`, `sha`, `content`, `message`, `tree` SHA, `ref`, `tag`, `object`, `baseTree`, person `name`/`email`/`date`.)
- `number` → number input. (None in this API.)
- `boolean` → checkbox. (`recursive` on Get Tree; `force` on Update Ref.)
- enum → select dropdown:
  - **Blob `encoding`**: `utf-8` (default), `base64`.
  - **Tree entry `mode`**: `100644` (file), `100755` (executable), `040000` (subdirectory), `160000` (submodule), `120000` (symlink).
  - **Tree entry `type`**: `blob`, `tree`, `commit`.
  - **Tag `type`**: `commit` (default), `tree`, `blob`.
- array → repeatable field group. (`parents` on Create Commit — repeatable text inputs of SHAs; `tree` on Create Tree — a repeatable group of `{path, mode, type, sha, content}` entries.)
- object / request body → JSON editor textarea. Offer a raw-JSON mode for
  `author`/`committer`/`tagger` (`GitPerson` = `{name, email, date}`) and for the
  whole `tree` array, so power users can paste payloads directly. The CLI itself
  takes `--tree` as a JSON string, so mirror that with a JSON editor.

Mark required vs optional from the table (required: `owner`, `repo`, plus the
method-specific required params; everything with a default or `?` is optional).
Pre-fill defaults shown in the tables (`encoding=utf-8`, `type=commit`,
`recursive=false`, `force=false`).

**Submit → call & render.** On submit, either call the SDK method (param order is
fixed in §5) or issue the documented `METHOD /path` REST call directly to
`https://api.github.com` with the PAT (`Authorization: Bearer <token>`,
`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`). Render:

- The **JSON response body** (pretty-printed) — mirror `formatOutput(data, true)`.
- The **HTTP status** code and text.
- The **rate-limit headers**: `x-ratelimit-limit`, `x-ratelimit-remaining`,
  `x-ratelimit-reset`, `x-ratelimit-used`. (If you call through the SDK these are
  not exposed — see §7 — so prefer a direct fetch in the workbench to surface them.)
- On error, surface the §7 `Error.message` (GitHub's `message` field or the
  status-based fallback).

**Flag mutating verbs.** These capabilities mutate repository state and use
non-GET verbs — show a confirmation dialog before sending and visually flag them
(e.g. a red "write" badge):

- `POST` — Create Blob, Create Tree, Create Commit, Create Ref, Create Tag.
- `PATCH` — Update Ref.
- `DELETE` — Delete Ref (most destructive — strong confirm).

GET capabilities (Get Blob, Get Tree, Get Commit, Get Ref, List Matching Refs, Get
Tag) are read-only and need no confirmation.

**Ref path hint.** Surface the path quirk in the UI help text: Get Ref →
`/git/ref/{ref}` and List → `/git/matching-refs/{ref}` take a ref **without** the
leading `refs/` (e.g. `heads/main`), while Create takes a **fully-qualified** ref
(e.g. `refs/heads/feature`).
