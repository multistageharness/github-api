import { Icon } from '../../../atoms/Icon';
import { StatusDot } from '../../../atoms/StatusDot';
import { StatusPill } from '../../../molecules/StatusPill';
import type { Whoami } from '../types';

export interface TopBarProps {
  token: string;
  onTokenChange: (token: string) => void;
  baseUrl: string;
  onBaseUrlChange: (baseUrl: string) => void;
  /** Token is present but does not look like a GitHub PAT. */
  tokenWarn: boolean;
  /** A whoami probe is in flight. */
  testing: boolean;
  whoami: Whoami;
  onTestToken: () => void;
}

/**
 * Part — session header: the API base URL, the in-memory token, and the
 * whoami probe that verifies it. Owns no state; every value is a prop.
 */
export function TopBar({
  token,
  onTokenChange,
  baseUrl,
  onBaseUrlChange,
  tokenWarn,
  testing,
  whoami,
  onTestToken,
}: TopBarProps) {
  return (
    <header>
      <h1>Activity API Workbench</h1>

      <label>
        <span>Base URL</span>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder="https://api.github.com"
        />
      </label>

      <label>
        <span>Token</span>
        <input
          type="password"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="ghp_…"
          autoComplete="off"
        />
      </label>

      {tokenWarn && (
        <span role="status">
          <StatusDot tone="warn" />
          Token does not look like a GitHub PAT
        </span>
      )}

      <button type="button" onClick={onTestToken} disabled={testing || !token}>
        {testing ? <Icon name="spinner" spin /> : null}
        {testing ? 'Testing…' : 'Test token'}
      </button>

      {whoami &&
        (whoami.ok ? (
          <StatusPill tone="ok" label={whoami.login ? `@${whoami.login}` : 'Authenticated'} />
        ) : (
          <StatusPill tone="error" label={whoami.msg} />
        ))}
    </header>
  );
}
