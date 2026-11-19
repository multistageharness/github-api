/**
 * @fileoverview Query-string helpers. Faithful TypeScript port of the source
 * `utils/query.mjs`.
 * @module utils/query
 */

export function buildQueryString(params: Record<string, unknown> = {}): string {
  const filteredParams = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return filteredParams.length > 0 ? `?${filteredParams.join('&')}` : '';
}

export function parseQueryString(queryString: string): Record<string, string> {
  if (!queryString) return {};

  const params: Record<string, string> = {};
  const searchParams = new URLSearchParams(queryString);

  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  return params;
}

export function mergeParams(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
  };
}
