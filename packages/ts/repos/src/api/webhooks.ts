/**
 * @fileoverview Webhooks API endpoints
 * @module api/webhooks
 */

import {
  validateRepositoryName,
  validateUsername,
  validateWebhookConfig,
  validatePagination
} from '../utils/validation.js';
import type { WebhookConfigData } from '../utils/validation.js';
import type { HTTPClient } from '../client/http.js';

/**
 * Listing options for webhooks.
 */
export interface WebhookListOptions {
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

/**
 * Data accepted by create.
 */
export interface WebhookData {
  name?: string;
  config: WebhookConfigData;
  events?: string[];
  active?: boolean;
}

/**
 * Updates accepted by update.
 */
export interface WebhookUpdates {
  config?: WebhookConfigData;
  [key: string]: unknown;
}

export async function list(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  options: WebhookListOptions = {}
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validatePagination(options);

  const params = new URLSearchParams({
    page: String(options.page || 1),
    per_page: String(Math.min(options.per_page || 30, 100))
  });

  return await httpClient.get(`/repos/${owner}/${repo}/hooks?${params.toString()}`);
}

export async function get(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  hookId: string | number
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.get(`/repos/${owner}/${repo}/hooks/${hookId}`);
}

export async function create(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  webhookData: WebhookData
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);
  validateWebhookConfig(webhookData.config);

  const payload = {
    name: webhookData.name || 'web',
    config: webhookData.config,
    events: webhookData.events || ['push'],
    active: webhookData.active !== false
  };

  return await httpClient.post(`/repos/${owner}/${repo}/hooks`, payload);
}

export async function update(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  hookId: string | number,
  updates: WebhookUpdates
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  if (updates.config) {
    validateWebhookConfig(updates.config);
  }

  return await httpClient.patch(`/repos/${owner}/${repo}/hooks/${hookId}`, updates);
}

export async function deleteHook(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  hookId: string | number
): Promise<{ message: string }> {
  validateUsername(owner);
  validateRepositoryName(repo);

  await httpClient.delete(`/repos/${owner}/${repo}/hooks/${hookId}`);
  return { message: 'Webhook deleted successfully' };
}

export async function test(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  hookId: string | number
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.post(`/repos/${owner}/${repo}/hooks/${hookId}/tests`);
}

export async function ping(
  httpClient: HTTPClient,
  owner: string,
  repo: string,
  hookId: string | number
): Promise<unknown> {
  validateUsername(owner);
  validateRepositoryName(repo);

  return await httpClient.post(`/repos/${owner}/${repo}/hooks/${hookId}/pings`);
}
