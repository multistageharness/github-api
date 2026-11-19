# GitHubActivityWorkbench (organism)

A single-user, in-memory capability workbench for `@internal/github-sdk-activity`. It lists every
live-API capability, builds a request from a type-driven form, sends it via `fetch`, and renders the
status, rate-limit headers, pagination links, and JSON body. Nothing is persisted — the PAT lives in
component state only.

## Props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `initialBaseUrl` | `string` | `https://api.github.com` | Seed the API base URL (e.g. a GHES host). |
| `initialToken` | `string` | `''` | Seed a token (memory only); mainly for examples. |
| `featureFlag` | `string?` | — | Mandatory visibility gate key. |
| `featureFlagFallback` | `ReactNode?` | `null` | Rendered when the gate resolves false. |

## Usage

```tsx
import { GitHubActivityWorkbench } from '@local/github-activity-workbench';

export default function App() {
  return <GitHubActivityWorkbench />;
}
```

## Composition

- **parts/** (organism-private, never re-exported): `TopBar`, `CapabilityNav`, `RequestForm`,
  `ResponsePanel`, `ConfirmDialog`.
- **molecules:** `Field`, `RequestLine`, `RateLimitChips`, `StatusPill`.
- **atoms:** `MethodBadge`, `Icon`, `Toggle`, `Chip`, `StatusDot`.
- **data/logic:** `capabilities.ts` (registry), `request.ts` (pure helpers), `types.ts` (contracts).

## Variants

- `Default` — default base URL, no token.
- `EnterpriseBaseUrl` — base URL override.
- `UnusualToken` — shows the token-format warning.
- `Hidden` — feature flag off → fallback.

## Note on I/O

As a live-API workbench this organism owns its `fetch` calls (that is its domain). Every request is
driven entirely by props/state — there is no hidden data source — so behaviour stays deterministic
and the component degrades down the typed ladder (`ready → error → network-error → flag-off`).
