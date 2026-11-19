/**
 * Bootstrap and dependency injection setup
 * @module bootstrap
 */

import { HttpService } from './services/http.service.js';
import { ReactionsClient } from './client/ReactionsClient.js';
import { loadConfig, validateConfig } from './utils/config.js';
import { setupLogger } from './utils/logger.js';
import type { Config } from './core/types.js';

/**
 * Create a configured ReactionsClient instance
 */
export async function createClient(config: Config = {}): Promise<ReactionsClient> {
  // Load and merge configuration
  const fullConfig: Config = { ...await loadConfig(), ...config };
  validateConfig(fullConfig);

  // Create logger
  const logger = setupLogger(fullConfig.logging);

  // Create HTTP service
  const httpService = new HttpService(fullConfig, logger);

  // Create and return reactions client
  return new ReactionsClient(httpService, logger);
}

/**
 * Factory function registered in the {@link Container}.
 */
export type ServiceFactory = () => unknown;

/**
 * Simple container for manual dependency management
 */
export class Container {
  services: Map<string, ServiceFactory>;

  constructor() {
    this.services = new Map();
  }

  register(name: string, factory: ServiceFactory): this {
    this.services.set(name, factory);
    return this;
  }

  resolve(name: string): unknown {
    const factory = this.services.get(name);
    if (!factory) {
      throw new Error(`Service not found: ${name}`);
    }
    return factory();
  }
}
