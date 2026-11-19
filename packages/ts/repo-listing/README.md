# RepoListing

A self-contained **atomic-design organism package** (`@local/repo-listing`). Renders a
read-only, filterable listing of GitHub repositories with switchable **table** and
**cards** views, fuzzy search, and per-repo GitHub sub-page links.

It is the `repo-listing` workspace of the `packages/ts` npm workspace: dependencies
(including TypeScript and Vitest) are hoisted at the `packages/ts` root, and it follows
the workspace standard (`../tsconfig.base.json`, `../vitest.shared.ts`, shared ESLint
rules, dual `dist/esm` + `dist/cjs` build, root smoke gate).

## Quick start

```bash
cd github-api/v100/packages/ts   # workspace root
npm install                      # installs every workspace, this one included
cd repo-listing
make dev     # start vite in the background (make watch = foreground)
make logs    # tail the dev log
make down    # stop
```

Dev server: <http://localhost:5200>. On Windows without `make`/`lsof`, run
`npm install` at the workspace root, then `npm run dev` here.

## Usage

```tsx
import { RepoListing } from '@local/repo-listing';
import '@local/repo-listing/style.css'; // when consuming the built library (dist/)

<RepoListing repos={repos} initialView="cards" />;
```

Consumers pass plain `Repo[]` records; the organism derives the `https://` and `git@`
URLs internally from `baseUrl` (default `https://github.com`; set it for GitHub
Enterprise Server). REST repository objects can be mapped with `fromGitHubRepository()`.

The organism carries no page chrome (no viewport height, page background or outer
padding) and renders its title as an `<h2>` by default (`headingLevel` changes it), so
it can sit inside a card or panel; the dev examples add the page styling themselves.

## Layout

- `src/index.ts` — public barrel.
- `src/organisms/RepoListing/` — the organism, its `parts/`, stories, tests, README.
- `src/atoms/` — `Badge`, `CopyButton`, `Select`.
- `src/molecules/` — `SearchField`, `ViewToggle`, `LinkMenu`, `CopyableUrl`.
- `src/featureFlags/` — package-local feature-flag primitive (mandatory top-level gate).
- `dev/` — router-driven harness with example routes.

- `vite.config.ts` — dev-server config (root `dev/`); `vite.lib.config.ts` — library build;
  `vitest.config.ts` — tests (merges `../vitest.shared.ts`, jsdom, `src/**/*.test.{ts,tsx}`).

See [`src/organisms/RepoListing/README.md`](./src/organisms/RepoListing/README.md) for the
organism's props and behaviour.

## Scripts

Run from `repo-listing/` (or `npm run <script> --workspace @local/repo-listing` from the
workspace root).

| Command | Purpose |
|---------|---------|
| `make install` / `make ci-install` | `npm install` / `npm ci` at the workspace root |
| `make typecheck` / `npm run typecheck` | Strict `tsc --noEmit` (src, dev, configs) |
| `make lint` / `npm run lint` | ESLint over `src` + `dev` (`.ts` and `.tsx`; see `eslint.config.js`) |
| `make test` / `npm test` | Vitest once (jsdom; tests are colocated in `src/`) |
| `make build` / `npm run build` | Library build (below) |
| `make ci` | install → lint → typecheck → test → build |
| `make dev` / `make watch` / `make down` | Dev server background / foreground / stop (`make status`, `make logs`) |
| `make up` | Workspace install + start the dev server |
| `npm run build:dev` | Build the dev harness app (`dev/dist`) |

`npm run build` produces, React (`react`, `react-dom`, `react/jsx-runtime`) external:

- `dist/esm/index.js` (ES) and `dist/cjs/index.js` (CJS), via Vite library mode
  (CSS modules need Vite); the JS never imports CSS, so `require()` works in plain Node.
- `dist/style.css` — all component styles, exported as `@local/repo-listing/style.css`.
- `.d.ts` declarations in both `dist/esm` and `dist/cjs` (`tsc -p tsconfig.build.json`),
  plus the `type` markers written by `../scripts/fixup-dist.mjs`.

The workspace smoke gate (`node scripts/smoke.mjs` at the workspace root) imports
`dist/esm/index.js` and `require()`s `dist/cjs/index.js`.

## Conventions

- Components style with **CSS modules**; Tailwind is used only in `dev/`.
- Strict dependency direction: atoms ← molecules ← organism. No upward imports.
- Every atom, molecule, and the organism accepts `featureFlag` / `featureFlagFallback`
  and early-returns the fallback when the flag is off.
- `parts/` are organism-private and never re-exported.
