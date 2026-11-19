/**
 * @fileoverview The one thing proxying needs that string work cannot do: a
 * dispatcher that opens a tunnel (PRD 0002, R11, D1).
 *
 * `undici` enters the repository here and nowhere else. That confinement is the
 * whole point of D1 — `fetch-rest-api` sits beneath fourteen packages and its
 * footprint is inherited by all of them, so the HTTP stack a proxy needs lives
 * in a package a consumer opts into rather than in the one everybody already
 * has.
 * @module agent
 */

import {
  redactProxyUrl,
  type ProxyTarget,
  type ProxyTransport,
} from '@internal/github-sdk-fetch-rest-api';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * Split a proxy URL into the address to dial and the credential to present.
 *
 * Done explicitly rather than left to `ProxyAgent`'s own URI parsing, which has
 * varied across undici majors in whether it reads userinfo at all. Building the
 * header here means the behavior is this package's, and is tested.
 *
 * The credential is `Proxy-Authorization`, not `Authorization`: it authenticates
 * to the proxy and must never reach GitHub, which is exactly the mistake a
 * hand-rolled proxy setup makes.
 */
export function splitProxyCredentials(proxyUrl: string): { uri: string; token?: string } {
  const parsed = new URL(proxyUrl);
  if (parsed.username === '' && parsed.password === '') return { uri: proxyUrl };

  // Decoded before encoding: a password with a `@` or a `:` has to be
  // percent-encoded to survive the URL, and sending the encoded form would
  // authenticate as the wrong credential.
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);

  parsed.username = '';
  parsed.password = '';

  return {
    uri: parsed.toString(),
    token: `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`,
  };
}

/**
 * Build the dispatcher for one resolved proxy (R11).
 *
 * Constructing a `ProxyAgent` opens **no socket** — it holds the address and
 * dials on first use — which is what keeps proxy support inside N2's "no I/O
 * during construction" even though the client builds this eagerly.
 */
export function createProxyAgent(target: ProxyTarget): ProxyAgent {
  const { uri, token } = splitProxyCredentials(target.url);
  return new ProxyAgent({ uri, ...(token === undefined ? {} : { token }) });
}

/**
 * Build the transport the fetch layer will actually issue through (R11).
 *
 * A `fetch` **and** a dispatcher, not a dispatcher alone. The platform global
 * `fetch` discards an init `dispatcher` — verified on Node 24, and the reason
 * PRD 0002's assumption A3 does not hold — so a seam that handed back only a
 * dispatcher would produce a client that reported itself as proxying and
 * connected direct. Which is [RK2](../README.md), the failure this whole design
 * exists to make impossible.
 *
 * `undici`'s own `fetch` does honor it, so binding one to the agent is the
 * transport. The dispatcher travels alongside for a host that injected its own
 * undici-based `fetch`.
 */
export function createProxyTransport(target: ProxyTarget): ProxyTransport {
  const agent = createProxyAgent(target);

  return {
    fetch: (input, init) =>
      // Cast at this one boundary: undici's `Response`/`RequestInit` and the
      // platform's are structurally the transport contract this layer defined
      // (`FetchLike`), but they are nominally distinct types.
      undiciFetch(input, { ...init, dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>,
    dispatcher: agent,
    // `close()` is synchronous on the client, and a pool that fails to drain is
    // not a failure the caller can act on — so the rejection is swallowed
    // rather than surfaced as an unhandled one.
    close: () => {
      void agent.close().catch(() => undefined);
    },
  };
}

/**
 * A proxy's showable form: its password replaced by `***` (R10).
 *
 * Re-exported from the fetch layer rather than reimplemented, so a CLI printing
 * a proxy and an error naming one redact by the same rule. A second
 * implementation is a second thing that can be wrong about a password.
 */
export { redactProxyUrl };
