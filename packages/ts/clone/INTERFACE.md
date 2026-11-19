# @internal/github-sdk-clone — Interface

**Purpose:** A Git Repository Management SDK and CLI for **local git operations** built on [`simple-git`](https://www.npmjs.com/package/simple-git). It clones, pulls, pushes, inits, statuses, lists, syncs, and health-checks git repositories on the local filesystem by shelling out to a local `git` binary. It also integrates a thin layer of **GitHub authentication** — a GitHub personal access token is injected into clone URLs so private GitHub repos can be cloned over authenticated HTTPS.

**Domain:** clone / local-git operations (primary) + GitHub auth-into-URL (secondary). There are **no direct GitHub REST API calls** in this package — the only GitHub touchpoint is rewriting `github.com` URLs to embed the token for the underlying `git clone`/`pull`/`push`. All operations run a local `git` process and read/write the local filesystem.

> Note on naming: `package.json` declares the npm name `@internal/github-sdk-clone` (v1.0.1). An internal `packageInfo` constant and several JSDoc examples use the legacy module id `@internal/clone`. Use `@internal/github-sdk-clone` for installs/imports.

---

## Install & Import

```bash
npm install @internal/github-sdk-clone
```

**Runtime requirements**
- Node.js `>= 18.0.0` (ESM-first; `"type": "module"`).
- A local **`git` binary** on `PATH` — `simple-git` shells out to it (`binary: 'git'`). All capabilities run `git` subprocesses and touch the local filesystem. This package cannot run in a browser; git operations need a Node/server process.
- Bundled deps: `simple-git ^3.19.1`, `@internal/cli-progressor`, `@internal/npm-api-rate-limiter`, plus CLI deps `commander`, `chalk`, `ora`, `inquirer`, `cli-table3`, `dotenv`, `node-fetch`, `yaml`.

**ESM (default + named)**
```js
import GitClient, { createClient, clone, pull, push, status, list, init, sync } from '@internal/github-sdk-clone';
```

**CJS**
```js
const { GitClient, createClient, clone } = require('@internal/github-sdk-clone');
```

**Exports subpaths** (from `package.json` `exports`):

| Subpath | Resolves to | Contents |
|---------|-------------|----------|
| `.` | `index` | default `GitClient`, `createClient`, all convenience fns, `operations`, error classes/utils, validation fns, progress fns, `packageInfo` |
| `./client` | `client/GitClient` | `GitClient` class + its option/result interfaces |
| `./progress` | `utils/progress` | `GitProgressManager`, `createProgressManager`, `createSilentProgressManager`, `createCLIProgressManager`, `CLONE_STAGES` |
| `./types` | `types/index` | type-only barrel re-exporting every public interface |

```js
import { GitClient } from '@internal/github-sdk-clone/client';
import { createCLIProgressManager, CLONE_STAGES } from '@internal/github-sdk-clone/progress';
import type { RepositoryInfo, StatusResultInfo } from '@internal/github-sdk-clone/types';
```

---

## Authentication

- **Token option:** `token` (constructor option `GitClientOptions.token`, or per-call via convenience-fn / operation `client.token`).
- **Env var:** `GITHUB_TOKEN`. Resolution order in `GitClient` constructor: `options.token` → `process.env.GITHUB_TOKEN`. The CLI adds a config-file layer: `--token` flag → config file `token` → `process.env.GITHUB_TOKEN`.
- **No-token behavior:** the client constructs fine with no token. Clone URLs are passed through unchanged (no auth injected). Public repos clone normally; private GitHub repos will fail at the git layer.
- **Base URL:** none — there is no REST base URL. The only host special-cased is `github.com`.
- **How the token is used in clone URLs** (`GitClient._getAuthenticatedUrl`): only applied when a token is set AND the URL contains `github.com`. It normalizes `git@github.com:owner/repo` → `https://github.com/owner/repo`, strips `.git`, then sets `url.username` to the token and `url.password` to `x-oauth-basic`, producing `https://*****:*****@github.com/owner/repo.git`. Non-GitHub URLs are never modified.
- When a token is present the constructor also runs `git config credential.helper 'store --file=.git-credentials'` on the base-dir git instance.

---

## Client Construction

**Factory:** `createClient(options?) => GitClient` (thin wrapper over `new GitClient(options)`).
**Constructor:** `new GitClient(options?: GitClientOptions)`.

### `GitClientOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `baseDir` | `string` | `'./repositories'` (resolved to absolute) | Base directory where repos live; created with `mkdir -p` if missing. |
| `token` | `string` | `process.env.GITHUB_TOKEN` | GitHub PAT injected into `github.com` clone URLs; enables credential helper. |
| `gitOptions` | `Partial<SimpleGitOptions>` | — | Extra options merged into the `simple-git` config (overrides defaults). |
| `verbose` | `boolean` | `false` | Logs progress lines to console. |
| `timeout` | `number` (ms) | `300000` (5 min) | `simple-git` block timeout. |

Defaults baked into the underlying `simple-git`: `binary: 'git'`, `maxConcurrentProcesses: 6`, `timeout.block: <timeout>`.

Read-only instance fields: `baseDir`, `token`, `verbose`, `timeout`, `git` (the `SimpleGit` instance).

```js
import { createClient } from '@internal/github-sdk-clone';
const client = createClient({ baseDir: './my-repos', token: process.env.GITHUB_TOKEN, verbose: true });
```

---

## Capabilities

Two areas: **(A) GitClient methods** (class instance) and **(B) operations API** (`operations.*`, also re-exported as top-level functions). The operations functions construct a fresh `GitClient` per call and delegate to the matching method, adding progress-manager selection, batch handling, and health analysis. All run a local `git` subprocess.

### A. GitClient methods (`client.<method>`)

#### `client.clone(repoUrl, targetDir?, options?) => Promise<RepositoryInfo>`
Underlying git: `git clone [--bare] [--branch <b>] [--depth <n>] --progress <authUrl> <targetDir>`, then `status` + `getRemotes(true)` + `branch(['-a'])` on the result.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoUrl` | `string` | yes | Repo URL (validated; SSH or HTTPS git URL). |
| `targetDir` | `string` | no | Local dir name under `baseDir`; defaults to repo basename. Absolute/`:`-containing paths are used as-is. |
| `options` | `CloneOptions` | no | see below |

`CloneOptions`: `bare?: boolean`, `branch?: string`, `depth?: number`, `progress?: (s: string) => void` (legacy), `progressManager?: GitProgressManager`, `onProgress?`, `onStageChange?`, `onComplete?` (event callbacks).
Throws `ValidationError` if `targetDir` already exists; wraps failures in `GitError`.
Returns `RepositoryInfo`: `{ name, path, url?, branch?, status?: StatusResult, remotes?: RemoteWithRefs[], branches?: BranchSummary, recentCommits?, clonedAt? }`.

```js
const repo = await client.clone('https://github.com/octocat/Hello-World.git', 'hello-world', { depth: 1, branch: 'main' });
console.log(repo.path, repo.branch);
```

#### `client.pull(repoName, options?) => Promise<PullResultInfo>`
Underlying git: `git pull [<remote>] [<branch>] [--rebase]` then `git status`.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoName` | `string` | yes | Repo name under `baseDir`, or absolute/`:` path. Path must exist. |
| `options.remote` | `string` | no | default `'origin'` |
| `options.branch` | `string` | no | branch to pull |
| `options.rebase` | `boolean` | no | adds `--rebase` |

Returns `PullResultInfo`: `{ name, path, result: PullResult, status: StatusResult, pulledAt }`.

#### `client.push(repoName, options?) => Promise<PushResultInfo>`
Underlying git: `git push <remote> [<branch>] [--force] [--set-upstream]` then `git status`.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoName` | `string` | yes | Repo name/path. |
| `options.remote` | `string` | no | default `'origin'` |
| `options.branch` | `string` | no | branch to push |
| `options.force` | `boolean` | no | adds `--force` |
| `options.setUpstream` | `boolean` | no | adds `--set-upstream` |

Returns `PushResultInfo`: `{ name, path, result: PushResult, status, pushedAt }`.

#### `client.status(repoName) => Promise<StatusResultInfo>`
Underlying git: parallel `git status` + `getRemotes(true)` + `branch(['-a'])` + `git log --max-count=5`.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoName` | `string` | yes | Repo name/path (must exist). |

Returns `StatusResultInfo`: `{ name, path, branch?, status: StatusResult, remotes, branches, recentCommits: DefaultLogFields[], lastUpdated }`.

#### `client.listRepositories() => Promise<StatusResultInfo[]>`
No params. Reads every subdirectory of `baseDir`, keeps those containing a `.git` dir, calls `status()` on each (invalid ones skipped). Returns array of `StatusResultInfo`.

#### `client.init(repoName, options?) => Promise<InitResultInfo>`
Underlying git: `mkdir -p <path>` then `git init [--bare]`.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoName` | `string` | yes | Repo name/path; throws `ValidationError` if it already exists. |
| `options.bare` | `boolean` | no | bare repo |

Returns `InitResultInfo`: `{ name, path, bare, initializedAt }`.

### B. Operations API (`operations.<fn>` and top-level re-exports)

These are exported both as the `operations` namespace and as flat functions (`cloneRepository`, `pullRepository`, `pushRepository`, `getRepositoryStatus`, `listRepositories`, `initRepository`, `syncRepository`, `batchClone`, `batchSync`, `getRepositoryHealth`). Each takes an options object whose `client` field configures a freshly-constructed `GitClient`.

Shared `OperationClientOptions` (the `client` field): `{ token?, baseDir?, verbose?, timeout? }`.

#### `cloneRepository(repoUrl, targetDir?, options?: CloneOperationOptions) => Promise<RepositoryInfo>`
Wraps `client.clone`. `CloneOperationOptions`: `{ client?, clone?: CloneOptions, onProgress?, onStageChange?, onComplete?, showProgress?: boolean, progressManager? }`. When `showProgress` is true uses a CLI progress manager; else silent.

#### `pullRepository(repoName, options?: PullOperationOptions) => Promise<PullResultInfo>`
`{ client?, pull?: PullOptions }`.

#### `pushRepository(repoName, options?: PushOperationOptions) => Promise<PushResultInfo>`
`{ client?, push?: PushOptions }`.

#### `getRepositoryStatus(repoName, options?: StatusOperationOptions) => Promise<StatusResultInfo>`
`{ client? }`.

#### `listRepositories(options?: ListOperationOptions) => Promise<StatusResultInfo[]>`
`{ client? }`.

#### `initRepository(repoName, options?: InitOperationOptions) => Promise<InitResultInfo>`
`{ client?, init?: InitOptions }`.

#### `syncRepository(repoName, options?: SyncOperationOptions) => Promise<SyncResult>`
Pull, then optional push. `{ client?, pull?, push?, autoPush?: boolean }`. Pushes only if `autoPush` and `status.ahead > 0`. Returns `SyncResult`: `{ name, path, pull: PullResultInfo, push?: PushResultInfo, syncedAt }`.

#### `batchClone(repoUrls, options?: BatchCloneOptions) => Promise<BatchResult<RepositoryInfo>>`
Clones many URLs with bounded concurrency. `{ client?, clone?, onProgress?(url, ProgressEvent), onComplete?(url, result|null, error|null), concurrency? (default 3) }`. Returns `BatchResult<T>`: `{ successful: T[], failed: {repoUrl?, repoName?, error}[], total, successCount, errorCount }`.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoUrls` | `string[]` | yes | URLs to clone (each into its own basename dir). |

#### `batchSync(repoNames, options?: BatchSyncOptions) => Promise<BatchResult<SyncResult>>`
`{ client?, pull?, push?, autoPush?, onComplete?(name, result|null, error|null), concurrency? (default 3) }`.

| Param | Type | Req | Description |
|-------|------|-----|-------------|
| `repoNames` | `string[]` | yes | Repo names/paths to sync. |

#### `getRepositoryHealth(repoName, options?: StatusOperationOptions) => Promise<RepositoryHealth>`
Runs `status()`, derives issues/recommendations from `conflicted`, `behind`, `ahead`, `modified`. Returns `RepositoryHealth`: `{ name, path, healthy, issues: string[], recommendations: string[], lastChecked }`.

```js
import { getRepositoryHealth } from '@internal/github-sdk-clone';
const h = await getRepositoryHealth('hello-world', { client: { baseDir: './my-repos' } });
console.log(h.healthy, h.issues);
```

### C. Validation helpers (exported from `.`)

Pure functions; throw `ValidationError` on failure, otherwise return a parsed result object.

| Function | Signature | Notes |
|----------|-----------|-------|
| `validateRepository` | `(repoUrl, options?: {allowSSH?,allowHTTPS?,requireGitHub?}) => RepositoryValidationResult` | parses owner/repo, SSH/HTTPS/GitHub flags |
| `validatePath` | `(path, options?: {mustExist?,mustBeDirectory?,mustBeFile?,checkWritable?}) => PathValidationResult` | also detects `.git` repo |
| `validateDirectoryName` | `(name, options?: {maxLength?,allowDots?}) => DirectoryNameValidationResult` | rejects unsafe/reserved names |
| `validateGitRef` | `(ref, options?: {type?: 'branch'\|'tag'}) => GitRefValidationResult` | branch/tag ref rules |
| `validateGitHubToken` | `(token) => GitHubTokenValidationResult` | matches `gh[pousr]_…` or 40-char classic; returns `type` |
| `validateCloneOptions` | `(options?: CloneOptions) => CloneOptionsValidation` | validates `branch`/`depth`/`bare` |
| `validateRepositoryOperation` | `(params: {repoUrl, targetDir?, options?}) => RepositoryOperationValidationResult` | composite |

### D. Progress utilities (exported from `.` and `./progress`)

- `class GitProgressManager` — methods `start(opId, desc, totalSteps=100)`, `update(step, msg?)`, `advance(steps=1, msg?)`, `setStage(stage, desc?)`, `complete(result?)`, `error(err)`, `createGitProgressCallback()`. Options: `{ silent?, onProgress?, onStageChange?, onComplete?, enableCLI? }`.
- `createProgressManager(options?)` — generic.
- `createSilentProgressManager(callbacks?)` — silent, callbacks only.
- `createCLIProgressManager(options?)` — terminal progress bar.
- `CLONE_STAGES` — const map: `INITIALIZING`, `CLONING`, `RESOLVING_DELTAS`, `CHECKING_OUT`, `COMPLETE` (enum-like; values are the lowercase strings).

---

## Convenience Functions

Top-level helpers that flatten the nested operation options. All take `(arg, options?: ConvenienceOptions)`. `ConvenienceOptions` flattens: `token, baseDir, verbose, timeout` (client) + `branch, depth, bare, remote, rebase, force, setUpstream, autoPush` + progress fields (`onProgress, onStageChange, onComplete, showProgress, progressManager`).

| Function | Signature | Delegates to |
|----------|-----------|--------------|
| `clone` | `(repoUrl, targetDir?, options?) => Promise<RepositoryInfo>` | `cloneRepository` |
| `pull` | `(repoName, options?) => Promise<PullResultInfo>` | `pullRepository` |
| `push` | `(repoName, options?) => Promise<PushResultInfo>` | `pushRepository` |
| `status` | `(repoName, options?) => Promise<StatusResultInfo>` | `getRepositoryStatus` |
| `list` | `(options?) => Promise<StatusResultInfo[]>` | `listRepositories` |
| `init` | `(repoName, options?) => Promise<InitResultInfo>` | `initRepository` |
| `sync` | `(repoName, options?) => Promise<SyncResult>` | `syncRepository` |

`packageInfo: { name, version, description, homepage }` — static metadata export.

```js
import { clone, status } from '@internal/github-sdk-clone';
await clone('https://github.com/octocat/Hello-World.git', 'hello-world', { depth: 1, baseDir: './repos' });
const s = await status('hello-world', { baseDir: './repos' });
```

---

## Errors

All errors extend `GitError`. Each has a `toJSON()` producing `{ name, message, stack?, timestamp, context, originalError? , ...subclass fields }`.

| Class | Extra fields | Thrown when |
|-------|--------------|-------------|
| `GitError` | `originalError?`, `context`, `timestamp` | base; every method wraps its failure as `GitError("<Op> failed: …", originalError)` |
| `AuthError` | — | mapped by `wrapError` on `Authentication failed`/`Permission denied`/`401`/`403` |
| `ValidationError` | `validationDetails: {field?,value?,type?,…}` | bad URL/path/name/ref/token/options; existing target dir on `clone`/`init` |
| `RepositoryError` | `repoName?`, `operation?` | `wrapError` for repo/clone/push/pull message patterns |
| `CloneError` | `repoUrl?`, `targetDir?` (+ inherited repoName/operation) | clone-specific (subclass of `RepositoryError`) |
| `NetworkError` | `url?`, `statusCode?` | `wrapError` on `ENOTFOUND`/`ECONNREFUSED`/`timeout`/`network` |
| `FileSystemError` | `path?`, `operation?` | `wrapError` on `ENOENT`/`EACCES`/`EPERM`/file/directory |
| `ConfigError` | `configKey?`, `configValue?` | invalid configuration (constructed manually) |

**Error utilities:** `wrapError(error, operation, context?) => GitError` (pattern-maps a raw Error to the right subclass), `isErrorType(error, ErrorClass) => boolean`, `getErrorInfo(error) => JSON` (uses `toJSON()` for `GitError`s).

Note: in practice the client methods always rethrow as plain `GitError` (`"Clone failed: …"`, etc.); `ValidationError` surfaces for pre-flight validation failures. The richer subclasses (`AuthError`, `NetworkError`, …) are produced only via `wrapError`, which the SDK exposes but does not call internally on the happy path.

---

## CLI

**Bin name:** `gh-clone` (maps to `dist/esm/cli.js`). Built on `commander`. Loads `.env` via `dotenv` at startup.

**Global options:**
`-t, --token <token>` · `-d, --base-dir <dir>` (default `./repositories`) · `--timeout <ms>` (default `300000`) · `-v, --verbose` · `-q, --quiet` · `--json` (output JSON) · `--no-color`.

**Token passing:** `--token` flag → config file (`~/.gh-clone/config.yml`) `token` → `GITHUB_TOKEN` env.

**Commands:**

| Command | Args | Options | Action |
|---------|------|---------|--------|
| `clone <repo-url> [target-dir]` | url, optional dir | `-b/--branch`, `--depth` (int), `--bare`, `--no-progress` | clone with CLI progress bar |
| `pull <repo-name>` | name | `-r/--remote` (origin), `-b/--branch`, `--rebase` | pull (ora spinner) |
| `push <repo-name>` | name | `-r/--remote`, `-b/--branch`, `-f/--force`, `-u/--set-upstream` | push |
| `status <repo-name>` | name | — | show status, branch, ahead/behind, recent commits |
| `list` (alias `ls`) | — | — | list managed repos |
| `init <repo-name>` | name | `--bare` | init new repo |
| `sync <repo-name>` | name | `-r/--remote`, `-b/--branch`, `--auto-push`, `--rebase` | pull then optional push |
| `config` | — | — | interactive `inquirer` wizard; writes `~/.gh-clone/config.yml` |

**Output format:** human-readable colored text by default (chalk + ora). With `--json`, prints `JSON.stringify(result, null, 2)`. `--quiet` suppresses non-error output. Errors print `{ error, type, timestamp, details? }` and exit `1`.

**Config file** (`~/.gh-clone/config.yml`, YAML): `{ baseDir, token, verbose, timeout, git: { maxConcurrentProcesses, timeout }, ui: { color, progress } }`. Helpers `loadConfig`, `saveConfig`, `setupConfig`, `getConfig`, `setConfig`, `resetConfig`, `showConfig`, `validateConfig` live in `src/cli/config.ts` (not part of the public package `exports`).

---

## Proxy support

Node's `fetch` ignores `HTTPS_PROXY`. This CLI does not.

```sh
gh-clone --proxy http://proxy.example.test:8080 <command>
gh-clone --proxy-bypass 'ghe.internal,.corp.example' <command>
gh-clone --no-proxy <command>
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

### `gh-clone` and git transport

**`--proxy` does not affect repository transfers.** `gh-clone` moves repositories with `git`, not
over the GitHub API, and a subprocess's proxying is git's own configuration. The flags are
registered here so that `--proxy` parses and validates identically in all eleven binaries, and
`gh-clone` prints a notice when you pass one rather than accepting it silently.

To proxy git itself:

```sh
git config --global http.proxy http://proxy.example.test:8080
# or, for one command:
git -c http.proxy=http://proxy.example.test:8080 clone https://github.com/owner/repo
# git also honors https_proxy/HTTPS_PROXY in its own environment
```

Proxying git traffic from this tool is a deliberate non-goal: it would mean writing git
configuration on a user's machine.

## UI Workbench Generation Guide

Build a small web app that exercises every capability above. Because **every capability shells out to a local `git` binary and reads/writes the local filesystem, the workbench MUST have a Node/server backend** — pure-browser execution is impossible. Render a thin React/HTML frontend that POSTs form payloads to a backend route which calls the SDK method and streams back the result. (The "GitHub API" surface here is only token-into-URL; there is no `https://api.github.com` call in this package — but the authenticated clone reaches out to `github.com` over the network from the backend.)

**Top-level controls (memory only, never persisted to disk/localStorage):**
- A **Token** field (`GITHUB_TOKEN`) — masked password input, kept in server-process memory for the session.
- A **Base directory** text input (default `./repositories`) — the on-disk root for all repos. Treat as a local-path field (text input; offer a server-side directory picker if available).
- An optional **Timeout (ms)** and **Verbose** toggle (global client opts).

**Left nav, grouped by area:**
1. **Local-git ops (GitClient)** — clone, pull, push, status, listRepositories, init.
2. **Operations API** — cloneRepository, pullRepository, pushRepository, getRepositoryStatus, listRepositories, initRepository, syncRepository, getRepositoryHealth.
3. **Batch** — batchClone, batchSync.
4. **Convenience** — clone/pull/push/status/list/init/sync (flat-option variants).
5. **Validation** — validateRepository, validatePath, validateDirectoryName, validateGitRef, validateGitHubToken, validateCloneOptions, validateRepositoryOperation (pure, can show inline results without git).
6. **Progress / Meta** — show `CLONE_STAGES`, live progress events; display `packageInfo`.

**Auto-form per capability** (drive from the param tables above):

| Source type | Widget |
|-------------|--------|
| `string` | text input |
| `number` (depth, timeout, concurrency) | number input |
| `boolean` (bare, rebase, force, setUpstream, autoPush, verbose, showProgress) | checkbox |
| enum (`CLONE_STAGES` value, git-ref `type` branch/tag) | select — list the literal values |
| array (`repoUrls`, `repoNames`) | repeatable text rows |
| object (`gitOptions`, generic `options`) | JSON editor |
| local path (`baseDir`, `targetDir`, `repoName`/`path`) | text input + optional server-side file/dir picker |
| callbacks (`onProgress`, `onStageChange`, `onComplete`, `progress`) | omit from form; wire automatically to stream progress to the UI |

**Submit behavior:** the backend constructs/uses a `GitClient` (or calls the operation/convenience fn) with the form values, awaits the result, and the UI renders:
- the returned object as pretty JSON (and a friendly summary: path, branch, ahead/behind, etc.),
- **git stdout/stderr** where relevant (clone/pull/push) — surface the `result` field (`PullResult`/`PushResult`) and any progress-event stream,
- on failure, the §Errors shape: `name`, `message`, `validationDetails`/`repoUrl`/`targetDir`/`path`/`statusCode` etc. via `getErrorInfo()`.

**Live progress:** for clone/batchClone wire `createCLIProgressManager`-style callbacks server-side and push `ProgressEvent`/`StageChangeEvent`/`CompleteEvent` to the UI (SSE/WebSocket) to render a progress bar driven by `CLONE_STAGES`.

**Destructive / filesystem-mutating ops — require a confirm step** before execution:
- `clone` / `cloneRepository` / `batchClone` (creates directories; fails if target exists),
- `init` / `initRepository` (creates directory + `git init`),
- `push` / `pushRepository` / `batchSync` / `sync` (mutates remote; especially with `--force`/`force`),
- `pull` / `sync` (mutates working tree; `--rebase` rewrites history).
Read-only ops (`status`, `listRepositories`, `getRepositoryHealth`, all `validate*`, `packageInfo`) need no confirm.

**Scope:** single-user, manual testing. No multi-tenant auth, no concurrency limits beyond the SDK's own `concurrency`/`maxConcurrentProcesses`. Surface `baseDir` prominently so the tester always knows which directory on disk is being mutated.
