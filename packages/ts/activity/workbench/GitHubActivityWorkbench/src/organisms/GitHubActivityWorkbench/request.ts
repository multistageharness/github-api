import type { BuiltRequest, Capability, FieldValues } from './types';

/* ---------------------------------------------------------------------------
 * Pure helpers — no React, no I/O. Unit-testable in isolation.
 * ------------------------------------------------------------------------- */
export function authScheme(token: string): 'Bearer' | 'token' | null {
  if (!token) return null;
  if (/^(ghp_|github_pat_|ghs_)/.test(token)) return 'Bearer';
  if (/^[0-9a-f]{40}$/i.test(token)) return 'token';
  return 'Bearer';
}

export function tokenLooksValid(token: string): boolean {
  if (!token) return false;
  return (
    (token.startsWith('ghp_') && token.length === 40) ||
    token.startsWith('ghs_') ||
    token.startsWith('github_pat_') ||
    /^[0-9a-f]{40}$/i.test(token)
  );
}

export function clampPerPage(value: unknown, max: number): number | unknown {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return Math.min(Math.max(n, 1), max);
}

/** datetime-local → ISO-8601 UTC. */
export function toIso(local: unknown): string | undefined {
  if (!local) return undefined;
  const d = new Date(local as string);
  return Number.isNaN(d.getTime()) ? (local as string) : d.toISOString();
}

export function parseLink(header: string | null): Record<string, string> | null {
  if (!header) return null;
  const out: Record<string, string> = {};
  header.split(',').forEach((part) => {
    const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  });
  return Object.keys(out).length ? out : null;
}

export function authHeaders(token: string, accept?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const scheme = authScheme(token);
  if (scheme) h.Authorization = `${scheme} ${token}`;
  return h;
}

/** Compose a concrete request from a capability + the current field values. */
export function buildRequest(cap: Capability, values: FieldValues, baseUrl: string): BuiltRequest {
  let path = cap.path;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = {};
  let accept = 'application/vnd.github+json';
  const issues: string[] = [];

  for (const p of cap.params) {
    let v: unknown = values[p.name];

    if (p.in === 'path') {
      if (v === undefined || v === '' || v === null) {
        issues.push(p.name);
        v = `{${p.name}}`;
      }
      path = path.replace(`{${p.name}}`, encodeURIComponent(v as string));
      continue;
    }

    if (v === undefined || v === '' || v === null || v === false) continue;

    if (p.in === 'query') {
      if (p.name === 'per_page' && p.max) v = clampPerPage(v, p.max);
      if (p.type === 'date') v = toIso(v);
      query.set(p.name, p.type === 'boolean' ? 'true' : String(v));
    } else if (p.in === 'body') {
      body[p.name] = p.type === 'date' ? toIso(v) : v;
    } else if (p.in === 'accept' && v === true && p.value) {
      accept = p.value;
    }
  }

  if (cap.fixedBody) Object.assign(body, cap.fixedBody);

  const qs = query.toString();
  const url = `${baseUrl.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`;
  const hasBody = ['PUT', 'PATCH', 'POST'].includes(cap.method) && Object.keys(body).length > 0;

  return { url, path, qs, body, hasBody, accept, missing: issues };
}
