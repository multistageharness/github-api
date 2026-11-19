/**
 * @fileoverview Repository rules API endpoints
 * @module api/rules
 */

import { validateRepositoryName, validateUsername, validatePagination } from '../utils/validation.js';
import type { HTTPClient } from '../client/http.js';

/**
 * Listing options for rulesets.
 */
export interface RulesetListOptions {
  includes_parents?: boolean;
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

export async function listRulesets(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: RulesetListOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validatePagination(options);

  const params = new URLSearchParams({
    includes_parents: options.includes_parents === true ? 'true' : 'false',
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/repos/${owner}/${repo}/rulesets?${params.toString()}`);
}

export async function getRuleset(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  rulesetId: string | number
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/rulesets/${rulesetId}`);
}

export async function createRuleset(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  rulesetData: Record<string, unknown>
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.post(`/repos/${owner}/${repo}/rulesets`, rulesetData);
}

export async function updateRuleset(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  rulesetId: string | number,
  updates: Record<string, unknown>
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.put(`/repos/${owner}/${repo}/rulesets/${rulesetId}`, updates);
}

export async function deleteRuleset(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  rulesetId: string | number
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.delete(`/repos/${owner}/${repo}/rulesets/${rulesetId}`);
  return { message: 'Ruleset deleted successfully' };
}
