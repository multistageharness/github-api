# github-search-wizard

An interactive [`@clack/prompts`](https://github.com/bombshell-dev/clack) wizard over the seven
GitHub Search endpoints — repositories, code, commits, issues, users, labels and topics.

It walks you through choosing an endpoint, composing a `q` query with the qualifiers that actually
apply to it, picking a valid `sort` for that endpoint, and paging the results. It also offers a
guided **file + content** mode that composes a code-search query for you. Ctrl-C at any prompt exits
cleanly with code `0`.

---

## Where this lives

This package is an npm workspace of `github-api/v100/packages/ts`, alongside the SDK packages it
uses. `package.json` depends on them by name and semver range:

```json
"@internal/github-sdk-search": "^0.0.1",
"@internal/github-sdk-ratelimit": "^0.0.1",
"@internal/github-sdk-fetch-rest-api": "^0.0.1",
"@internal/github-sdk-fetch-proxy": "^0.0.1"
```

npm workspaces link them from the sibling directories (`../search`, `../ratelimit`,
`../fetch-rest-api`, `../fetch-proxy`) into the workspace root's `node_modules/`. Only `search`,
`fetch-proxy` and `fetch-rest-api` are imported here; all four are listed so the search SDK's own
`@internal/*` dependencies resolve to the same versions. When the search SDK gains a new
`@internal/*` dependency, add it here too.

The SDK packages export only from their `dist/`, so they must be built before this package can be
type-checked, tested, or run. An unbuilt SDK fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (or
`Cannot find module`), which reads like a bad specifier rather than a missing build.

## Install

Requires Node.js `>=20.19` (see `engines`). Install and build from the workspace root
(`github-api/v100/packages/ts`); dependencies are hoisted there:

```bash
cd github-api/v100/packages/ts
npm install
npm run build            # every workspace, SDK packages included
```

The `github-search-wizard` bin is `dist/esm/cli.js`. The build is the workspace's dual ESM + CommonJS
output (`dist/esm/`, `dist/cjs/`); the CLI's version is generated from `package.json` into
`src/version.ts` at build time (`../scripts/gen-version.mjs`), so `--version` always matches the
manifest.

---

## Token

A token is mandatory. This CLI refuses to run unauthenticated — unlike the SDK, which permits
anonymous requests at a much lower rate limit. Two reasons: GitHub's **code search requires a token
outright**, so an anonymous wizard would fail confusingly on one of seven endpoints; and the sibling
`github-search` CLI already establishes throw-on-missing-token as the house behavior.

Resolution order:

| # | Source | Notes |
|---|--------|-------|
| 1 | `--token <value>` or `--token-stdin` | Highest precedence. `--token` is visible in shell history and `ps`, and prints a warning; `--token-stdin` reads the first line of stdin instead |
| 2 | `GITHUB_TOKEN` | A `.env` file in this package directory is loaded automatically |
| 3 | `GH_TOKEN` | Used when `GITHUB_TOKEN` is unset or blank (`.claude/rules/github.md`) |
| 4 | Hidden prompt | Interactive mode only; input is masked, asked before the search questions |

The token is held in memory only: never echoed, never written to disk, never included in `--json`
output, never persisted into a saved result.

```bash
# .env  (gitignored)
GITHUB_TOKEN=<your personal access token>
```

```bash
printf '%s\n' "$MY_TOKEN" | github-search-wizard --endpoint code --q "TODO in:file" --token-stdin --json
```

The `.env` file is read from this package's directory only — never from the current directory, where
a stray `.env` could redirect `GITHUB_API_URL` and carry the token elsewhere. Set `GSW_DOTENV=0` to
skip it entirely.

In non-interactive mode the prompt tier is skipped entirely — a headless run with no token exits `1`
immediately rather than blocking forever on a hidden prompt.

---

## Interactive usage

```bash
npx github-search-wizard
# or, directly:
node dist/esm/cli.js   # after `npm run build`
```

The wizard asks, in order:

1. **How do you want to search?** — *General search*, or *File + content search*.
2. *General:* **which endpoint** (one of the seven), then the **query**, with a placeholder showing
   that endpoint's real qualifiers. Choosing `labels` additionally asks for a numeric
   **repository ID**, which the SDK requires.
   *File + content:* a **file name** and a **content term**, composed into
   `<content> in:file filename:<name>` and dispatched to code search. A content term is mandatory —
   GitHub rejects a qualifiers-only code query.
3. **Sort by** — only that endpoint's documented values, plus *best match (default)*. `topics` offers
   the default alone; GitHub topic search is relevance-only.
4. **Order** — asked only when you picked a sort, since direction is meaningless for relevance ranking.
5. **Results per page** (1–100) and **page** (≥ 1), validated at the prompt rather than by the API.

Ctrl-C at any prompt prints a yellow `Cancelled.` and exits `0`. Cancelling is a choice, not a failure.

The wizard needs a terminal on both stdin and stdout. Without one (CI, a pipe) the CLI exits `2`
with a usage message instead of hanging. `--json` cannot be combined with the wizard, because its
prompts are drawn on stdout; pass `--endpoint` and `--q` instead. `-i` / `--interactive` forces the
wizard.

## Non-interactive usage

Supplying **any** search flag (`--endpoint`, `--q`, `--sort`, `--order`, `--per-page`, `--page`,
`--repository-id`) selects non-interactive mode, which opens **zero** prompts. What is missing or empty
is then an error: `--q "$EMPTY"` exits `1`, it never falls back to the wizard.

```bash
github-search-wizard --endpoint repositories --q "language:typescript stars:>1000" \
  --sort stars --order desc --per-page 5

github-search-wizard --endpoint code --q "TODO in:file" --json | jq .total_count

github-search-wizard --endpoint labels --q bug --repository-id 1300192 --json
```

| Flag | Meaning |
|------|---------|
| `--endpoint <name>` | `repositories`, `code`, `commits`, `issues`, `users`, `labels`, `topics` |
| `--q <query>` | The GitHub search query string |
| `--sort <field>` | Validated against the chosen endpoint's enum |
| `--order <asc\|desc>` | Validated; ignored with a warning when `--sort` is absent |
| `--per-page <1-100>` | Default `GITHUB_SEARCH_PER_PAGE`, else GitHub's `30` |
| `--page <n>` | Default `1`. `page × per-page` must be `<= 1000`: GitHub serves only the first 1000 results |
| `--repository-id <n>` | Mandatory for `labels`; rejected for every other endpoint |
| `--output-dir <dir>` | Where results are persisted (see *Result output*) |
| `--no-save` | Do not persist the result |
| `--token <value>` | Overrides `GITHUB_TOKEN` / `GH_TOKEN` (prefer `--token-stdin`) |
| `--token-stdin` | Read the token from the first line of stdin |
| `--proxy <url>` | Route requests through this HTTP proxy (beats `HTTPS_PROXY`) |
| `--no-proxy` | Connect direct, ignoring every proxy variable |
| `--proxy-bypass <list>` | Hosts reached directly (beats `NO_PROXY`) |
| `-i`, `--interactive` | Force the wizard |
| `--json` | Print only JSON to stdout |
| `-h`, `--help` | Usage; exits `0` |
| `--version` | Print the version |

### Environment

| Variable | Meaning |
|----------|---------|
| `GITHUB_TOKEN`, `GH_TOKEN` | Token, in that order (see *Token*) |
| `GITHUB_API_URL` | REST API base URL, e.g. `https://ghe.example.com/api/v3`. Injected by GitHub Actions |
| `GITHUB_API_BASE_URL` | Deprecated alias of `GITHUB_API_URL`, still honored below it |
| `GH_HOST` | Hostname, mapped like the `gh` CLI (`github.com` → `api.github.com`, else `https://<host>/api/v3`); used when neither URL variable is set |
| `GITHUB_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | Proxy settings, honored by the transport (proxy support is loaded at startup) |
| `GITHUB_SEARCH_PER_PAGE` | Default page size (1–100); an invalid value warns and falls back to 30 |
| `GITHUB_SEARCH_OUTPUT_DIR` | Default output directory |
| `GSW_DOTENV=0` | Do not load this package's `.env` |

`--json` prints **only** `JSON.stringify(result, null, 2)` to stdout — no banner, no spinner frame, no
outro — so `… --json | jq` is always safe. Warnings, errors, and the saved-artifact path go to stderr.

Every failure exits `1` with a single-line message and no stack trace; a usage error (a bad flag
combination, or the wizard with no terminal) exits `2`. A `RateLimitError` reports GitHub's message
and its reset time, absolute and relative, rather than a bare `403`. Network, timeout and proxy
failures name the underlying code (`ENOTFOUND`, `ECONNREFUSED`) with a one-line hint.

---

## Result output

Every completed search is printed first and then written as JSON to a per-user state directory:

```
~/.local/state/github-search-wizard/20260708T181248Z-repositories-language-typescript-a1b2c3d4.json
```

The directory is `$XDG_STATE_HOME/github-search-wizard` (default `~/.local/state/…`), overridable
with `GITHUB_SEARCH_OUTPUT_DIR` or `--output-dir`; `--no-save` skips it. It is deliberately **not**
the current directory: run from inside another repository, a cwd-relative folder would sit untracked
in that working tree, one `git add .` away from committing `code` search results. If the write fails
(read-only disk, permissions), the CLI warns on stderr and still exits `0` — the result was already
printed.

The filename is **derived** — the query is slugified, truncated, and suffixed with a short hash of the
full query — never interpolated, because a real query (`repo:nodejs/node is:open`) is full of `/`,
`:` and `..`. The sink is never destructive: the directory accumulates, and nothing is overwritten.

If you point `--output-dir` inside a repository, gitignore it: results are large, reproducible, and —
for `code` search against private repositories — contain source the owner never intended to vendor.
This package's own `.gitignore` covers `.output/`. No persisted artifact ever contains your token; a
test asserts it.

---

## The seven endpoints

Each accepts a different `sort` enum, transcribed in [`src/sort-enums.ts`](src/sort-enums.ts) from
the SDK's `INTERFACE.md`. See [`../search/INTERFACE.md`](../search/INTERFACE.md) for the full per-endpoint
reference, including every qualifier and the exact return shapes.

Note that `labels` search requires a numeric `repository_id`. The older `github-search` CLI in the SDK
has no flag for it and cannot perform label search at all; this wizard closes that gap.

---

## Development

Run from this directory (or `make <target>`, a thin wrapper over the same scripts):

```bash
npm run typecheck   # tsc --noEmit over src/, tests/ and live/ (strict)
npm run lint        # eslint over src/
npm test            # vitest run
npm run build       # dual ESM + CJS build into dist/
npm run test:live   # opt-in: GITHUB_LIVE=1, real api.github.com, read-only
```

`npm test` makes **zero** network calls: every SDK-touching test stubs `fetch`, and the end-to-end
tests drive the real entry point with `fetch` replaced at the process boundary. It needs no prior
build of this package: a Vitest global setup (`tests/global-setup.ts`) compiles `dist/esm/` before
the suites that spawn the CLI run (the SDK workspaces still have to be built, see *Where this lives*).

Every suite runs without setup, CI included: fixture values are generated at runtime
(`fixture-<uuid>`). Copying `.env.testdata.example` to `.env.testdata` and setting `FIXTURE_VALUE_1`
only pins that value. Never put a real credential there; nothing in the suite needs a working one.

The end-to-end tests drive `dist/esm/cli.js` with `fetch` stubbed (`tests/fetch-stub.ts`, transpiled
by the global setup and preloaded with `node --import`; configurable via `STUB_STATUS`,
`STUB_HEADERS` and `STUB_BODY`), run with `GSW_DOTENV=0`, and scrub `GITHUB_*`, `GH_*` and proxy
variables from the inherited environment. The wizard's questions live in `src/wizard.ts` with
`clack` injected, so their order and branches are tested with a scripted double.
