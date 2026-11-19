# GitHub API — TypeScript

A set of TypeScript packages for working with the GitHub API. Each package
ships a typed SDK (and, for the domain packages, a CLI) as a dual ESM + CJS
distributable with `.d.ts` declarations, tested with Vitest. The repository is
an npm workspaces monorepo.

## Packages

**Transport**

- `ratelimit` — shared rate-limit policy.
- `fetch-rest-api`, `fetch-graphql-api`, `fetch-github-sdk` — REST, GraphQL and
  SDK-shaped fetch layers.
- `fetch-proxy` — optional proxy transport.

**Domain (SDK + CLI)**

`activity`, `repos`, `users`, `reactions`, `clone`, `git`, `issues`, `pulls`,
`teams`, `gist`, `search`.

**Umbrella**

- `sdk` — every package in one install, available as namespaces or subpaths.

**Tools and UI**

- `cli-progressor` — terminal progress bars.
- `search-cli` — interactive and non-interactive search CLI.
- `repo-listing` — React repository-listing components.

## Requirements

Node.js 20.19+ (or 22.12+).

## Development

```bash
npm install          # install all workspaces
npm run typecheck    # strict type-check
npm test             # run tests
npm run build        # build ESM + CJS output per package
npm run lint         # lint
```

## Examples

Packages include an `examples/` folder with a connection test and runnable use
cases. Build the package first, then run an example with Node 22.18+:

```bash
npm run build --workspace <pkg>
node <pkg>/examples/00-connection-test.ts
```

Examples are read-only by default; anything that writes to GitHub requires
`ALLOW_WRITES=1`. Missing credentials are reported rather than causing a crash.

## Build

- `tsconfig.base.json` provides the strict baseline.
- Each package compiles twice: ESM into `dist/esm` and CommonJS into `dist/cjs`.
- `exports` maps expose matching type declarations for both module formats.

## CI

`make ci` runs install, lint, typecheck, test and build across all workspaces.
`make smoke` imports each built entry point and runs every CLI `--help`.
