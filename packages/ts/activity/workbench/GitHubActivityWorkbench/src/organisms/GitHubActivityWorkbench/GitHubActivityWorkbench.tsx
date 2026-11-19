import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFeatureFlag } from '../../featureFlags/useFeatureFlag';
import { CAPABILITIES, MODULES } from './capabilities';
import { authHeaders, buildRequest, parseLink, tokenLooksValid } from './request';
import type {
  ApiErrorShape,
  BuiltRequest,
  FieldValue,
  FieldValues,
  RequestResult,
  Whoami,
} from './types';
import { TopBar } from './parts/TopBar';
import { CapabilityNav } from './parts/CapabilityNav';
import { RequestForm } from './parts/RequestForm';
import { ResponsePanel } from './parts/ResponsePanel';
import { ConfirmDialog } from './parts/ConfirmDialog';
import styles from './GitHubActivityWorkbench.module.css';

export interface GitHubActivityWorkbenchProps {
  /** Initial base URL for the GitHub API (default: https://api.github.com). */
  initialBaseUrl?: string;
  /** Seed token (memory only). Mainly for stories/examples. */
  initialToken?: string;
  /** Mandatory top-level visibility gate. */
  featureFlag?: string;
  featureFlagFallback?: ReactNode;
}

/**
 * Organism — a single-user, in-memory testing harness for the GitHub Activity
 * SDK. The composition root: owns all session state and the live request
 * pipeline, and delegates rendering to its private `parts/`.
 *
 * Note: as a live-API workbench this organism intentionally owns its fetch I/O
 * (that is its domain), but every request is driven entirely by props/state —
 * there is no hidden data source.
 */
export function GitHubActivityWorkbench({
  initialBaseUrl = 'https://api.github.com',
  initialToken = '',
  featureFlag,
  featureFlagFallback = null,
}: GitHubActivityWorkbenchProps) {
  const visible = useFeatureFlag(featureFlag);

  const [token, setToken] = useState(initialToken);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [selectedId, setSelectedId] = useState('client.getRateLimit');
  const [values, setValues] = useState<FieldValues>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [whoami, setWhoami] = useState<Whoami>(null);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MODULES.map((m) => [m, true])),
  );

  const cap = useMemo(() => CAPABILITIES.find((c) => c.id === selectedId)!, [selectedId]);

  // Seed example defaults whenever the capability changes.
  useEffect(() => {
    const seed: FieldValues = {};
    for (const p of cap.params) {
      if (p.in === 'path' && p.eg) seed[p.name] = p.eg;
      if (p.default !== undefined) seed[p.name] = p.default as FieldValue;
    }
    setValues(seed);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const request = useMemo<BuiltRequest>(
    () => buildRequest(cap, values, baseUrl),
    [cap, values, baseUrl],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CAPABILITIES.filter(
      (c) =>
        !q ||
        c.label.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.path.toLowerCase().includes(q),
    );
  }, [search]);

  function setVal(name: string, v: FieldValue) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function execute(req: BuiltRequest = request) {
    setBusy(true);
    setResult(null);
    const started = performance.now();
    try {
      const init: RequestInit = { method: cap.method, headers: authHeaders(token, req.accept) };
      if (req.hasBody) {
        init.body = JSON.stringify(req.body);
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }
      const res = await fetch(req.url, init);
      const duration = Math.round(performance.now() - started);

      const rl = {
        limit: res.headers.get('x-ratelimit-limit'),
        remaining: res.headers.get('x-ratelimit-remaining'),
        reset: res.headers.get('x-ratelimit-reset'),
        used: res.headers.get('x-ratelimit-used'),
        resource: res.headers.get('x-ratelimit-resource'),
      };
      const link = parseLink(res.headers.get('link'));

      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;

      // Read-back interpretation for special capabilities.
      let interpreted: string | null = null;
      if (cap.interpret === 'starred') {
        interpreted =
          res.status === 204 ? '⭐ Starred' : res.status === 404 ? 'Not starred' : `status ${res.status}`;
      }
      if (cap.interpret === 'stargazers_count' && obj) interpreted = `${obj.stargazers_count} stargazers`;
      if (cap.interpret === 'subscribers_count' && obj) interpreted = `${obj.subscribers_count} watchers`;

      // Error classification (mirrors SDK error taxonomy).
      let error: ApiErrorShape | null = null;
      const treatAsError =
        (!res.ok && res.status !== 404) ||
        (res.status === 404 && cap.interpret !== 'starred' && !cap.allow404);
      if (treatAsError && !res.ok) {
        const isRate = res.status === 403 && rl.remaining === '0';
        error = {
          kind: isRate
            ? 'RateLimitError'
            : res.status === 401
              ? 'AuthenticationError'
              : res.status === 404
                ? 'NotFoundError'
                : res.status === 422
                  ? 'ValidationError'
                  : res.status >= 500
                    ? 'ServerError'
                    : 'APIError',
          statusCode: res.status,
          message: (obj?.message as string) || res.statusText,
          errors: (obj?.errors as Array<Record<string, unknown>>) || [],
          documentationUrl: (obj?.documentation_url as string) || null,
          resetTime:
            isRate && rl.reset ? new Date(Number(rl.reset) * 1000).toLocaleTimeString() : null,
        };
      }

      setResult({
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        body,
        rl,
        link,
        duration,
        interpreted,
        error,
      });
    } catch (e) {
      setResult({
        networkError: String((e as Error)?.message || e),
        duration: Math.round(performance.now() - started),
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  function onSubmit() {
    if (cap.mutating) {
      setConfirming(true);
      return;
    }
    void execute();
  }

  async function testToken() {
    setTesting(true);
    setWhoami(null);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/user`, { headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as Record<string, string> | null;
      setWhoami(
        res.ok
          ? { ok: true, login: body?.login, avatar: body?.avatar_url }
          : { ok: false, msg: `${res.status} ${body?.message || res.statusText}` },
      );
    } catch (e) {
      setWhoami({ ok: false, msg: String((e as Error)?.message || e) });
    } finally {
      setTesting(false);
    }
  }

  if (!visible) return <>{featureFlagFallback}</>;

  const tokenWarn = !!token && !tokenLooksValid(token);

  return (
    <div className={styles.app}>
      <TopBar
        token={token}
        onTokenChange={(t) => {
          setToken(t);
          setWhoami(null);
        }}
        baseUrl={baseUrl}
        onBaseUrlChange={setBaseUrl}
        tokenWarn={tokenWarn}
        testing={testing}
        whoami={whoami}
        onTestToken={() => void testToken()}
      />

      <div className={styles.main}>
        <CapabilityNav
          modules={MODULES}
          items={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={search}
          onSearchChange={setSearch}
          openGroups={openGroups}
          onToggleGroup={(m) => setOpenGroups((g) => ({ ...g, [m]: !g[m] }))}
        />

        <RequestForm
          cap={cap}
          values={values}
          onChange={setVal}
          request={request}
          busy={busy}
          onSubmit={onSubmit}
        />

        <ResponsePanel result={result} />
      </div>

      {confirming && cap.mutating && (
        <ConfirmDialog
          cap={cap}
          request={request}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void execute()}
        />
      )}
    </div>
  );
}
