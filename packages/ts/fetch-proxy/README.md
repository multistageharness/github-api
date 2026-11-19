# `@internal/github-sdk-fetch-proxy`

Opt-in HTTP-proxy support for the GitHub fetch layer.

Node's global `fetch` ignores `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` on every runtime this
repository supports. Behind a corporate proxy that turns every GitHub call into a connection error
naming DNS, with no flag or variable that fixes it. This package is what makes a proxy an ordinary
configuration setting instead.

**It exists as a separate package for one reason: so the three fetch packages do not grow an HTTP
dependency.** `@internal/github-sdk-fetch-rest-api` sits beneath fourteen packages and its
footprint is inherited by all of them. `undici` enters the repository here and nowhere else, and a
consumer who never proxies installs nothing and gets a byte-identical dependency tree.

## Install

```sh
npm install @internal/github-sdk-fetch-proxy
```

```json
{ "dependencies": { "@internal/github-sdk-fetch-proxy": "^0.0.1" } }
```

## Use it

**Importing this package is the opt-in.** One import, once, anywhere before a client is
constructed:

```ts
import '@internal/github-sdk-fetch-proxy';
import { GitHubRestClient } from '@internal/github-sdk-fetch-rest-api';

new GitHubRestClient();                                        // HTTPS_PROXY is now honored
new GitHubRestClient({ proxy: 'http://proxy.example.test:8080' });
new GitHubRestClient({ proxy: null });                         // direct, whatever the environment says
```

It works the same for `GitHubGraphQLClient` and `GitHubSdk`, and for every package in this
repository that wraps them.

Prefer to say it out loud rather than rely on an import side effect:

```ts
import { installProxySupport } from '@internal/github-sdk-fetch-proxy';

installProxySupport();
```

`uninstallProxySupport()` undoes it. After that, constructing a client with a proxy configured
throws again — which is the correct behavior, not a regression.

## A configured proxy is never silently ignored

Configure a proxy without this package installed and construction fails:

```
GitHubProxyUnavailableError: A proxy is configured (http://proxy.example.test:8080) but proxy
support is not installed. Install it with `npm install @internal/github-sdk-fetch-proxy` and
import it once — `import '@internal/github-sdk-fetch-proxy';` — before constructing a client.
Requests are never sent direct when a proxy is configured.
```

This is deliberate and it is the whole point. Falling back to a direct connection would send
traffic an operator believed was proxied straight out of the network, and leave no trace that it
did — a compliance failure rather than a usability one. There is no flag to make it fall back.

## The CLI flags

The three flags every binary in this repository carries are registered from here, so `--proxy`
means the same thing in `gh-pr` as in `gh-repo`:

```ts
import {
  registerProxyOptions,
  validateProxyFlagsOrExit,
  proxyOptionsFrom,
} from '@internal/github-sdk-fetch-proxy';

registerProxyOptions(program);     // on the root program, so subcommands inherit
validateProxyFlagsOrExit();        // at startup, before commander routes anywhere

const client = new SomeClient({ ...proxyOptionsFrom(program.opts()) });
```

| Flag | Meaning |
| --- | --- |
| `--proxy <url>` | Use this proxy. Beats every proxy variable |
| `--no-proxy` | Connect direct. Beats every proxy variable |
| `--proxy-bypass <list>` | Comma-separated bypass list. Beats `NO_PROXY` |

`validateProxyFlagsOrExit()` runs at **startup**, not inside a command handler, so a bad flag is
reported as a message and a non-zero exit rather than as an unknown command or a stack trace. It
rejects two things:

- **`--proxy X --no-proxy` together.** Commander pairs the two onto one key and lets the last one
  win, so by the time options are parsed the contradiction is invisible —
  `hasConflictingProxyFlags` reads the argument vector instead.
- **A `--proxy` value that cannot be a proxy URL**, using the fetch layer's own validator, so the
  flag and `HTTPS_PROXY` reject exactly the same values with the same message and the same
  redaction.

`proxyFlagsFromArgv()` is the same three flags read straight off `process.argv`, for a CLI that
builds its client at module scope before commander has parsed anything.

`commander` is typed structurally here, not imported: a library consumer who wants a proxy should
not install a CLI framework to get one.

## What it actually does

It registers a factory that turns a resolved proxy into a **transport** — a `fetch` bound to an
undici `ProxyAgent`, plus the agent itself.

A transport rather than only a dispatcher, because **the platform global `fetch` silently discards
an init `dispatcher`** (measured on Node 24). A seam that handed back only a dispatcher would
produce a client that reported itself as proxying and connected direct — the exact failure the
error above exists to prevent. undici's own `fetch` does honor it, so binding one to the agent is
the transport. The dispatcher travels alongside for a host that injected its own undici-based
`fetch`.

Credentials in the proxy URL become a `Proxy-Authorization: Basic …` header, decoded before
re-encoding so a password containing `@` or `:` authenticates as itself. That header goes to the
proxy; your GitHub token goes to GitHub. They never cross.

Building the agent opens **no socket** — it holds the address and dials on first use — which is
what keeps proxy support inside the layer's "no I/O at construction" rule.

## Supply your own

```ts
import { setProxyTransportFactory } from '@internal/github-sdk-fetch-rest-api';

setProxyTransportFactory((target) => ({
  fetch: myProxyingFetch(target.url),
  dispatcher: myDispatcher,
  close: () => myDispatcher.destroy(),
}));
```

The factory receives the proxy URL with credentials intact — it issues the `CONNECT`, so it is the
one place they are needed — alongside a redacted form safe to log and the base URL whose traffic it
carries. Registering twice replaces rather than layers.

## Node version

This package requires **Node ≥ 18.17**, the floor `undici` v6 sets. The three fetch packages keep
their `>= 18.0.0` floor untouched; only a consumer who opts into proxying takes the higher one.

## Scope

SOCKS, PAC/WPAD auto-configuration, custom CA bundles, mTLS and per-request proxy overrides are
out of scope. `NODE_EXTRA_CA_CERTS` covers the common TLS-intercepting case with no code here, and
`transportInit` on the fetch clients remains the seam for the rest.

Proxying **git** traffic is not this package's job either. `gh-clone` transfers repositories with
`git`, not over the GitHub API; configure git itself
(`git config --global http.proxy http://proxy.example.test:8080`).

## Testing

```sh
cd fetch-proxy && npx vitest run
```

The suite stands up a real `CONNECT` proxy in front of a real origin, both on loopback, and asserts
that a configured client tunnels through it — no external proxy and no external network. Run it
from the package directory: the workspace root does not apply this package's `tests/setup.env.ts`,
and a `HTTPS_PROXY` in your shell would otherwise decide half the assertions.
