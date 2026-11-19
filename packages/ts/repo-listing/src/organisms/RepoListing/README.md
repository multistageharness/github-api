# RepoListing

Read-only, filterable listing of GitHub repositories with **table** and **cards** views.

Owns all listing state (fuzzy query, visibility / owner-type / owner filters, view) and
derives the computed GitHub URLs from each repo's `fullName`. Consumers pass plain repo
records — no computed fields required.

## Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `repos` | `Repo[]` | — | **Required.** Records without computed URLs. |
| `title` | `string` | `"Repositories"` | Heading text. |
| `initialView` | `'table' \| 'cards'` | `'table'` | Starting view. |
| `emptyMessage` | `string` | `"No repositories match your filters."` | Shown when filters exclude everything. |
| `noDataMessage` | `string` | `emptyMessage`, then `"No repositories to show."` | Shown when `repos` is empty. |
| `headingLevel` | `1–6` | `2` | Level of the title heading. |
| `baseUrl` | `string` | `"https://github.com"` | Web root for derived URLs (GitHub Enterprise). A repo's `htmlUrl` / `sshUrl` win. |
| `className` | `string` | — | Extra class on the root `<section>`. |
| `data-testid` | `string` | — | Forwarded to the root `<section>`. |
| `featureFlag` | `string` | — | Gates the whole organism. |
| `featureFlagFallback` | `ReactNode` | `null` | Rendered when the flag is off. |

## Usage

```tsx
import { RepoListing } from '@local/repo-listing';

<RepoListing repos={repos} initialView="cards" />;
```

## Variants

- **Default** — table view, all filters at `all`.
- **Cards view** — `initialView="cards"`.
- **Empty** — pass `repos={[]}` or a query that matches nothing.
- **Hidden** — `featureFlag` resolved off via a `FeatureFlagProvider`.

## Accessibility

- The "N of M shown" line is a polite live region, so filter results are announced.
- The table has a (visually hidden) caption; the cards view is a list of `<article>`s.
- The per-row links widget is a disclosure (button + list of links): Tab moves through
  the links, Escape closes it and returns focus, arrow keys move between links.
- Copy buttons are named `Copy <url>` and announce "Copied" / "Copy failed".

## Composition

- Atoms: `Badge`, `CopyButton`, `Select`.
- Molecules: `SearchField`, `ViewToggle`, `LinkMenu`, `CopyableUrl`.
- Private parts (`parts/`): `RepoListingHeader`, `RepoListingControls`, `RepoListingEmpty`,
  `RepoTable`, `RepoCard` — never re-exported.
