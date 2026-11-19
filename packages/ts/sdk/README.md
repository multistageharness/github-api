# `@internal/github-sdk`

Every published `@internal/github-sdk-*` package in one install — the way `lodash` relates to
`lodash.get`. It adds no code of its own: each package is re-exported unchanged.

## Usage

```ts
// All packages, one namespace each
import { repos, issues, ratelimit } from '@internal/github-sdk';
const client = new repos.RepoClient({ token });

// One package through its subpath (same module, same classes)
import RepoClient from '@internal/github-sdk/repos';

// Or install only what you need
// npm i @internal/github-sdk-repos
import RepoClient from '@internal/github-sdk-repos';
```

| Subpath | Namespace | Package |
| --- | --- | --- |
| `./ratelimit` | `ratelimit` | `@internal/github-sdk-ratelimit` |
| `./fetch-rest-api` | `fetchRestApi` | `@internal/github-sdk-fetch-rest-api` |
| `./fetch-graphql-api` | `fetchGraphqlApi` | `@internal/github-sdk-fetch-graphql-api` |
| `./fetch-github-sdk` | `fetchGithubSdk` | `@internal/github-sdk-fetch-github-sdk` |
| `./fetch-proxy` | `fetchProxy` | `@internal/github-sdk-fetch-proxy` |
| `./cli-progressor` | `cliProgressor` | `@internal/cli-progressor` |
| `./activity` | `activity` | `@internal/github-sdk-activity` |
| `./repos` | `repos` | `@internal/github-sdk-repos` |
| `./users` | `users` | `@internal/github-sdk-users` |
| `./reactions` | `reactions` | `@internal/github-sdk-reactions` |
| `./clone` | `clone` | `@internal/github-sdk-clone` |
| `./git` | `git` | `@internal/github-sdk-git` |
| `./issues` | `issues` | `@internal/github-sdk-issues` |
| `./pulls` | `pulls` | `@internal/github-sdk-pulls` |
| `./teams` | `teams` | `@internal/github-sdk-teams` |
| `./gist` | `gist` | `@internal/github-sdk-gist` |
| `./search` | `search` | `@internal/github-sdk-search` |

Namespaces are camelCased folder names. Subpaths re-export the package's `default` too where it has
one.

## Notes

- **Libraries only.** CLIs (`gh-repo`, `gh-pr`, …) come from installing the individual package.
- **Private packages are excluded:** `@local/repo-listing` and `github-search-wizard`.
- **Keeping in step.** `tests/umbrella.test.ts` fails when a published workspace package is missing
  from `dependencies`, its version range is stale, or its subpath or namespace is absent. Adding a
  package means: a dependency, an `exports` subpath, `src/<pkg>.ts`, and a line in `src/index.ts`.
