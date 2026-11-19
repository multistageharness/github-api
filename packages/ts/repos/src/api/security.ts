/**
 * @fileoverview Security API endpoints
 * @module api/security
 */

import { validateRepositoryName, validateUsername } from '../utils/validation.js';
import type { HTTPClient } from '../client/http.js';

export async function getSecurityAnalysis(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/security-analysis`);
}

export async function updateSecurityAnalysis(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  settings: Record<string, unknown>
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.patch(`/repos/${owner}/${repo}/security-analysis`, settings);
}

export async function getVulnerabilityAlerts(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{ enabled: boolean }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  try {
    await httpClient.get(`/repos/${owner}/${repo}/vulnerability-alerts`);
    return { enabled: true };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return { enabled: false };
    }
    throw error;
  }
}

export async function enableVulnerabilityAlerts(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.put(`/repos/${owner}/${repo}/vulnerability-alerts`);
}

export async function disableVulnerabilityAlerts(
  httpClient: HTTPClient,
  owner: string,
  repo: string
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.delete(`/repos/${owner}/${repo}/vulnerability-alerts`);
  return { message: 'Vulnerability alerts disabled' };
}
