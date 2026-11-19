import { RateLimitChips } from '../../../molecules/RateLimitChips';
import { StatusPill } from '../../../molecules/StatusPill';
import type { RequestResult } from '../types';

export interface ResponsePanelProps {
  /** `null` before the first request of the current capability. */
  result: RequestResult | null;
}

/** Pretty-print a decoded body; fall back to `String` for non-JSON payloads. */
function renderBody(body: unknown): string {
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

/**
 * Part — the outcome of the last request: transport status, rate-limit
 * snapshot, pagination links, decoded body, and any structured API error.
 */
export function ResponsePanel({ result }: ResponsePanelProps) {
  if (!result) {
    return (
      <section aria-label="Response">
        <p>No response yet.</p>
      </section>
    );
  }

  if (result.networkError) {
    return (
      <section aria-label="Response">
        <StatusPill tone="error" label={`Network error: ${result.networkError}`} />
        <p>{result.duration} ms</p>
      </section>
    );
  }

  return (
    <section aria-label="Response">
      <StatusPill
        tone={result.ok ? 'ok' : 'error'}
        label={`${result.status ?? '—'} ${result.statusText ?? ''}`.trim()}
      />
      <span>{result.duration} ms</span>

      {result.interpreted && <p>{result.interpreted}</p>}

      <RateLimitChips rl={result.rl} />

      {result.link && (
        <ul aria-label="Pagination links">
          {Object.entries(result.link).map(([rel, url]) => (
            <li key={rel}>
              <span>{rel}</span>
              <code>{url}</code>
            </li>
          ))}
        </ul>
      )}

      {result.error && (
        <div role="alert">
          <strong>{result.error.kind}</strong>
          <span>{result.error.message}</span>
          {result.error.documentationUrl && (
            <a href={result.error.documentationUrl} target="_blank" rel="noreferrer">
              Documentation
            </a>
          )}
        </div>
      )}

      {result.body !== undefined && result.body !== null && (
        <pre>
          <code>{renderBody(result.body)}</code>
        </pre>
      )}
    </section>
  );
}
