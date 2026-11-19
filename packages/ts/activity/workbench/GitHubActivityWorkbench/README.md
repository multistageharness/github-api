# @local/github-activity-workbench

A self-contained **atomic-design organism** package: a capability workbench for
`@internal/github-sdk-activity`. It lists every live-API capability, builds a request from a
type-driven form, sends it via `fetch`, and renders status, rate-limit headers, pagination links,
and the JSON body. Single-user, in-memory — the PAT lives in component state only.

> Agents working inside this package: read [`.AGENT.md`](./.AGENT.md) first.

## Quick start

```bash
make up      # install + start the vite dev harness (background)
make logs    # tail the dev log
make down    # stop
```

Dev URL: <http://localhost:5217>.

Or via Docker, from the activity package root (`packages/ts/activity`):

```bash
make compose-up      # docker compose up -d the workbench
make compose-down    # stop it
```

## Consuming the organism

```tsx
import { GitHubActivityWorkbench } from '@local/github-activity-workbench';

export default function App() {
  return <GitHubActivityWorkbench />;
}
```

See [`src/organisms/GitHubActivityWorkbench/README.md`](./src/organisms/GitHubActivityWorkbench/README.md)
for the full prop list, and `dev/example-*.tsx` for reference integrations.

## Layout

```
src/
  atoms/        MethodBadge, Icon, Toggle, Chip, StatusDot
  molecules/    Field, RequestLine, RateLimitChips, StatusPill
  organisms/    GitHubActivityWorkbench/ (+ private parts/, capabilities.ts, request.ts, types.ts)
  featureFlags/ package-local useFeatureFlag gate
dev/            vite harness + example-*.tsx pages
```

## Invariants

- Strict atomic-design dependency direction (atoms ← molecules ← organisms). No upward imports.
- Mandatory `useFeatureFlag` gate on every atom, molecule, and the organism.
- CSS modules in `src/`; Tailwind only in `dev/`.
- Organism-private `parts/` are never re-exported from the barrel.
